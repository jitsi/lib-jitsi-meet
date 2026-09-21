import { getLogger } from '@jitsi/logger';

import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import browser from '../browser';
import Deferred from '../util/Deferred';

const logger = getLogger('e2ee:RNKeyHandler');

// Flag to set on senders / receivers to avoid setting up the frame cryptor
// more than once.
const kJitsiE2EE = Symbol('kJitsiE2EE');

// The native frame cryptors use a key index in the range [0, MAX_KEY_INDEX - 1].
const MAX_KEY_INDEX = 16;

/**
 * Lazily loads the react-native-webrtc module, which exposes the E2EE frame cryptor API.
 *
 * This must only be called on React Native: the module doesn't exist on web, so it is
 * declared as an external in the webpack config and require()d at runtime instead of
 * being imported statically.
 *
 * @returns {object} The react-native-webrtc module.
 */
function getRNWebrtc() {
    return require('react-native-webrtc');
}

/**
 * This module integrates E2E encryption with {@link JitsiConference} on React Native.
 *
 * Unlike {@link KeyHandler} (used on web) it does not rely on insertable streams and a
 * Web Worker, which require DOM APIs absent on React Native. Instead it manages native
 * frame cryptors through the API exposed by the react-native-webrtc fork.
 *
 * It implements the externally managed (shared key) model: a single passphrase, set by
 * the application, is applied to all senders and receivers.
 */
export class RNKeyHandler {
    /**
     * Build a new RNKeyHandler instance, which will be used in a given conference.
     * @param {JitsiConference} conference - the current conference.
     */
    constructor(conference) {
        this.conference = conference;

        this.enabled = false;
        this._enabling = undefined;
        this._firstEnable = false;

        // The current key: { passphrase: string, index: number }, or undefined if not set yet.
        this._key = undefined;

        // Counter used to generate key indexes when the application doesn't provide one.
        this._keyIndexCounter = -1;

        // Registry of the attached frame cryptors:
        // "${peerConnectionId}:${senderOrReceiverId}" ->
        //     { cryptorId: string|undefined, type: 'sender'|'receiver', kind: string,
        //       participantId: string|undefined, queue: Promise }
        // Operations on each cryptor are serialized through its "queue" promise chain.
        this._cryptors = new Map();

        this._onMediaSessionStartedBound = this._onMediaSessionStarted.bind(this);
        this._onLocalTrackAddedBound = track => track.isLocal() && this._onLocalTrackAdded(track);
        this._onRemoteTrackAddedBound = (track, tpc) => this._setupReceiverE2EEForTrack(tpc, track);
        this._trackMuteChangedBound = this._trackMuteChanged.bind(this);
        this._onParticipantLeftBound = this._onParticipantLeft.bind(this);
        this._cleanupBound = this._cleanup.bind(this);

        // Conference media events in order to attach the encryptor / decryptor.
        // FIXME add events to TraceablePeerConnection which will allow to see when there's new receiver or sender
        // added instead of shenanigans around conference track events and track muted.
        //
        this.conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            this._onMediaSessionStartedBound);
        this.conference.on(
            JitsiConferenceEvents.TRACK_ADDED,
            this._onLocalTrackAddedBound);
        this.conference.rtc.on(
            RTCEvents.REMOTE_TRACK_ADDED,
            this._onRemoteTrackAddedBound);
        this.conference.on(
            JitsiConferenceEvents.TRACK_MUTE_CHANGED,
            this._trackMuteChangedBound);
        this.conference.on(
            JitsiConferenceEvents.USER_LEFT,
            this._onParticipantLeftBound);
        this.conference.on(
            JitsiConferenceEvents.CONFERENCE_LEFT,
            this._cleanupBound);
        this.conference.on(
            JitsiConferenceEvents.CONFERENCE_FAILED,
            this._cleanupBound);
    }

    /**
     * Indicates whether E2EE is currently enabled or not.
     *
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Enables / disables End-To-End encryption.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     */
    async setEnabled(enabled) {
        this._enabling && await this._enabling;

        if (enabled === this.enabled) {
            return;
        }

        this._enabling = new Deferred();

        this.enabled = enabled;

        // Advertise E2EE support so other participants know we have it enabled.
        this.conference.setLocalParticipantProperty('e2ee.enabled', enabled);

        if (enabled) {
            this._firstEnable = true;

            // On React Native the media sessions don't need to be restarted: the native
            // frame cryptors are attached to the already existing senders and receivers.
            this._setupExistingSessions();
        }

        this._setEnabledOnAllCryptors(enabled);

        this._enabling.resolve();
    }

    /**
     * Sets the key and index for End-to-End encryption. The key is a passphrase string
     * from which the native side derives the actual encryption key. It is applied to all
     * known frame cryptors; cryptors attached later inherit it at attach time.
     *
     * @param {string} [keyInfo.encryptionKey] - the passphrase.
     * @param {Number} [keyInfo.index] - the index of the encryption key. If not provided,
     * one is generated by incrementing a counter (mod MAX_KEY_INDEX, starting at 0).
     * @returns {void}
     */
    setKey(keyInfo) {
        const encryptionKey = keyInfo?.encryptionKey;

        if (typeof encryptionKey !== 'string' || encryptionKey.length === 0) {
            logger.warn('setKey: a non-empty passphrase string is required');

            return;
        }

        let index = keyInfo.index;

        if (typeof index === 'number' && index >= 0) {
            // Keep the counter in sync so auto-generated indexes don't reuse it right away.
            this._keyIndexCounter = index % MAX_KEY_INDEX;
        } else {
            this._keyIndexCounter = (this._keyIndexCounter + 1) % MAX_KEY_INDEX;
            index = this._keyIndexCounter;
        }

        this._key = { index, passphrase: encryptionKey };

        for (const [ registryKey, entry ] of this._cryptors) {
            this._enqueueCryptorOperation(registryKey, entry, async () => {
                if (entry.cryptorId) {
                    await getRNWebrtc().e2eeFrameCryptorSetKey(entry.cryptorId, index, encryptionKey);
                }
            });
        }
    }

    /**
     * Attaches a native frame cryptor to the given sender or receiver, applying the current
     * key (if set) and enabled state. The operation is serialized with any other operation
     * on the same cryptor and is idempotent.
     *
     * @param {RTCRtpSender|RTCRtpReceiver} senderOrReceiver - the sender / receiver to attach to.
     * @param {string} type - 'sender' or 'receiver'.
     * @param {string} kind - the kind of the track ('audio' or 'video').
     * @param {string} participantId - the participant the sender / receiver belongs to.
     * @private
     */
    _attachCryptor(senderOrReceiver, type, kind, participantId) {
        if (senderOrReceiver[kJitsiE2EE]) {
            return;
        }

        const peerConnectionId = senderOrReceiver._peerConnectionId;
        const rtpId = senderOrReceiver._id;
        const registryKey = `${peerConnectionId}:${rtpId}`;

        if (typeof peerConnectionId !== 'number' || typeof rtpId !== 'string' || this._cryptors.has(registryKey)) {
            return;
        }

        senderOrReceiver[kJitsiE2EE] = true;

        const entry = {
            cryptorId: undefined,
            kind,
            participantId,
            type,
            queue: Promise.resolve()
        };

        this._cryptors.set(registryKey, entry);

        this._enqueueCryptorOperation(registryKey, entry, async () => {
            try {
                const rnWebrtc = getRNWebrtc();

                entry.cryptorId = await rnWebrtc.e2eeCreateFrameCryptor(peerConnectionId, type, rtpId);

                if (this._key) {
                    await rnWebrtc.e2eeFrameCryptorSetKey(entry.cryptorId, this._key.index, this._key.passphrase);
                }

                await rnWebrtc.e2eeFrameCryptorSetEnabled(entry.cryptorId, this.enabled);

                logger.debug(`Attached ${type} frame cryptor for ${kind} (${registryKey})`);
            } catch (error) {
                // If the cryptor was created but applying the key / enabled state failed,
                // dispose it so the native side doesn't leak.
                if (entry.cryptorId) {
                    try {
                        await getRNWebrtc().e2eeFrameCryptorDispose(entry.cryptorId);
                    } catch (e) {
                        // Ignore, we are already handling a failure.
                    }
                    entry.cryptorId = undefined;
                }

                // Allow a later event (e.g. a new session or track) to retry the attachment.
                this._cryptors.delete(registryKey);
                delete senderOrReceiver[kJitsiE2EE];
                throw error;
            }
        });
    }

    /**
     * Disposes the frame cryptor associated with the given registry key.
     *
     * @param {string} registryKey - the key of the cryptor in the registry.
     * @private
     */
    _disposeCryptor(registryKey) {
        const entry = this._cryptors.get(registryKey);

        if (!entry) {
            return;
        }

        this._cryptors.delete(registryKey);

        this._enqueueCryptorOperation(registryKey, entry, async () => {
            if (entry.cryptorId) {
                await getRNWebrtc().e2eeFrameCryptorDispose(entry.cryptorId);
            }
        });
    }

    /**
     * Serializes the given operation with any other operations on the same cryptor.
     *
     * @param {string} registryKey - the key of the cryptor in the registry.
     * @param {object} entry - the cryptor registry entry.
     * @param {Function} operation - the operation to perform.
     * @returns {Promise}
     * @private
     */
    _enqueueCryptorOperation(registryKey, entry, operation) {
        entry.queue = entry.queue.then(operation).catch(error => {
            logger.error(`Frame cryptor operation failed for ${registryKey}: ${error}`);
        });

        return entry.queue;
    }

    /**
     * Applies the given enabled state to all known frame cryptors.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @private
     */
    _setEnabledOnAllCryptors(enabled) {
        for (const [ registryKey, entry ] of this._cryptors) {
            this._enqueueCryptorOperation(registryKey, entry, async () => {
                if (entry.cryptorId) {
                    await getRNWebrtc().e2eeFrameCryptorSetEnabled(entry.cryptorId, enabled);
                }
            });
        }
    }

    /**
     * Attaches frame cryptors to all senders and receivers of the already existing media
     * sessions (JVB and P2P).
     *
     * @private
     */
    _setupExistingSessions() {
        for (const session of this.conference.getMediaSessions()) {
            const tpc = session.peerconnection;
            const pc = tpc?.peerconnection;

            if (typeof pc?.getSenders !== 'function' || typeof pc?.getReceivers !== 'function') {
                continue;
            }

            // Map the raw tracks to their JitsiRemoteTrack in order to learn the participant id.
            const remoteTracks = typeof tpc.getRemoteTracks === 'function' ? tpc.getRemoteTracks() : [];

            for (const sender of pc.getSenders()) {
                if (!sender.track) {
                    continue;
                }

                this._attachCryptor(sender, 'sender', sender.track.kind, this.conference.myUserId());
            }

            for (const receiver of pc.getReceivers()) {
                if (!receiver.track) {
                    continue;
                }

                const remoteTrack = remoteTracks.find(track => track.track === receiver.track);

                this._attachCryptor(receiver, 'receiver', receiver.track.kind, remoteTrack?.getParticipantId());
            }
        }
    }

    /**
     * Setup E2EE on the new track that has been added to the conference, apply it on all the open peerconnections.
     * @param {JitsiLocalTrack} track - the new track that's being added to the conference.
     * @private
     */
    _onLocalTrackAdded(track) {
        for (const session of this.conference.getMediaSessions()) {
            this._setupSenderE2EEForTrack(session, track);
        }
    }

    /**
     * Setups E2E encryption for the new session.
     * @param {JingleSessionPC} session - the new media session.
     * @private
     */
    _onMediaSessionStarted(session) {
        const localTracks = this.conference.getLocalTracks();

        for (const track of localTracks) {
            this._setupSenderE2EEForTrack(session, track);
        }
    }

    /**
     * Disposes the frame cryptors of the receiving side when a participant leaves.
     *
     * @param {string} id - the id of the participant that just left.
     * @private
     */
    _onParticipantLeft(id) {
        for (const [ registryKey, entry ] of [ ...this._cryptors ]) {
            if (entry.type === 'receiver' && entry.participantId === id) {
                this._disposeCryptor(registryKey);
            }
        }
    }

    /**
     * Setup E2EE for the receiving side.
     *
     * @private
     */
    _setupReceiverE2EEForTrack(tpc, track) {
        if (!this.enabled && !this._firstEnable) {
            return;
        }

        const receiver = tpc.findReceiverForTrack(track.track);

        if (receiver) {
            this._attachCryptor(receiver, 'receiver', track.getType(), track.getParticipantId());
        } else {
            logger.warn(`Could not handle E2EE for ${track}: receiver not found in: ${tpc}`);
        }
    }

    /**
     * Setup E2EE for the sending side.
     *
     * @param {JingleSessionPC} session - the session which sends the media produced by the track.
     * @param {JitsiLocalTrack} track - the local track for which e2e encoder will be configured.
     * @private
     */
    _setupSenderE2EEForTrack(session, track) {
        if (!this.enabled && !this._firstEnable) {
            return;
        }

        const pc = session.peerconnection;
        const sender = pc && pc.findSenderForTrack(track.track);

        if (sender) {
            this._attachCryptor(sender, 'sender', track.getType(), track.getParticipantId());
        } else {
            logger.warn(`Could not handle E2EE for ${track}: sender not found in ${pc}`);
        }
    }

    /**
     * Setup E2EE on the sender that is created for the unmuted local video track.
     * @param {JitsiLocalTrack} track - the track for which muted status has changed.
     * @private
     */
    _trackMuteChanged(track) {
        if (browser.doesVideoMuteByStreamRemove() && track.isLocal() && track.isVideoTrack() && !track.isMuted()) {
            for (const session of this.conference.getMediaSessions()) {
                this._setupSenderE2EEForTrack(session, track);
            }
        }
    }

    /**
     * Disposes all frame cryptors and unregisters the conference event listeners. Called
     * when the conference is left or fails.
     *
     * @private
     */
    _cleanup() {
        this.conference.off(JitsiConferenceEvents._MEDIA_SESSION_STARTED, this._onMediaSessionStartedBound);
        this.conference.off(JitsiConferenceEvents.TRACK_ADDED, this._onLocalTrackAddedBound);
        this.conference.rtc?.off(RTCEvents.REMOTE_TRACK_ADDED, this._onRemoteTrackAddedBound);
        this.conference.off(JitsiConferenceEvents.TRACK_MUTE_CHANGED, this._trackMuteChangedBound);
        this.conference.off(JitsiConferenceEvents.USER_LEFT, this._onParticipantLeftBound);
        this.conference.off(JitsiConferenceEvents.CONFERENCE_LEFT, this._cleanupBound);
        this.conference.off(JitsiConferenceEvents.CONFERENCE_FAILED, this._cleanupBound);

        for (const registryKey of this._cryptors.keys()) {
            this._disposeCryptor(registryKey);
        }
    }
}
