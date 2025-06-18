import JitsiLocalTrack from '../RTC/JitsiLocalTrack';

export default class ProxyConnectionPC {
  constructor( options?: {
    iceConfig: unknown; // TODO:
    isInitiator: boolean;
    onRemoteStream: ( params: unknown ) => unknown; // TODO:
    peerJid: string;
    receiveVideo: boolean;
    onSendMessage: ( params: unknown ) => unknown; // TODO:
  } );
  getPeerJid: () => string;
  processMessage: ( $jingle: Object ) => void;
  start: ( localTracks?: JitsiLocalTrack[] ) => void;
  stop: () => void;
}
