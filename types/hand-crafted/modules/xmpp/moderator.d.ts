export default function Moderator( roomName: string, xmpp: unknown, emitter: unknown, options: unknown ): void; // TODO:

export default class Moderator {
  constructor( roomName: string, xmpp: unknown, emitter: unknown, options: unknown ); // TODO:
  isExternalAuthEnabled: () => boolean;
  isSipGatewayEnabled: () => boolean;
  onMucMemberLeft: ( jid: string ) => void;
  setFocusUserJid: ( focusJid: string ) => void;
  getFocusUserJid: () => string;
  getFocusComponent: () => unknown; // TODO:
  createConferenceIq: () => Strophe.Builder; // TODO:
  parseSessionId: ( resultIq: unknown ) => void; // TODO:
  parseConfigOptions: ( resultIq: unknown ) => void; // TODO:
  allocateConferenceFocus: () => Promise<unknown>; // TODO: jsdoc suggests an argument
  authenticate: () => Promise<unknown>; // TODO:
  getLoginUrl: () => unknown; // TODO:
  getPopupLoginUrl: ( urlCallback: unknown, failureCallback: ( params: unknown ) => unknown ) => unknown; // TODO:
  logout: ( callback: ( params: unknown ) => unknown ) => unknown; // TODO:
}
