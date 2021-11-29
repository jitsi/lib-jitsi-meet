/* global __filename */

import { getLogger } from 'jitsi-meet-logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import RTCEvents from '../../service/RTC/RTCEvents';
import browser from '../browser';
import Deferred from '../util/Deferred';
import Listenable from '../util/Listenable';

import E2EEContext from './E2EEContext';

const logger = getLogger(__filename);

/**
 * Abstract class that integrates {@link E2EEContext} with a key management system.
 */
export class KeyHandler extends Listenable {
    /**
     * Build a new KeyHandler instance, which will be used in a given conference.
     * @param {JitsiConference} conference - the current conference.
     * @param {object} options - the options passed to {E2EEContext}, see implemention.
     */
    constructor(conference, options = {}) {
        super();

        this.conference = conference;
        this.e2eeCtx = new E2EEContext(options);

        this.enabled = false;
        this._enabling = undefined;

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
        if (enabled === this.enabled) {
            return;
        }

        this._enabling && await this._enabling;

        this._enabling = new Deferred();

        this.enabled = enabled;

        if (!enabled) {
            this.e2eeCtx.cleanupAll();
        }

        this._setEnabled && await this._setEnabled(enabled);

        this.conference.setLocalParticipantProperty('e2ee.enabled', enabled);

        this.conference._restartMediaSessions();

        this._enabling.resolve();
    }

    /**
     * Sets the key for End-to-End encryption.
     *
     * @returns {void}
     */
    setEncryptionKey() {
        throw new Error('Not implemented by subclass');
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
        if (!this.enabled) {
            return;
        }

        const receiver = tpc.findReceiverForTrack(track.track);

        if (receiver) {
            this.e2eeCtx.handleReceiver(receiver, track.getType(), track.getParticipantId());
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
        if (!this.enabled) {
            return;
        }

        const pc = session.peerconnection;
        const sender = pc && pc.findSenderForTrack(track.track);

        if (sender) {
            this.e2eeCtx.handleSender(sender, track.getType(), track.getParticipantId());
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
