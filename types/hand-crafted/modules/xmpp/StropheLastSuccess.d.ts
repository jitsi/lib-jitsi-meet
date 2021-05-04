import XmppConnection from './XmppConnection';

export default class LastRequestTracker {
  constructor();
  startTracking: ( xmppConnection: XmppConnection, stropheConnection: unknown ) => void; // TODO:
  getLastFailedMessage: () => string | null;
}
