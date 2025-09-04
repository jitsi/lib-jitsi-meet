export enum MediaSessionEvents {

    /**
     * Event triggered when the remote party signals video max frame heights for its local sources.
     */
    REMOTE_SOURCE_CONSTRAINTS_CHANGED = 'media_session.REMOTE_SOURCE_CONSTRAINTS_CHANGED',

    /**
     * Event triggered when the video codec of the local video track has changed.
     */
    VIDEO_CODEC_CHANGED = 'media_session.VIDEO_CODEC_CHANGED'
}
