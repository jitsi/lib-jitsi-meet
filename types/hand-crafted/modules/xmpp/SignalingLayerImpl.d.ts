import SignalingLayer, { PeerMediaInfo } from '../../service/RTC/SignalingLayer';
import ChatRoom from './ChatRoom';
import { MediaType } from '../../service/RTC/MediaType';

declare class SignalingLayerImpl extends SignalingLayer {
  constructor();
  setChatRoom: ( room: ChatRoom ) => void;
  getPeerMediaInfo: ( owner: string, mediaType: MediaType ) => PeerMediaInfo | null;
  getSSRCOwner: ( ssrc: number ) => string | null;
  removeSSRCOwners: (ssrcList: Array<number> ) => void;
  setSSRCOwner: ( ssrc: number, endpointId: string ) => void;
  updateSsrcOwnersOnLeave: ( id: string ) => void;
}
