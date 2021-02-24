import TraceablePeerConnection from './TraceablePeerConnection';

export default class LocalSdpMunger {
  constructor( tpc: TraceablePeerConnection );
  maybeAddMutedLocalVideoTracksToSDP: ( desc: unknown ) => RTCSessionDescription; // TODO:
  transformStreamIdentifiers: ( sessionDesc: RTCSessionDescription ) => RTCSessionDescription;
}
