import transform from 'sdp-transform';

import { multiCodecVideoSdp, plainVideoSdp } from '../xmpp/SampleSdpStrings';

import TraceablePeerConnection from './TraceablePeerConnection';

const MockSessionDescription = function({ sdp }) {
    this.sdp = sdp;
};
function withMockedSessionDescription(func) {
    const originalSessionDescription = window.originalSessionDescription;

    describe('with mocked session description', () => {
        beforeEach(() => {
            window.RTCSessionDescription = MockSessionDescription;
        });

        afterEach(() => {
            window.RTCSessionDescription = originalSessionDescription;
        });

        func();
    });
}

describe('TraceablePeerConnection', () => {
    withMockedSessionDescription(() => {
        describe('_injectH264IfNotPresent', () => {
            // Store the method-in-test in a convenience variable.
            const injectFunction
                = TraceablePeerConnection.prototype._injectH264IfNotPresent;

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

        describe('_setH264Profile', () => {
            // Store the method-in-test in a convenience variable.
            const injectFunction
                = TraceablePeerConnection.prototype._setH264Profile;

            it('sets a=fmtp if there is no one', () => {
                const description = transform.parse(transform.write(multiCodecVideoSdp));
                const videoMLine = description.media.find(m => m.type === 'video');
                videoMLine.fmtp = videoMLine.fmtp.filter((fmtp) => fmtp.payload != 126);
                const sessionDescription = new MockSessionDescription({
                    sdp: transform.write(description)
                });

                const { sdp } = injectFunction(sessionDescription);
                const expectedH264Payload =
                    'a=fmtp:126 profile-level-id=42e01f;level-asymmetry-allowed=1';

                expect(sdp.indexOf(expectedH264Payload) > -1).toBe(true);
            });

            it('sets profile if it is omitted', () => {
                const description = transform.parse(transform.write(multiCodecVideoSdp));
                const videoMLine = description.media.find(m => m.type === 'video');
                const h264FMTP = videoMLine.fmtp.filter((fmtp) => fmtp.payload == 126)[0];
                h264FMTP.config = 'other=1';
                const sessionDescription = new MockSessionDescription({
                    sdp: transform.write(description)
                });
                const { sdp } = injectFunction(sessionDescription);
                const expectedH264Payload =
                    'a=fmtp:126 other=1;'
                        + 'profile-level-id=42e01f;'
                        + 'level-asymmetry-allowed=1';

                expect(sdp.indexOf(expectedH264Payload) > -1).toBe(true);
            });

            it('does not modify the fmtp if it is present', () => {
                const sessionDescription = new MockSessionDescription({
                    sdp: transform.write(multiCodecVideoSdp)
                });
                const result = injectFunction(sessionDescription);

                expect(result).toEqual(sessionDescription);
            });

            it('does not modify the description if H264 is absent', () => {
                const sessionDescription = new MockSessionDescription({
                    sdp: transform.write(plainVideoSdp)
                });
                const result = injectFunction(sessionDescription);

                expect(result).toEqual(sessionDescription);
            });
        });
    });
});
