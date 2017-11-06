import transform from 'sdp-transform';

import { multiCodecVideoSdp, plainVideoSdp } from '../xmpp/SampleSdpStrings';

import TraceablePeerConnection from './TraceablePeerConnection';

describe('TraceablePeerConnection', () => {
    describe('_injectH264IfNotPresent', () => {
        // Store the method-in-test in a convenience variable.
        const injectFunction
            = TraceablePeerConnection.prototype._injectH264IfNotPresent;
        const MockSessionDescription = function({ sdp }) {
            this.sdp = sdp;
        };
        const originalSessionDescription = window.originalSessionDescription;

        beforeEach(() => {
            window.RTCSessionDescription = MockSessionDescription;
        });

        afterEach(() => {
            window.RTCSessionDescription = originalSessionDescription;
        });

        it('adds h264', () => {
            const sessionDescription = new MockSessionDescription({
                sdp: transform.write(plainVideoSdp)
            });
            const { sdp } = injectFunction(sessionDescription);
            const expectedH264Payload = [
                'm=video 9 RTP/SAVPF 100 127',
                'a=rtpmap:127 H264/90000',
                'a=fmtp:127 level-asymmetry-allowed=1;'
                    + 'packetization-mode=1;'
                    + 'profile-level-id=42e01f'
            ];

            expectedH264Payload.forEach(h264Description =>
                expect(sdp.indexOf(h264Description) > -1).toBe(true));
        });

        it('does not modify the description if H264 is present', () => {
            const sessionDescription = new MockSessionDescription({
                sdp: transform.write(multiCodecVideoSdp)
            });
            const result = injectFunction(sessionDescription);

            expect(result).toEqual(sessionDescription);
        });
    });
});
