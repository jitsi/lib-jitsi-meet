export {};

declare global {    
    type Timeout = ReturnType<typeof setTimeout>;
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
