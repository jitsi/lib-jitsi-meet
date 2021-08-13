/**
 * The AVModeration logic.
 */
export default class AVModeration {
    /**
     * Constructs AV moderation room.
     *
     * @param {ChatRoom} room the main room.
     */
    constructor(room: any);
    _xmpp: any;
    _mainRoom: any;
    _moderationEnabledByType: {
        audio: boolean;
        video: boolean;
    };
    _whitelistAudio: any[];
    _whitelistVideo: any[];
    /**
     * Receives av_moderation parsed messages as json.
     * @param obj the parsed json content of the message to process.
     * @private
     */
    private _onMessage;
    /**
     * Stops listening for events.
     */
    dispose(): void;
    /**
     * Whether AV moderation is supported on backend.
     *
     * @returns {boolean} whether AV moderation is supported on backend.
     */
    isSupported(): boolean;
    /**
     * Enables or disables AV Moderation by sending a msg with command to the component.
     */
    enable(state: any, mediaType: any): void;
    /**
     * Approves that a participant can unmute by sending a msg with its jid to the component.
     */
    approve(mediaType: any, jid: any): void;
    /**
     * Rejects that a participant can unmute by sending a msg with its jid to the component.
     */
    reject(mediaType: any, jid: any): void;
}
