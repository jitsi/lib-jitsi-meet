import { getLogger } from '@jitsi/logger';

import JitsiConference from '../../JitsiConference';
import JingleSessionPC from '../xmpp/JingleSessionPC';
import { MediaSessionEvents } from '../xmpp/MediaSessionEvents';

const logger = getLogger('qc:SendVideoController');
const MAX_LOCAL_RESOLUTION = 2160;

export interface IVideoConstraint {
    maxHeight: number;
    sourceName: string;
}

/**
 * The class manages send video constraints across media sessions({@link JingleSessionPC}) which belong to
 * {@link JitsiConference}. It finds the lowest common value, between the local user's send preference and
 * the remote party's receive preference. Also this module will consider only the active session's receive value,
 * because local tracks are shared and while JVB may have no preference, the remote p2p may have and they may be totally
 * different.
 */
export default class SendVideoController {
    private _conference: JitsiConference;
    private _preferredSendMaxFrameHeight: number;

    /**
     * Per-session source-name sender constraints. WeakMap so ended sessions are released by the GC without
     * explicit cleanup. Keyed by session, value is a map of sourceName -> maxHeight.
     */
    private _sessionSenderConstraints: WeakMap<JingleSessionPC, Map<string, number>>;

    /**
     * Creates new instance for a given conference.
     *
     * @param {JitsiConference} conference - the conference instance for which the new instance will be managing
     * the send video quality constraints.
     */
    constructor(conference: JitsiConference) {
        this._conference = conference;
        this._preferredSendMaxFrameHeight = MAX_LOCAL_RESOLUTION;
        this._sessionSenderConstraints = new WeakMap();
    }

    /**
     * Returns the constraint map for the currently active session, or undefined when there is no active session.
     *
     * @returns {Map<string, number> | undefined}
     * @private
     */
    private _activeSessionMap(): Map<string, number> | undefined {
        const activeSession = this._conference.getActiveMediaSession();

        return activeSession ? this._sessionSenderConstraints.get(activeSession) : undefined;
    }

    /**
     * Figures out the send video constraint as specified by {@link _selectSendMaxFrameHeight} and sets it on all media
     * sessions for the reasons mentioned in this class description.
     *
     * @param {string} sourceName - The source for which sender constraints have changed.
     * @returns {Promise<void>}
     * @private
     */
    async _propagateSendMaxFrameHeight(sourceName: string): Promise<void> {
        if (!sourceName) {
            throw new Error('sourceName missing for calculating the sendMaxHeight for video tracks');
        }
        const sendMaxFrameHeight = this._selectSendMaxFrameHeight(sourceName);
        const promises = [];

        if (sendMaxFrameHeight !== undefined && sendMaxFrameHeight >= 0) {
            for (const session of this._conference.getMediaSessions()) {
                promises.push(session.setSenderVideoConstraint(sendMaxFrameHeight, sourceName));
            }
        }

        await Promise.all(promises);
    }

    /**
     * Selects the lowest common value for the local video send constraint by looking at local user's preference and
     * the active media session's receive preference set by the remote party.
     *
     * @param {string} sourceName - The source for which sender constraints have changed.
     * @returns {Optional<number>}
     * @private
     */
    _selectSendMaxFrameHeight(sourceName: string): Optional<number> {
        if (!sourceName) {
            throw new Error('sourceName missing for calculating the sendMaxHeight for video tracks');
        }
        const remoteRecvMaxFrameHeight = this._activeSessionMap()?.get(sourceName);

        if (this._preferredSendMaxFrameHeight >= 0 && remoteRecvMaxFrameHeight !== undefined && remoteRecvMaxFrameHeight >= 0) {
            return Math.min(this._preferredSendMaxFrameHeight, remoteRecvMaxFrameHeight);
        } else if (remoteRecvMaxFrameHeight !== undefined && remoteRecvMaxFrameHeight >= 0) {
            return remoteRecvMaxFrameHeight;
        }

        return this._preferredSendMaxFrameHeight;
    }

    /**
     * Configures the video encodings on the local sources when a media connection is established or becomes active.
     *
     * @returns {void}
     */
    configureConstraintsForLocalSources(): void {
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
    onMediaSessionStarted(mediaSession: JingleSessionPC): void {
        this._sessionSenderConstraints.set(mediaSession, new Map());

        mediaSession.addListener(
            MediaSessionEvents.REMOTE_SOURCE_CONSTRAINTS_CHANGED,
            (session: JingleSessionPC, sourceConstraints: Array<IVideoConstraint>) => {
                if (session !== this._conference.getActiveMediaSession()) {
                    // Store constraints for inactive sessions so configureConstraintsForLocalSources picks up
                    // the correct per-session values when this session later becomes active (e.g. JVB -> P2P).
                    const sessionMap = this._sessionSenderConstraints.get(session);

                    if (sessionMap) {
                        for (const { sourceName, maxHeight } of sourceConstraints) {
                            const height = Number(maxHeight);

                            if (!Number.isFinite(height)) {
                                continue;
                            }
                            sessionMap.set(sourceName, height === -1 ? MAX_LOCAL_RESOLUTION : height);
                        }
                    }
                } else {
                    sourceConstraints.forEach(constraint => this.onSenderConstraintsReceived(constraint));
                }
            });
    }

    /**
     * Propagates the video constraints if they have changed.
     *
     * @param {IVideoConstraint} videoConstraints - The sender video constraints received from the bridge.
     * @returns {Promise<void>}
     */
    async onSenderConstraintsReceived(videoConstraints: IVideoConstraint): Promise<void> {
        const { maxHeight, sourceName } = videoConstraints;
        const localVideoTracks = this._conference.getLocalVideoTracks() ?? [];
        const sessionMap = this._activeSessionMap();

        for (const track of localVideoTracks) {
            if (track.getSourceName() === sourceName) {
                const normalizedHeight = maxHeight === -1 ? MAX_LOCAL_RESOLUTION : maxHeight;

                if (sessionMap?.get(sourceName) !== normalizedHeight) {
                    sessionMap?.set(sourceName, normalizedHeight);
                    logger.debug(`Sender constraints for source:${sourceName} changed to maxHeight:${maxHeight}`);
                    await this._propagateSendMaxFrameHeight(sourceName);
                }
            }
        }
    }

    /**
     * Sets local preference for max send video frame height.
     *
     * @param {number} maxFrameHeight - the new value to set.
     * @returns {Promise<void>} - resolved when the operation is complete.
     */
    async setPreferredSendMaxFrameHeight(maxFrameHeight: number): Promise<void> {
        this._preferredSendMaxFrameHeight = maxFrameHeight;
        const promises: Promise<void>[] = [];

        for (const sourceName of (this._activeSessionMap()?.keys() ?? [])) {
            promises.push(this._propagateSendMaxFrameHeight(sourceName));
        }

        await Promise.allSettled(promises);
    }
}
