import JingleSessionPC from './JingleSessionPC';
import ConnectionPlugin from './ConnectionPlugin';
import XMPP from '../xmpp/xmpp';
import EventEmitter from '../../EventEmitter';

declare class JingleConnectionPlugin extends ConnectionPlugin {
  constructor( xmpp: XMPP, eventEmitter: EventEmitter<unknown>, iceConfig: unknown ); // TODO:
  init: ( connection: unknown ) => void; // TODO:
  onJingle: ( iq: unknown ) => boolean; // TODO:
  newP2PJingleSession: ( me: string, peer: string ) => JingleSessionPC;
  terminate: ( sid: unknown, reasonCondition: unknown, reasonText: unknown ) => void; // TODO:
  getStunAndTurnCredentials: () => void;
  onReceiveStunAndTurnCredentials: ( res: unknown ) => void; // TODO:
  getLog: () => unknown; // TODO:
}
