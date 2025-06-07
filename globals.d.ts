export {};

declare global {
    type Transform = ReturnType<typeof transform.parse>
    type Timeout = ReturnType<typeof setTimeout>;
    interface Window {
        connectionTimes: any;
    }
    interface RTCRtpReceiver {
        createEncodedStreams?: () => {
            readable: ReadableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
            writable: WritableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
        }
    }
}
