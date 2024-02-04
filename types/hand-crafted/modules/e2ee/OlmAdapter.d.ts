import JitsiConference from '../../JitsiConference';
import Listenable from '../util/Listenable';

export class OlmAdapter extends Listenable {
  constructor( conference: JitsiConference );
  initSessionsAndSetMediaKey: ( key: Uint8Array, pqkey: Uint8Array ) => Promise<Uint8Array>; // TODO:
  static isSupported: () => boolean;
  updateCurrentMediaKey: ( key: Uint8Array, pqkey: Uint8Array ) => Uint8Array;
  clearParticipantSession: ( participant: unknown ) => void; // TODO:
  clearAllParticipantsSessions: () => void;
  updateKey: ( key: Uint8Array , pqkey: Uint8Array | boolean ) => Promise<number>;
}
