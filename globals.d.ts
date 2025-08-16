export {};

import { IOlmStatic } from './modules/e2ee/OlmAdapter';

declare global {
    const Olm: IOlmStatic;
    type Timeout = ReturnType<typeof setTimeout>;
    interface Window {
        JitsiMeetJS?: {
            app?: {
                connectionTimes?: Record<string, any>;
            };
        };
        connectionTimes?: Record<string, any>;
        Olm: IOlmStatic;
    }

    interface RTCRtpReceiver {
        createEncodedStreams?: () => {
            readable: ReadableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
            writable: WritableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>;
        }
    }
}
