export {};

declare global {
    type Timeout = ReturnType<typeof setTimeout>;
    interface Window {
        connectionTimes: any;
        attachEvent?(event: string, listener: EventListenerOrEventListenerObject): boolean;
    }
    interface RTCRtpReceiver {
        createEncodedStreams?: () => {
            readable: ReadableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
            writable: WritableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
        }
    }
}
