enum MediaSessionEvents {
    /**
     * Event triggered when the remote party signals video max frame heights for its local sources.
     */
    REMOTE_SOURCE_CONSTRAINTS_CHANGED = 'media_session.REMOTE_SOURCE_CONSTRAINTS_CHANGED',

    /**
     * Event triggered when the remote party signals it's receive video max frame height.
     */
    REMOTE_VIDEO_CONSTRAINTS_CHANGED = 'media_session.REMOTE_VIDEO_CONSTRAINTS_CHANGED'
};

export default MediaSessionEvents;