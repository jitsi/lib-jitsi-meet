import TraceablePeerConnection from '../RTC/TraceablePeerConnection';

export default class LocalSdpMunger {
  constructor( tpc: TraceablePeerConnection, localEndpointId: string );
  transformStreamIdentifiers: ( sessionDesc: RTCSessionDescription ) => RTCSessionDescription;
}
