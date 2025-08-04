export {};

declare global {
    type Timeout = ReturnType<typeof setTimeout>;
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
