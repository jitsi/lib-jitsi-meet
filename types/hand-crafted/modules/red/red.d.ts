// https://github.com/Microsoft/TypeScript/blob/main/src/lib/webworker.generated.d.ts
interface RTCEncodedAudioFrameMetadata {
    contributingSources?: number[];
    synchronizationSource?: number;
}
interface RTCEncodedAudioFrame {
    data: ArrayBuffer;
    readonly timestamp: number;
    getMetadata(): RTCEncodedAudioFrameMetadata;
}
/**
 * An encoder for RFC 2198 redundancy using WebRTC Insertable Streams.
 */
export class RFC2198Encoder {
    /**
     * @param {Number} targetRedundancy the desired amount of redundancy.
     */
    constructor(targetRedundancy?: number);
    targetRedundancy: number;
    frameBuffer: any[];
    payloadType: number;
    /**
     * Set the desired level of redudancy. 4 means "four redundant frames plus current frame.
     * It is possible to reduce this to 0 to minimize the overhead to one byte.
     * @param {Number} targetRedundancy the desired amount of redundancy.
     */
    setRedundancy(targetRedundancy: number): void;
    /**
     * Set the "inner opus payload type". This is typically our RED payload type that we tell
     * the other side as our opus payload type. Can be queried from the sender using getParameters()
     * after setting the answer.
     * @param {Number} payloadType the payload type to use for opus.
     */
    setPayloadType(payloadType: number): void;
    /**
     * This is the actual transform to add redundancy to a raw opus frame.
     * @param {RTCEncodedAudioFrame} encodedFrame - Encoded audio frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     */
    addRedundancy(encodedFrame: RTCEncodedAudioFrame, controller: TransformStreamDefaultController): void;
}
