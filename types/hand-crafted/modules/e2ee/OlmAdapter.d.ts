import JitsiConference from '../../JitsiConference';
import JitsiParticipant from '../../JitsiParticipant';
import Listenable from '../util/Listenable';

export class OlmAdapter extends Listenable {
  constructor( conference: JitsiConference );
  initSessions: () => void; // TODO:
  static isSupported: () => boolean;
  updateCurrentMediaKey: ( key: Uint8Array, pqkey: Uint8Array ) => Uint8Array;
  clearParticipantSession: ( participant: JitsiParticipant ) => void; // TODO:
  clearAllParticipantsSessions: () => void;
  updateKey: ( key: Uint8Array , pqkey: Uint8Array | boolean ) => Promise<number>;
}
