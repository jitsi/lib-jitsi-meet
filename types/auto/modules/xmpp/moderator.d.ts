/**
 *
 * @param roomName
 * @param xmpp
 * @param emitter
 * @param options
 */
export default function Moderator(roomName: any, xmpp: any, emitter: any, options: any): void;
export default class Moderator {
    /**
     *
     * @param roomName
     * @param xmpp
     * @param emitter
     * @param options
     */
    constructor(roomName: any, xmpp: any, emitter: any, options: any);
    roomName: any;
    xmppService: any;
    getNextTimeout: (reset: any) => number;
    getNextErrorTimeout: (reset: any) => number;
    externalAuthEnabled: boolean;
    options: any;
    sipGatewayEnabled: boolean;
    eventEmitter: any;
    connection: any;
    isExternalAuthEnabled(): boolean;
    isSipGatewayEnabled(): boolean;
    onMucMemberLeft(jid: any): void;
    setFocusUserJid(focusJid: any): void;
    focusUserJid: any;
    getFocusUserJid(): any;
    getFocusComponent(): any;
    createConferenceIq(): any;
    parseSessionId(resultIq: any): void;
    parseConfigOptions(resultIq: any): void;
    /**
     * Allocates the conference focus.
     *
     * @param {Function} callback - the function to be called back upon the
     * successful allocation of the conference focus
     * @returns {Promise} - Resolved when Jicofo allows to join the room. It's never
     * rejected and it'll keep on pinging Jicofo forever.
     */
    allocateConferenceFocus(): Promise<any>;
    /**
     * Invoked by {@link #allocateConferenceFocus} upon its request receiving an
     * error result.
     *
     * @param error - the error result of the request that
     * {@link #allocateConferenceFocus} sent
     * @param {Function} callback - the function to be called back upon the
     * successful allocation of the conference focus
     */
    _allocateConferenceFocusError(error: any, callback: Function): void;
    /**
     * Invoked by {@link #allocateConferenceFocus} upon its request receiving a
     * success (i.e. non-error) result.
     *
     * @param result - the success (i.e. non-error) result of the request that
     * {@link #allocateConferenceFocus} sent
     * @param {Function} callback - the function to be called back upon the
     * successful allocation of the conference focus
     */
    _allocateConferenceFocusSuccess(result: any, callback: Function): void;
    authenticate(): Promise<any>;
    getLoginUrl(urlCallback: any, failureCallback: any): void;
    /**
     *
     * @param {boolean} popup false for {@link Moderator#getLoginUrl} or true for
     * {@link Moderator#getPopupLoginUrl}
     * @param urlCb
     * @param failureCb
     */
    _getLoginUrl(popup: boolean, urlCb: any, failureCb: any): void;
    getPopupLoginUrl(urlCallback: any, failureCallback: any): void;
    logout(callback: any): void;
}
