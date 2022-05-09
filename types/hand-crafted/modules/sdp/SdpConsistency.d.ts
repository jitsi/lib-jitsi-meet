export default class SdpConsistency {
  constructor( logPrefix: string );
  clearVideoSsrcCache: () => void;
  setPrimarySsrc: ( primarySsrc: number ) => void;
  hasPrimarySsrcCached: () => void;
  makeVideoPrimarySsrcsConsistent: ( sdpStr: string ) => string;
}
