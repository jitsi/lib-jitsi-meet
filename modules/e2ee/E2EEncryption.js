/* global __filename */
import { getLogger } from 'jitsi-meet-logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import browser from '../browser';
import RTCEvents from '../../service/RTC/RTCEvents';

import E2EEContext from './E2EEContext';

const logger = getLogger(__filename);

/**
 * This module integrates {@link E2EEContext} with {@link JitsiConference} in order to enable E2E encryption.
 */
export class E2EEncryption {
    /**
     * A constructor.
     * @param {JitsiConference} conference - The conference instance for which E2E encryption is to be enabled.
     * @param {Object} options
     * @param {string} options.salt - Salt to be used for key deviation. Check {@link E2EEContext} for more details.
     */
    constructor(conference, { salt }) {
        this.conference = conference;
        this._e2eeCtx = new E2EEContext({ salt });
        this.conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            this._onMediaSessionStarted.bind(this));

        // FIXME add events to TraceablePeerConnection which will allow to see when there's new receiver or sender
        //  added instead of shenanigans around conference track events and track muted.
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
     * Sets the key to be used for End-To-End encryption.
     *
     * @param {string} key - the key to be used.
     * @returns {void}
     */
    setKey(key) {
        this._e2eeCtx.setKey(key);
    }

    /**
     * Setup E2EE for the receiving side.
     *
     * @returns {void}
     */
    _setupReceiverE2EEForTrack(tpc, track) {
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
     * @returns {void}
     */
    _setupSenderE2EEForTrack(session, track) {
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
