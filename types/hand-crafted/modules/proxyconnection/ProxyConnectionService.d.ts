import JitsiConnection from '../../JitsiConnection';
import JitsiLocalTrack from '../RTC/JitsiLocalTrack';

export default class ProxyConnectionService {
  constructor( options: {
    convertVideoToDesktop: boolean,
    iceConfig: unknown, // TODO:
    jitsiConnection: JitsiConnection,
    onRemoteStream: ( params: unknown ) => unknown, // TODO:
    onSendMessage: ( params: unknown ) => unknown // TODO:
  } );
  processMessage: ( message: { data: { iq: string }, from: string } ) => void;
  start: ( peerJid: string, localTracks?: JitsiLocalTrack[] ) => void;
  stop: () => void;
}
