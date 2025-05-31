export {};

declare global {
    type Interval = ReturnType<typeof setInterval>;
    interface Window {
        connectionTimes: any;
        webkitAudioContext?: typeof AudioContext;
        AudioContext: typeof AudioContext;
    }
    interface RTCRtpReceiver {
        createEncodedStreams?: () => {
            readable: ReadableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
            writable: WritableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
        }
    }
}
