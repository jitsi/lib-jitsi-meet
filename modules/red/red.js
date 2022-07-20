const MAX_TIMESTAMP = 0x100000000;

/**
 * An encoder for RFC 2198 redundancy using WebRTC Insertable Streams.
 */
export class RFC2198Encoder {
    /**
     * @param {Number} targetRedundancy the desired amount of redundancy.
     */
    constructor(targetRedundancy = 1) {
        this.targetRedundancy = targetRedundancy;
        this.frameBuffer = new Array(targetRedundancy);
        this.payloadType = undefined;
    }

    /**
     * Set the desired level of redudancy. 4 means "four redundant frames plus current frame.
     * It is possible to reduce this to 0 to minimize the overhead to one byte.
     * @param {Number} targetRedundancy the desired amount of redundancy.
     */
    setRedundancy(targetRedundancy) {
        const currentBuffer = this.frameBuffer;

        if (targetRedundancy > this.targetRedundancy) {
            this.frameBuffer = new Array(targetRedundancy);
            for (let i = 0; i < currentBuffer.length; i++) {
                this.frameBuffer[i + targetRedundancy - this.targetRedundancy] = currentBuffer[i];
            }
        } else if (targetRedundancy < this.targetRedundancy) {
            this.frameBuffer = new Array(targetRedundancy);
            for (let i = 0; i < this.frameBuffer.length; i++) {
                this.frameBuffer[i] = currentBuffer[i + this.targetRedundancy - targetRedundancy];
            }
        }
        this.targetRedundancy = targetRedundancy;
    }

    /**
     * Set the "inner opus payload type". This is typically our RED payload type that we tell
     * the other side as our opus payload type. Can be queried from the sender using getParameters()
     * after setting the answer.
     * @param {Number} payloadType the payload type to use for opus.
     */
    setPayloadType(payloadType) {
        this.payloadType = payloadType;
    }

    /**
     * This is the actual transform to add redundancy to a raw opus frame.
     * @param {RTCEncodedAudioFrame} encodedFrame - Encoded audio frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     */
    addRedundancy(encodedFrame, controller) {
        // TODO: should this ensure encodedFrame.type being not set and
        // encodedFrame.getMetadata().payloadType being the same as before?
        /*
         * From https://datatracker.ietf.org/doc/html/rfc2198#section-3:
         0                   1                    2                   3
         0 1 2 3 4 5 6 7 8 9 0 1 2 3  4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
         +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
         |F|   block PT  |  timestamp offset         |   block length    |
         +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
         0 1 2 3 4 5 6 7
         +-+-+-+-+-+-+-+-+
         |0|   Block PT  |
         +-+-+-+-+-+-+-+-+
         */
        const data = new Uint8Array(encodedFrame.data);

        const newFrame = data.slice(0);

        newFrame.timestamp = encodedFrame.timestamp;

        let allFrames = this.frameBuffer.filter(x => Boolean(x)).concat(newFrame);

        // TODO: determine how much we can fit into the available size (which we need to assume as 1190 bytes or so)
        let needLength = 1 + newFrame.length;

        for (let i = allFrames.length - 2; i >= 0; i--) {
            const frame = allFrames[i];


            // TODO: timestamp wraparound?
            if ((allFrames[i + 1].timestamp - frame.timestamp + MAX_TIMESTAMP) % MAX_TIMESTAMP >= 16384) {
                allFrames = allFrames.slice(i + 1);
                break;
            }
            needLength += 4 + frame.length;
        }

        const newData = new Uint8Array(needLength);
        const newView = new DataView(newData.buffer);

        // Construct the header.
        let frameOffset = 0;

        for (let i = 0; i < allFrames.length - 1; i++) {
            const frame = allFrames[i];

            // Ensure correct behaviour on wraparound.
            const tOffset = (encodedFrame.timestamp - frame.timestamp + MAX_TIMESTAMP) % MAX_TIMESTAMP;

            // eslint-disable-next-line no-bitwise
            newView.setUint8(frameOffset, (this.payloadType & 0x7f) | 0x80);
            // eslint-disable-next-line no-bitwise
            newView.setUint16(frameOffset + 1, (tOffset << 2) ^ (frame.byteLength >> 8));
            newView.setUint8(frameOffset + 3, frame.byteLength & 0xff); // eslint-disable-line no-bitwise
            frameOffset += 4;
        }

        // Last block header.
        newView.setUint8(frameOffset++, this.payloadType);

        // Construct the frame.
        for (let i = 0; i < allFrames.length; i++) {
            const frame = allFrames[i];

            newData.set(frame, frameOffset);
            frameOffset += frame.byteLength;
        }
        encodedFrame.data = newData.buffer;

        this.frameBuffer.shift();
        this.frameBuffer.push(newFrame);

        controller.enqueue(encodedFrame);
    }
}

