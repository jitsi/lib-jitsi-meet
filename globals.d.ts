export {};

import  { IJitsiMeetScreenObtainer } from './modules/RTC/ScreenObtainer'

declare global {
    type Timeout = ReturnType<typeof setTimeout>;
    interface Window {
        JitsiMeetScreenObtainer?: IJitsiMeetScreenObtainer;
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
