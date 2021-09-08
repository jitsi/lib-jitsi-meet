/* global __filename */

import { getLogger } from 'jitsi-meet-logger';
import debounce from 'lodash.debounce';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import RTCEvents from '../../service/RTC/RTCEvents';
import browser from '../browser';
import Deferred from '../util/Deferred';

import E2EEContext from './E2EEContext';
import { OlmAdapter } from './OlmAdapter';
import { ManualKeyAdapter } from './ManualKeyAdapter';
import { AutomaticKeyHandler } from './AutomaticKeyHandler';

const logger = getLogger(__filename);

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

        this._enabled = false;
        this._enabling = undefined;

        this._e2eeCtx = new E2EEContext();
        this._olmAdapter = new AutomaticKeyHandler(this._e2eeCtx, conference);
       //  this._olmAdapter = new ManualKeyAdapter(conference);

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
                || (config.enableEncodedTransformSupport && browser.supportsEncodedTransform()));
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

        if (!enabled) {
            for (const participant of this.conference.getParticipants()) {
                this._e2eeCtx.cleanup(participant.getId());
            }
        }

        await this._olmAdapter.setEnabled(enabled);

        this.conference.setLocalParticipantProperty('e2ee.enabled', enabled);

        this.conference._restartMediaSessions();

        this._enabling.resolve();
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
