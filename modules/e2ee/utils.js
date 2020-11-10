/**
 * Polyfill RTCEncoded(Audio|Video)Frame.getMetadata() (not available in M83, available M84+).
 * The polyfill can not be done on the prototype since its not exposed in workers. Instead,
 * it is done as another transformation to keep it separate.
 * TODO: remove when we decode to drop M83 support.
 */
export function polyFillEncodedFrameMetadata(encodedFrame, controller) {
    if (!encodedFrame.getMetadata) {
        encodedFrame.getMetadata = function() {
            return {
                // TODO: provide a more complete polyfill based on additionalData for video.
                synchronizationSource: this.synchronizationSource,
                contributingSources: this.contributingSources
            };
        };
    }
    controller.enqueue(encodedFrame);
}

/**
 * Compares two byteArrays for equality.
 */
export function isArrayEqual(a1, a2) {
    if (a1.byteLength !== a2.byteLength) {
        return false;
    }
    for (let i = 0; i < a1.byteLength; i++) {
        if (a1[i] !== a2[i]) {
            return false;
        }
    }

    return true;
}

