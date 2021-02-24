import JitsiConference from '../../JitsiConference';
import Listenable from '../util/Listenable';

export class OlmAdapter extends Listenable {
  constructor( conference: JitsiConference );
  static isSupported: () => boolean;
  updateCurrentKey: ( key: Uint8Array | boolean ) => Promise<number>;
  updateKey: ( key: Uint8Array | boolean ) => Promise<number>;
}
