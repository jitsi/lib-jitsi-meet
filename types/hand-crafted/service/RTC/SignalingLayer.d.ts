import Listenable from '../../modules/util/Listenable';
import { MediaType } from './MediaType';

export type PeerMediaInfo = {
  muted: boolean;
  videoType: unknown | undefined;
}

export default class SignalingLayer extends Listenable {
  constructor( eventEmitter?: unknown ); // TODO:
  getSSRCOwner: ( ssrc: number ) => string | null;
  getPeerMediaInfo: ( owner: string, mediaType: MediaType ) => PeerMediaInfo | null;
}
