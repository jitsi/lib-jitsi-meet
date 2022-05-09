import TraceablePeerConnection from '../RTC/TraceablePeerConnection';

export default class LocalSdpMunger {
  constructor( tpc: TraceablePeerConnection, localEndpointId: string );
  maybeAddMutedLocalVideoTracksToSDP: ( desc: unknown ) => RTCSessionDescription; // TODO:
  transformStreamIdentifiers: ( sessionDesc: RTCSessionDescription ) => RTCSessionDescription;
}
