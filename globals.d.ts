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
        Olm: any;
    }
    interface RTCRtpReceiver {
        createEncodedStreams?: () => {
            readable: ReadableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
            writable: WritableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
        }
    }
        const Olm: {
        init(): Promise<void>;
        get_library_version(): number[];
        Account: new () => OlmAccount;
        Session: new () => OlmSession;
        SAS: new () => OlmSAS;
        Utility: new () => OlmUtility;
    };
}
