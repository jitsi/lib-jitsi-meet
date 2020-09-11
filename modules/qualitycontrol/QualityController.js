import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import MediaSessionEvents from '../xmpp/MediaSessionEvents';

/**
 * The class manages send and receive video constraints across media sessions({@link JingleSessionPC}) which belong to
 * {@link JitsiConference}. It finds the lowest common value, between the local user's send preference and
 * the remote party's receive preference. Also this module will consider only the active session's receive value,
 * because local tracks are shared and while JVB may have no preference, the remote p2p may have and they may be totally
 * different.
 */
export class QualityController {
    /**
     * Creates new instance for a given conference.
     *
     * @param {JitsiConference} conference - the conference instance for which the new instance will be managing
     * the quality constraints.
     */
    constructor(conference) {
        this.conference = conference;
        this.conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            session => this._onMediaSessionStarted(session));
        this.conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_ACTIVE_CHANGED,
            () => this._propagateSendMaxFrameHeight());
    }

    /**
     * Handles the {@link JitsiConferenceEvents.MEDIA_SESSION_STARTED}, that is when the conference creates new media
     * session. It doesn't mean it's already active though. For example the JVB connection may be created after
     * the conference has entered the p2p mode already.
     *
     * @param {JingleSessionPC} mediaSession - the started media session.
     * @private
     */
    _onMediaSessionStarted(mediaSession) {
        mediaSession.addListener(
            MediaSessionEvents.REMOTE_VIDEO_CONSTRAINTS_CHANGED,
            session => {
                if (session === this.conference._getActiveMediaSession()) {
                    this._propagateSendMaxFrameHeight();
                }
            });
        this.preferredReceiveMaxFrameHeight
            && mediaSession.setReceiverVideoConstraint(this.preferredReceiveMaxFrameHeight);

        // Set the degradation preference on the local video track.
        mediaSession.setSenderVideoDegradationPreference();

        // Set the max bitrates on video sender if they are specified in config.js videoQuality settings.
        mediaSession.setSenderMaxBitrates();
    }

    /**
     * Figures out the send video constraint as specified by {@link selectSendMaxFrameHeight} and sets it on all media
     * sessions for the reasons mentioned in this class description.
     *
     * @returns {Promise<void[]>}
     * @private
     */
    _propagateSendMaxFrameHeight() {
        const sendMaxFrameHeight = this.selectSendMaxFrameHeight();
        const promises = [];

        if (sendMaxFrameHeight >= 0) {
            for (const session of this.conference._getMediaSessions()) {
                promises.push(session.setSenderVideoConstraint(sendMaxFrameHeight));
            }
        }

        return Promise.all(promises);
    }

    /**
     * Selects the lowest common value for the local video send constraint by looking at local user's preference and
     * the active media session's receive preference set by the remote party.
     *
     * @returns {number|undefined}
     */
    selectSendMaxFrameHeight() {
        const activeMediaSession = this.conference._getActiveMediaSession();
        const remoteRecvMaxFrameHeight = activeMediaSession && activeMediaSession.getRemoteRecvMaxFrameHeight();

        if (this.preferredSendMaxFrameHeight >= 0 && remoteRecvMaxFrameHeight >= 0) {
            return Math.min(this.preferredSendMaxFrameHeight, remoteRecvMaxFrameHeight);
        } else if (remoteRecvMaxFrameHeight >= 0) {
            return remoteRecvMaxFrameHeight;
        }

        return this.preferredSendMaxFrameHeight;
    }

    /**
     * Sets local preference for max receive video frame height.
     * @param {number|undefined} maxFrameHeight - the new value.
     */
    setPreferredReceiveMaxFrameHeight(maxFrameHeight) {
        this.preferredReceiveMaxFrameHeight = maxFrameHeight;

        for (const session of this.conference._getMediaSessions()) {
            maxFrameHeight && session.setReceiverVideoConstraint(maxFrameHeight);
        }
    }

    /**
     * Sets local preference for max send video frame height.
     *
     * @param {number} maxFrameHeight - the new value to set.
     * @returns {Promise<void[]>} - resolved when the operation is complete.
     */
    setPreferredSendMaxFrameHeight(maxFrameHeight) {
        this.preferredSendMaxFrameHeight = maxFrameHeight;

        return this._propagateSendMaxFrameHeight();
    }
}
