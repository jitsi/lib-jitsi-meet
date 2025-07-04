export {};

declare global {
    type Timeout = ReturnType<typeof setTimeout>;
    type Nullable<T> = T | null;
    type Optional<T> = T | undefined;
    interface Window {
                JitsiMeetJS?: {
            app?: {
                connectionTimes?: Record<string, any>;
            };
        };
        connectionTimes?: Record<string, any>;
    }
    interface RTCRtpReceiver {
        createEncodedStreams?: () => {
            readable: ReadableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
            writable: WritableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
        }
    }
}
