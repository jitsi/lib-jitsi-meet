import { getLogger } from '@jitsi/logger';

import MediaSessionEvents from '../xmpp/MediaSessionEvents';

const logger = getLogger('modules/qualitycontrol/SendVideoController');
const MAX_LOCAL_RESOLUTION = 2160;

/**
 * The class manages send video constraints across media sessions({@link JingleSessionPC}) which belong to
 * {@link JitsiConference}. It finds the lowest common value, between the local user's send preference and
 * the remote party's receive preference. Also this module will consider only the active session's receive value,
 * because local tracks are shared and while JVB may have no preference, the remote p2p may have and they may be totally
 * different.
 */
export default class SendVideoController {
    /**
     * Creates new instance for a given conference.
     *
     * @param {JitsiConference} conference - the conference instance for which the new instance will be managing
     * the send video quality constraints.
     */
    constructor(conference) {
        this._conference = conference;
        this._preferredSendMaxFrameHeight = MAX_LOCAL_RESOLUTION;

        /**
         * Source name based sender constraints.
         * @type {Map<string, number>};
         */
        this._sourceSenderConstraints = new Map();
    }

    /**
     * Figures out the send video constraint as specified by {@link _selectSendMaxFrameHeight} and sets it on all media
     * sessions for the reasons mentioned in this class description.
     *
     * @param {string} sourceName - The source for which sender constraints have changed.
     * @returns {Promise<void[]>}
     * @private
     */
    _propagateSendMaxFrameHeight(sourceName) {
        if (!sourceName) {
            throw new Error('sourceName missing for calculating the sendMaxHeight for video tracks');
        }
        const sendMaxFrameHeight = this._selectSendMaxFrameHeight(sourceName);
        const promises = [];

        if (sendMaxFrameHeight >= 0) {
            for (const session of this._conference.getMediaSessions()) {
                promises.push(session.setSenderVideoConstraint(sendMaxFrameHeight, sourceName));
            }
        }

        return Promise.all(promises);
    }

    /**
     * Selects the lowest common value for the local video send constraint by looking at local user's preference and
     * the active media session's receive preference set by the remote party.
     *
     * @param {string} sourceName - The source for which sender constraints have changed.
     * @returns {number|undefined}
     * @private
     */
    _selectSendMaxFrameHeight(sourceName) {
        if (!sourceName) {
            throw new Error('sourceName missing for calculating the sendMaxHeight for video tracks');
        }
        const activeMediaSession = this._conference.getActiveMediaSession();
        const remoteRecvMaxFrameHeight = activeMediaSession
            ? this._sourceSenderConstraints.get(sourceName)
            : undefined;

        if (this._preferredSendMaxFrameHeight >= 0 && remoteRecvMaxFrameHeight >= 0) {
            return Math.min(this._preferredSendMaxFrameHeight, remoteRecvMaxFrameHeight);
        } else if (remoteRecvMaxFrameHeight >= 0) {
            return remoteRecvMaxFrameHeight;
        }

        return this._preferredSendMaxFrameHeight;
    }

    /**
     * Configures the video encodings on the local sources when a media connection is established or becomes active.
     *
     * @returns {void}
     */
    configureConstraintsForLocalSources() {
        for (const track of this._conference.getLocalVideoTracks()) {
            const sourceName = track.getSourceName();

            sourceName && this._propagateSendMaxFrameHeight(sourceName);
        }
    }

    /**
     * Handles the {@link JitsiConferenceEvents.MEDIA_SESSION_STARTED}, that is when the conference creates new media
     * session. It doesn't mean it's already active though. For example the JVB connection may be created after
     * the conference has entered the p2p mode already.
     *
     * @param {JingleSessionPC} mediaSession - the started media session.
     */
    onMediaSessionStarted(mediaSession) {
        mediaSession.addListener(
            MediaSessionEvents.REMOTE_SOURCE_CONSTRAINTS_CHANGED,
            (session, sourceConstraints) => {
                session === this._conference.getActiveMediaSession()
                    && sourceConstraints.forEach(constraint => this.onSenderConstraintsReceived(constraint));
            });
    }

    /**
     * Propagates the video constraints if they have changed.
     *
     * @param {Object} videoConstraints - The sender video constraints received from the bridge.
     * @returns {Promise<void[]>}
     */
    onSenderConstraintsReceived(videoConstraints) {
        const { maxHeight, sourceName } = videoConstraints;
        const localVideoTracks = this._conference.getLocalVideoTracks() ?? [];

        for (const track of localVideoTracks) {
            // Propagate the sender constraint only if it has changed.
            if (track.getSourceName() === sourceName
                && this._sourceSenderConstraints.get(sourceName) !== maxHeight) {
                this._sourceSenderConstraints.set(
                    sourceName,
                    maxHeight === -1
                        ? Math.min(MAX_LOCAL_RESOLUTION, this._preferredSendMaxFrameHeight)
                        : maxHeight);
                logger.debug(`Sender constraints for source:${sourceName} changed to maxHeight:${maxHeight}`);
                this._propagateSendMaxFrameHeight(sourceName);
            }
        }
    }

    /**
     * Sets local preference for max send video frame height.
     *
     * @param {number} maxFrameHeight - the new value to set.
     * @returns {Promise<void[]>} - resolved when the operation is complete.
     */
    setPreferredSendMaxFrameHeight(maxFrameHeight) {
        this._preferredSendMaxFrameHeight = maxFrameHeight;
        const promises = [];

        for (const sourceName of this._sourceSenderConstraints.keys()) {
            promises.push(this._propagateSendMaxFrameHeight(sourceName));
        }

        return Promise.allSettled(promises);
    }
}
