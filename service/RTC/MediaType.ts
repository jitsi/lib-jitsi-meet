export enum MediaType {
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
export const AUDIO = MediaTypes.AUDIO;
export const PRESENTER = MediaTypes.PRESENTER;
export const VIDEO = MediaTypes.VIDEO;
