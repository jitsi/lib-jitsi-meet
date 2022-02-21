// TODO can't yet export this enum because of the way it is used in modules\xmpp\SignalingLayerImpl.js
enum MediaType {
    /**
     * The audio type.
     */
    AUDIO = 'audio',

    /**
     * The presenter type.
     */
    PRESENTER = 'presenter',

    /**
     * The video type.
     */
    VIDEO = 'video',
};

// exported for backward compatibility
export const AUDIO = MediaType.AUDIO;
export const PRESENTER = MediaType.PRESENTER;
export const VIDEO = MediaType.VIDEO;

export default MediaType;
