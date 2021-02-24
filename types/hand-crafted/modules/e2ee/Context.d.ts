export class Context {
  constructor( id: string );
  setKey: ( keyBytes: number[] | false, keyIndex: number ) => Promise<void>; // TODO: jsdoc has different parameter name
  setSignatureKey: ( key: CryptoKey, options: { name: string, hash: { name: string }, byteLength: number } ) => void;
  encodeFunction: ( encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController ) => void;
  decodeFunction: ( encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController ) => Promise<unknown>; // TODO:
}