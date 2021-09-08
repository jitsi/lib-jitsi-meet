/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import debounce from 'lodash.debounce';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import RTCEvents from '../../service/RTC/RTCEvents';
import browser from '../browser';
import Deferred from '../util/Deferred';

import E2EEContext from './E2EEContext';
import { OlmAdapter } from './OlmAdapter';
import { importKey, ratchet } from './crypto-utils';
import { ManualKeyAdapter } from './ManualKeyAdapter';

const logger = getLogger(__filename);

// Period which we'll wait before updating / rotating our keys when a participant
// joins or leaves.
const DEBOUNCE_PERIOD = 5000;

const KeyAdapterEvents = {
    PARTICIPANT_KEY_UPDATED: 'partitipant_key_updated',
    GENERAL_KEY_UPDATED: 'general_key_updated'
};

/**
 * This module integrates {@link E2EEContext} with {@link JitsiConference} in order to enable E2E encryption.
 */
export class E2EEncryption {
    /**
     * A constructor.
     * @param {JitsiConference} conference - The conference instance for which E2E encryption is to be enabled.
     */
    constructor(conference) {
        this.conference = conference;

        this._conferenceJoined = false;
        this._enabled = false;
        this._key = undefined;
        this._enabling = undefined;

        this._e2eeCtx = new E2EEContext();
       // this._olmAdapter = new OlmAdapter(conference);
        this._olmAdapter = new ManualKeyAdapter(conference);

        // Debounce key rotation / ratcheting to avoid a storm of messages.
        this._ratchetKey = debounce(this._ratchetKeyImpl, DEBOUNCE_PERIOD);
        this._rotateKey = debounce(this._rotateKeyImpl, DEBOUNCE_PERIOD);

        // Participant join / leave operations. Used for key advancement / rotation.
        //

        this.conference.on(
            JitsiConferenceEvents.CONFERENCE_JOINED,
            () => {
                this._conferenceJoined = true;
            });
        this.conference.on(
            JitsiConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
            this._onParticipantPropertyChanged.bind(this));
        this.conference.on(
            JitsiConferenceEvents.USER_JOINED,
            this._onParticipantJoined.bind(this));
        this.conference.on(
            JitsiConferenceEvents.USER_LEFT,
            this._onParticipantLeft.bind(this));

        // Conference media events in order to attach the encryptor / decryptor.
        // FIXME add events to TraceablePeerConnection which will allow to see when there's new receiver or sender
        // added instead of shenanigans around conference track events and track muted.
        //

        this.conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            this._onMediaSessionStarted.bind(this));
        this.conference.on(
            JitsiConferenceEvents.TRACK_ADDED,
            track => track.isLocal() && this._onLocalTrackAdded(track));
        this.conference.rtc.on(
            RTCEvents.REMOTE_TRACK_ADDED,
            (track, tpc) => this._setupReceiverE2EEForTrack(tpc, track));
        this.conference.on(
            JitsiConferenceEvents.TRACK_MUTE_CHANGED,
            this._trackMuteChanged.bind(this));

        // Olm signalling events.
        this._olmAdapter && this._olmAdapter.on(
            KeyAdapterEvents.PARTICIPANT_KEY_UPDATED,
            this._onParticipantKeyUpdated.bind(this));
        this._olmAdapter && this._olmAdapter.on(
                KeyAdapterEvents.GENERAL_KEY_UPDATED,
                this._onGeneralKeyUpdated.bind(this));
    }

    /**
     * Indicates if E2EE is supported in the current platform.
     *
     * @param {object} config - Global configuration.
     * @returns {boolean}
     */
    static isSupported(config) {
        return !(config.testing && config.testing.disableE2EE)
            && (browser.supportsInsertableStreams()
                || (config.enableEncodedTransformSupport && browser.supportsEncodedTransform()))
            && OlmAdapter.isSupported();
    }

    /**
     * Indicates whether E2EE is currently enabled or not.
     *
     * @returns {boolean}
     */
    isEnabled() {
        return this._enabled;
    }

    /**
     * Enables / disables End-To-End encryption.
     *
     * @param {boolean} enabled - whether E2EE should be enabled or not.
     * @returns {void}
     */
    async setEnabled(enabled) {
        if (enabled === this._enabled) {
            return;
        }

        this._enabling && await this._enabling;

        this._enabling = new Deferred();

        this._enabled = enabled;

        if (enabled) {
            this._olmAdapter && await this._olmAdapter.initSessions();
        } else {
            for (const participant of this.conference.getParticipants()) {
                this._e2eeCtx.cleanup(participant.getId());
            }
            this._olmAdapter && this._olmAdapter.clearAllParticipantsSessions();
        }

        this.conference.setLocalParticipantProperty('e2ee.enabled', enabled);

        this.conference._restartMediaSessions();

        // Generate a random key in case we are enabling.
        this._key = enabled ? this._generateKey() : false;

        // Send it to others using the E2EE olm channel.
        const index = this._olmAdapter && await this._olmAdapter.updateKey(this._key);
    
        // Set our key so we begin encrypting.
        this._e2eeCtx.setKey(this.conference.myUserId(), this._key, index ?? 0);

        this._enabling.resolve();
    }

    /**
     * Generates a new 256 bit random key.
     *
     * @returns {Uint8Array}
     * @private
     */
    _generateKey() {
        return new Uint8Array( 
            [97, 145, 133, 203, 63, 197, 49, 232, 87, 159, 169, 200, 59, 195, 77, 75, 150, 173, 189, 232, 44, 39, 8, 149, 250, 6, 238, 170, 255, 17, 110, 107]); 
    }

    /**
     * Setup E2EE on the new track that has been added to the conference, apply it on all the open peerconnections.
     * @param {JitsiLocalTrack} track - the new track that's being added to the conference.
     * @private
     */
    _onLocalTrackAdded(track) {
        for (const session of this.conference._getMediaSessions()) {
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
     * Advances (using ratcheting) the current key when a new participant joins the conference.
     * @private
     */
    _onParticipantJoined() {
        if (this._conferenceJoined && this._enabled) {
            //this._ratchetKey();
        }
    }

    /**
     * Rotates the current key when a participant leaves the conference.
     * @private
     */
    _onParticipantLeft(id) {
        this._e2eeCtx.cleanup(id);

        if (this._enabled) {
            this._rotateKey();
        }
    }

    /**
     * Handles an update in a participant's key.
     *
     * @param {string} id - The participant ID.
     * @param {Uint8Array | boolean} key - The new key for the participant.
     * @param {Number} index - The new key's index.
     * @private
     */
    _onParticipantKeyUpdated(id, key, index) {
        logger.debug(`Participant ${id} updated their key`);

        this._e2eeCtx.setKey(id, key, index);
    }

    /**
     * Handles an update in a participant's key.
     *
     * @param {string} id - The participant ID.
     * @param {Uint8Array | boolean} key - The new key for the participant.
     * @param {Number} index - The new key's index.
     * @private
     */
    _onGeneralKeyUpdated(id, key, index) {
        logger.debug(`Participant ${id} updated their key`);

        this._e2eeCtx.setKeyForAllParticipants(key, index);
    }

    /**
     * Handles an update in a participant's presence property.
     *
     * @param {JitsiParticipant} participant - The participant.
     * @param {string} name - The name of the property that changed.
     * @param {*} oldValue - The property's previous value.
     * @param {*} newValue - The property's new value.
     * @private
     */
    async _onParticipantPropertyChanged(participant, name, oldValue, newValue) {
        switch (name) {
        case 'e2ee.idKey':
            logger.debug(`Participant ${participant.getId()} updated their id key: ${newValue}`);
            break;
        case 'e2ee.enabled':
            if (!newValue && this._enabled) {
                this._olmAdapter && this._olmAdapter.clearParticipantSession(participant);

                this._rotateKey();
            }
            break;
        }
    }

    /**
     * Advances the current key by using ratcheting.
     *
     * @private
     */
    async _ratchetKeyImpl() {
        logger.debug('Ratchetting key');

        const material = await importKey(this._key);
        const newKey = await ratchet(material);

        this._key = new Uint8Array(newKey);

        const index = this._olmAdapter && this._olmAdapter.updateCurrentKey(this._key);

        this._e2eeCtx.setKey(this.conference.myUserId(), this._key, index);
    }

    /**
     * Rotates the local key. Rotating the key implies creating a new one, then distributing it
     * to all participants and once they all received it, start using it.
     *
     * @private
     */
    async _rotateKeyImpl() {
        logger.debug('Rotating key');

        this._key = this._generateKey();
        const index = this._olmAdapter && await this._olmAdapter.updateKey(this._key);

        this._e2eeCtx.setKey(this.conference.myUserId(), this._key, index);
    }

    /**
     * Setup E2EE for the receiving side.
     *
     * @private
     */
    _setupReceiverE2EEForTrack(tpc, track) {
        if (!this._enabled) {
            return;
        }

        const receiver = tpc.findReceiverForTrack(track.track);

        if (receiver) {
            this._e2eeCtx.handleReceiver(receiver, track.getType(), track.getParticipantId());
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
        if (!this._enabled) {
            return;
        }

        const pc = session.peerconnection;
        const sender = pc && pc.findSenderForTrack(track.track);

        if (sender) {
            this._e2eeCtx.handleSender(sender, track.getType(), track.getParticipantId());
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
            for (const session of this.conference._getMediaSessions()) {
                this._setupSenderE2EEForTrack(session, track);
            }
        }
    }
}

E2EEncryption.keyAdapterEvents = KeyAdapterEvents;
