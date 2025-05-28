export {};

declare global {    
    type Timeout = NodeJS.Timeout | ReturnType<typeof setTimeout>;
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
