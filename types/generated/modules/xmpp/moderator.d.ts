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
    allocateConferenceFocus(): Promise<any>;
    _allocateConferenceFocusError(error: any, callback: Function): void;
    _allocateConferenceFocusSuccess(result: any, callback: Function): void;
    authenticate(): any;
    getLoginUrl(urlCallback: any, failureCallback: any): void;
    _getLoginUrl(popup: boolean, urlCb: any, failureCb: any): void;
    getPopupLoginUrl(urlCallback: any, failureCallback: any): void;
    logout(callback: any): void;
}
