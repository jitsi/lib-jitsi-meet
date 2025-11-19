import { getLogger } from '@jitsi/logger';

import JitsiConference from '../../JitsiConference';
import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import JitsiLocalTrack from '../RTC/JitsiLocalTrack';
import JitsiRemoteTrack from '../RTC/JitsiRemoteTrack';
import TraceablePeerConnection from '../RTC/TraceablePeerConnection';
import browser from '../browser';
import Deferred from '../util/Deferred';
import Listenable from '../util/Listenable';
import JingleSessionPC from '../xmpp/JingleSessionPC';

import E2EEContext from './E2EEContext';

const logger = getLogger('e2ee:KeyHandler');

/**
 * Options for the KeyHandler constructor.
 */
export interface IKeyHandlerOptions {
    sharedKey?: boolean;
}


/**
 * Abstract class that integrates {@link E2EEContext} with a key management system.
 */
export class KeyHandler extends Listenable {
    protected conference: JitsiConference;
    protected e2eeCtx: E2EEContext;
    protected enabled: boolean;
    protected _enabling?: Deferred<void>;
    protected _firstEnable: boolean;
    protected _setEnabled?: (enabled: boolean) => Promise<void>;

    /**
     * Build a new KeyHandler instance, which will be used in a given conference.
     * @param {JitsiConference} conference - the current conference.
     * @param {object} options - the options passed to {E2EEContext}, see implemention.
     */
    constructor(conference: JitsiConference, options: IKeyHandlerOptions = {}) {
        super();

        this.conference = conference;
        this.e2eeCtx = new E2EEContext(options);

        this.enabled = false;
        this._enabling = undefined;
        this._firstEnable = false;

        // Conference media events in order to attach the encryptor / decryptor.
        // FIXME add events to TraceablePeerConnection which will allow to see when there's new receiver or sender
        // added instead of shenanigans around conference track events and track muted.
        //

        this.conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            this._onMediaSessionStarted.bind(this));
        this.conference.on(
            JitsiConferenceEvents.TRACK_ADDED,
            (track: JitsiLocalTrack | JitsiRemoteTrack) => track.isLocal() && this._onLocalTrackAdded(track as JitsiLocalTrack));
        this.conference.rtc.on(
            RTCEvents.REMOTE_TRACK_ADDED,
            (track: JitsiRemoteTrack, tpc: TraceablePeerConnection) => this._setupReceiverE2EEForTrack(tpc, track));
        this.conference.on(
            JitsiConferenceEvents.TRACK_MUTE_CHANGED,
            this._trackMuteChanged.bind(this));
    }

    /**
     * Setup E2EE on the new track that has been added to the conference, apply it on all the open peerconnections.
     * @param {JitsiLocalTrack} track - the new track that's being added to the conference.
     * @private
     */
    private _onLocalTrackAdded(track: JitsiLocalTrack): void {
        for (const session of this.conference.getMediaSessions()) {
            this._setupSenderE2EEForTrack(session, track);
        }
    }

    /**
     * Setups E2E encryption for the new session.
     * @param {JingleSessionPC} session - the new media session.
     * @private
     */
    private _onMediaSessionStarted(session: JingleSessionPC): void {
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
    private _setupReceiverE2EEForTrack(tpc: TraceablePeerConnection, track: JitsiRemoteTrack): void {
        if (!this.enabled && !this._firstEnable) {
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
    private _setupSenderE2EEForTrack(session: JingleSessionPC, track: JitsiLocalTrack): void {
        if (!this.enabled && !this._firstEnable) {
            return;
        }

        const pc = session.peerconnection;
        const sender = pc?.findSenderForTrack(track.track);

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
    private _trackMuteChanged(track: JitsiLocalTrack): void {
        if (browser.doesVideoMuteByStreamRemove() && track.isLocal() && track.isVideoTrack() && !track.isMuted()) {
            for (const session of this.conference.getMediaSessions()) {
                this._setupSenderE2EEForTrack(session, track as JitsiLocalTrack);
            }
        }
    }

    /**
     * Indicates whether E2EE is currently enabled or not.
     *
     * @returns {boolean}
     */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /**
         * Enables / disables End-To-End encryption.
         *
         * @param {boolean} enabled - whether E2EE should be enabled or not.
         * @returns {void}
         */
    public async setEnabled(enabled: boolean): Promise<void> {
        this._enabling && await this._enabling;

        if (enabled === this.enabled) {
            return;
        }

        this._enabling = new Deferred<void>();

        this.enabled = enabled;

        this._setEnabled && await this._setEnabled(enabled);

        this.conference.setLocalParticipantProperty('e2ee.enabled', enabled.toString());

        // Only restart media sessions if E2EE is enabled. If it's later disabled
        // we'll continue to use the existing media sessions with an empty transform.
        if (!this._firstEnable && enabled) {
            this._firstEnable = true;
            this.conference._restartMediaSessions();
        }

        this.e2eeCtx.setEnabled(enabled);

        this._enabling.resolve();
    }

}
