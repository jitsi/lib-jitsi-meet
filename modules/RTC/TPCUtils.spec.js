/* eslint-disable max-len */
import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { SIM_LAYERS } from '../../service/RTC/StandardVideoSettings';
import { VideoEncoderScalabilityMode } from '../../service/RTC/VideoEncoderScalabilityMode';

import { MockJitsiLocalTrack, MockPeerConnection } from './MockClasses';
import { TPCUtils } from './TPCUtils';

describe('TPCUtils', () => {
    describe('ensureCorrectOrderOfSsrcs()', () => {
        const commonSdpLines = [
            'v=0',
            'o=- 814997227879783433 5 IN IP4 127.0.0.1',
            's=-',
            't=0 0',
            'a=msid-semantic: WMS 0836cc8e-a7bb-47e9-affb-0599414bc56d',
            'a=group:BUNDLE video',
            'm=video 9 RTP/SAVPF 100 96',
            'c=IN IP4 0.0.0.0',
            'a=rtpmap:100 VP8/90000',
            'a=fmtp:96 apt=100',
            'a=rtcp:9 IN IP4 0.0.0.0',
            'a=rtcp-fb:100 ccm fir',
            'a=rtcp-fb:100 nack',
            'a=rtcp-fb:100 nack pli',
            'a=rtcp-fb:100 goog-remb',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
            'a=setup:passive',
            'a=mid:video',
            'a=sendrecv',
            'a=ice-ufrag:adPg',
            'a=ice-pwd:Xsr05Mq8S7CR44DAnusZE26F',
            'a=fingerprint:sha-256 6A:39:DE:11:24:AD:2E:4E:63:D6:69:D3:85:05:53:C7:3C:38:A4:B7:91:74:C0:91:44:FC:94:63:7F:01:AB:A9'
        ];

        it('sort ssrcs associated with all FID ssrc-groups', () => {
            const pc = new MockPeerConnection();
            const tpcUtils = new TPCUtils(pc);
            const source = new RTCSessionDescription({
                type: 'offer',
                sdp: getSourceSdp()
            });
            const result = tpcUtils.ensureCorrectOrderOfSsrcs(source);

            expect(result.sdp).toBe(getExpectedSdp());

            /**
             * Test SDP with multiple FID groups
             */
            function getSourceSdp() {
                return `${[
                    ...commonSdpLines,
                    'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:1479742055 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1479742055 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:1089111804 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1089111804 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:855213044 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:855213044 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:984899560 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:984899560 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:2963867077 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:2963867077 cname:peDGrDD6WsxUOki/',
                    'a=ssrc-group:FID 1757014965 984899560',
                    'a=ssrc-group:FID 1479742055 855213044',
                    'a=ssrc-group:FID 1089111804 2963867077',
                    'a=ssrc-group:SIM 1757014965 1479742055 1089111804',
                    'a=rtcp-mux'
                ].join('\r\n')}\r\n`;
            }

            /**
             * Expected SDP: all ssrc must be present and ordered
             */
            function getExpectedSdp() {
                return `${[
                    ...commonSdpLines,
                    'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:984899560 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:984899560 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:1479742055 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1479742055 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:855213044 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:855213044 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:1089111804 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1089111804 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:2963867077 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:2963867077 cname:peDGrDD6WsxUOki/',
                    'a=ssrc-group:FID 1757014965 984899560',
                    'a=ssrc-group:FID 1479742055 855213044',
                    'a=ssrc-group:FID 1089111804 2963867077',
                    'a=ssrc-group:SIM 1757014965 1479742055 1089111804',
                    'a=rtcp-mux'
                ].join('\r\n')}\r\n`;
            }
        });

        it('sort ssrcs in case the first ssrc in the SIM group is not present at the top', () => {
            const pc = new MockPeerConnection();
            const tpcUtils = new TPCUtils(pc);
            const source = new RTCSessionDescription({
                type: 'offer',
                sdp: getSourceSdp()
            });
            const result = tpcUtils.ensureCorrectOrderOfSsrcs(source);

            expect(result.sdp).toBe(getExpectedSdp());

            /**
             * Test SDP with multiple FID groups where the first ssrc in the SIM group is not present at the top
             */
            function getSourceSdp() {
                return `${[
                    ...commonSdpLines,
                    'a=ssrc:1479742055 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1479742055 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:1089111804 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1089111804 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:855213044 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:855213044 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:984899560 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:984899560 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:2963867077 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:2963867077 cname:peDGrDD6WsxUOki/',
                    'a=ssrc-group:FID 1757014965 984899560',
                    'a=ssrc-group:FID 1479742055 855213044',
                    'a=ssrc-group:FID 1089111804 2963867077',
                    'a=ssrc-group:SIM 1757014965 1479742055 1089111804',
                    'a=rtcp-mux'
                ].join('\r\n')}\r\n`;
            }

            /**
             * Expected SDP: all ssrc must be present and ordered
             */
            function getExpectedSdp() {
                return `${[
                    ...commonSdpLines,
                    'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:984899560 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:984899560 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:1479742055 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1479742055 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:855213044 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:855213044 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:1089111804 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1089111804 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:2963867077 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:2963867077 cname:peDGrDD6WsxUOki/',
                    'a=ssrc-group:FID 1757014965 984899560',
                    'a=ssrc-group:FID 1479742055 855213044',
                    'a=ssrc-group:FID 1089111804 2963867077',
                    'a=ssrc-group:SIM 1757014965 1479742055 1089111804',
                    'a=rtcp-mux'
                ].join('\r\n')}\r\n`;
            }
        });

        it('sort ssrcs in case there is a single FID group', () => {
            const pc = new MockPeerConnection();
            const tpcUtils = new TPCUtils(pc);
            const source = new RTCSessionDescription({
                type: 'offer',
                sdp: getSourceSdp()
            });
            const result = tpcUtils.ensureCorrectOrderOfSsrcs(source);

            expect(result.sdp).toBe(getExpectedSdp());

            /**
             * Test SDP with the single FID group
             */
            function getSourceSdp() {
                return `${[
                    ...commonSdpLines,
                    'a=ssrc:984899560 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:984899560 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/',
                    'a=ssrc-group:FID 1757014965 984899560',
                    'a=rtcp-mux'
                ].join('\r\n')}\r\n`;
            }

            /**
             * Expected SDP: all ssrc must be present and ordered
             */
            function getExpectedSdp() {
                return `${[
                    ...commonSdpLines,
                    'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/',
                    'a=ssrc:984899560 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf',
                    'a=ssrc:984899560 cname:peDGrDD6WsxUOki/',
                    'a=ssrc-group:FID 1757014965 984899560',
                    'a=rtcp-mux'
                ].join('\r\n')}\r\n`;
            }
        });
    });

    describe('Test encodings when default settings are used for', () => {
        let pc, tpcUtils;
        let activeState, height, maxBitrates, scalabilityModes, scaleFactor;

        afterEach(() => {
            activeState = null;
            height = null;
            maxBitrates = null;
            scalabilityModes = null;
            scaleFactor = null;
        });
        const videoQuality = {};

        describe('AV1 camera tracks', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.AV1;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(1000000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(300000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(100000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('AV1 high resolution camera tracks', () => {
            const track = new MockJitsiLocalTrack(2160, 'video', 'camera');
            const codec = CodecMimeType.AV1;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(4000000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 1080', () => {
                height = 1080;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2000000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(2);
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(1000000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(3);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(300000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(6);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(100000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(12);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('AV1 low fps desktop tracks', () => {
            const codec = CodecMimeType.AV1;
            const track = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc._capScreenshareBitrate = true;
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('AV1 desktop tracks for p2p', () => {
            const codec = CodecMimeType.AV1;
            const track = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc._capScreenshareBitrate = true;
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });


        describe('AV1 high fps desktop tracks', () => {
            const codec = CodecMimeType.AV1;
            const track = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc._capScreenshareBitrate = false;
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('AV1 camera tracks for p2p', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.AV1;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(1000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(300000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 720 again', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(1000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(100000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
            });
        });

        describe('AV1 desktop tracks for p2p', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'desktop');
            const codec = CodecMimeType.AV1;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
            });
        });

        describe('VP9 camera tracks', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP9;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(1200000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(300000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(100000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('VP9 low fps desktop tracks', () => {
            const codec = CodecMimeType.VP9;
            const track = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc._capScreenshareBitrate = true;
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('VP9 high fps desktop tracks', () => {
            const codec = CodecMimeType.VP9;
            const track = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc._capScreenshareBitrate = false;
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('VP9 camera tracks with 1080p resolutions', () => {
            const codec = CodecMimeType.VP9;
            const track = new MockJitsiLocalTrack(1080, 'video', 'camera');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(1200000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(1.5);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(300000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(3);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(100000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(6);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('VP9 camera tracks with odd resolutions ', () => {
            const codec = CodecMimeType.VP9;
            const track = new MockJitsiLocalTrack(550, 'video', 'camera');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(300000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(300000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(300000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3_KEY);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(550 / 360);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(100000);
                expect(maxBitrates[1]).toBe(0);
                expect(maxBitrates[2]).toBe(0);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(undefined);
                expect(scalabilityModes[2]).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(550 / 180);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('VP9 camera tracks for p2p', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP9;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(300000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(100000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
            });
        });

        describe('VP9 desktop tracks for p2p', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'desktop');
            const codec = CodecMimeType.VP9;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
            });
        });

        describe('H.264 camera tracks', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.H264;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);
                expect(maxBitrates[1]).toBe(500000);
                expect(maxBitrates[2]).toBe(1500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);
                expect(maxBitrates[1]).toBe(500000);
                expect(maxBitrates[2]).toBe(1500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);
                expect(maxBitrates[1]).toBe(500000);
                expect(maxBitrates[2]).toBe(1500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('H.264 low fps desktop tracks', () => {
            const codec = CodecMimeType.H264;
            const track = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc._capScreenshareBitrate = true;
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);
                expect(maxBitrates[1]).toBe(2500000);
                expect(maxBitrates[2]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('H.264 high fps desktop tracks', () => {
            const codec = CodecMimeType.H264;
            const track = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc._capScreenshareBitrate = false;
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);
                expect(maxBitrates[1]).toBe(500000);
                expect(maxBitrates[2]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('H.264 camera tracks for p2p', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.H264;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(1500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
            });
        });

        describe('H.264 desktop tracks for p2p', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'desktop');
            const codec = CodecMimeType.H264;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
            });
        });

        describe('VP8 camera tracks', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP8;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);
                expect(maxBitrates[1]).toBe(500000);
                expect(maxBitrates[2]).toBe(1500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);
                expect(maxBitrates[1]).toBe(500000);
                expect(maxBitrates[2]).toBe(1500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);
                expect(maxBitrates[1]).toBe(500000);
                expect(maxBitrates[2]).toBe(1500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });

            it('and capture resolution is 4k', () => {
                height = 180;
                const highResolutiontrack = new MockJitsiLocalTrack(2160, 'video', 'camera');

                activeState = tpcUtils.calculateEncodingsActiveState(highResolutiontrack, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(highResolutiontrack, codec, height);
                expect(maxBitrates[0]).toBe(200000);
                expect(maxBitrates[1]).toBe(500000);
                expect(maxBitrates[2]).toBe(6000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(highResolutiontrack, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(highResolutiontrack, codec, height);
                expect(scaleFactor[0]).toBe(12);
                expect(scaleFactor[1]).toBe(6);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });
        });

        describe('VP8 low fps desktop tracks', () => {
            const codec = CodecMimeType.VP8;
            const track = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc._capScreenshareBitrate = true;
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);
                expect(maxBitrates[1]).toBe(2500000);
                expect(maxBitrates[2]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('VP8 high fps desktop tracks', () => {
            const codec = CodecMimeType.VP8;
            const track = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc._capScreenshareBitrate = false;
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);
                expect(maxBitrates[1]).toBe(500000);
                expect(maxBitrates[2]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('VP8 camera tracks for p2p', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP8;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(1500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
            });
        });

        describe('VP8 desktop tracks for p2p', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'desktop');
            const codec = CodecMimeType.VP8;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 2160 again', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
            });
        });

        describe('VP8 high fps desktop tracks for p2p', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'desktop');
            const codec = CodecMimeType.VP8;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc._capScreenshareBitrate = false;
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                maxBitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(maxBitrates[0]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;
                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
            });
        });
    });

    describe('Test encodings when settings are overwritten', () => {
        let pc, tpcUtils;
        let activeState, bitrates, height, scalabilityModes, scaleFactor;

        afterEach(() => {
            activeState = null;
            height = null;
            bitrates = null;
            scalabilityModes = null;
            scaleFactor = null;
        });

        describe('for AV1 camera tracks when simulcast is configured', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.AV1;

            // Configure AV1 to run in simulcast mode.
            const videoQuality = {
                av1: {
                    maxBitratesVideo: {
                        low: 300000,
                        standard: 600000,
                        high: 2000000,
                        ssHigh: 2500000
                    },
                    useSimulcast: true
                }
            };

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);
                expect(bitrates[1]).toBe(600000);
                expect(bitrates[2]).toBe(2000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);
                expect(bitrates[1]).toBe(600000);
                expect(bitrates[2]).toBe(2000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);
                expect(bitrates[1]).toBe(600000);
                expect(bitrates[2]).toBe(2000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);
                expect(bitrates[1]).toBe(600000);
                expect(bitrates[2]).toBe(2000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });
        });

        describe('for VP9 camera tracks when simulcast is configured', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP9;

            // Configure VP9 to run in simulcast mode.
            const videoQuality = {
                vp9: {
                    maxBitratesVideo: {
                        low: 300000,
                        standard: 600000,
                        high: 2000000,
                        ssHigh: 2500000
                    },
                    useSimulcast: true
                }
            };

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);
                expect(bitrates[1]).toBe(600000);
                expect(bitrates[2]).toBe(2000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);
                expect(bitrates[1]).toBe(600000);
                expect(bitrates[2]).toBe(2000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);
                expect(bitrates[1]).toBe(600000);
                expect(bitrates[2]).toBe(2000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);
                expect(bitrates[1]).toBe(600000);
                expect(bitrates[2]).toBe(2000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });
        });

        describe('for VP9 camera tracks and scalabilityMode is disabled', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP9;

            // Configure VP9 to run in K-SVC mode.
            const videoQuality = {
                vp9: {
                    scalabilityModeEnabled: false
                }
            };

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });
        });

        describe('for VP9 camera tracks and scalabilityMode is disabled', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP9;

            // Configure VP9 to run in K-SVC mode.
            const videoQuality = {
                vp9: {
                    scalabilityModeEnabled: false
                }
            };

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });
        });

        describe('for VP9 low fps desktop tracks and scalabilityMode is disabled', () => {
            const track = new MockJitsiLocalTrack(440, 'video', 'desktop');
            const codec = CodecMimeType.VP9;

            // Configure VP9 to run in K-SVC mode.
            const videoQuality = {
                vp9: {
                    scalabilityModeEnabled: false
                }
            };

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc._capScreenshareBitrate = true;
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(true);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(2500000);
                expect(bitrates[1]).toBe(2500000);
                expect(bitrates[2]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(2500000);
                expect(bitrates[1]).toBe(2500000);
                expect(bitrates[2]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });
        });

        describe('for VP9 high fps desktop tracks and scalabilityMode is disabled', () => {
            const track = new MockJitsiLocalTrack(560, 'video', 'desktop');
            const codec = CodecMimeType.VP9;

            // Configure VP9 to run in K-SVC mode.
            const videoQuality = {
                vp9: {
                    scalabilityModeEnabled: false
                }
            };

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc._capScreenshareBitrate = false;
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 2160', () => {
                height = 2160;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(2500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });
        });

        describe('for H.264 camera tracks, scalability mode is disabled', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.H264;

            // Configure VP9 to run in simulcast mode.
            const videoQuality = {
                h264: {
                    scalabilityModeEnabled: false
                }
            };

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, false /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(1500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(500000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);
            });
        });

        describe('for VP9 camera tracks when deprecated settings are used for overriding bitrates', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP9;

            // Configure VP9 bitrates using the deprecated settings.
            const videoQuality = {
                maxbitratesvideo: {
                    VP9: {
                        low: 300000,
                        standard: 600000,
                        high: 2000000
                    }
                }
            };

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(2000000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(600000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3_KEY);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('for VP9 camera tracks when L3T3 mode is used', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP9;

            // Configure VP9 to use SVC mode instead of the K-SVC mode.
            const videoQuality = {
                vp9: {
                    useKSVC: false
                }
            };

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = { videoQuality };
                pc.videoTransferActive = true;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('for VP9 camera/desktop tracks when simulcast is used', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const desktop = new MockJitsiLocalTrack(1440, 'video', 'desktop');
            const codec = CodecMimeType.VP9;

            // Configure VP9 to use SVC mode instead of the K-SVC mode.
            const videoQuality = {
                vp9: {
                    useSimulcast: true
                }
            };

            pc = new MockPeerConnection('1', true, true /* simulcast */);
            pc.options = { videoQuality };
            pc._capScreenshareBitrate = true;
            pc.videoTransferActive = true;
            const utils = new TPCUtils(pc);

            it('and requested desktop resolution is 2160', () => {
                height = 2160;

                activeState = utils.calculateEncodingsActiveState(desktop, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(true);

                bitrates = utils.calculateEncodingsBitrates(desktop, codec, height);
                expect(bitrates[0]).toBe(2500000);
                expect(bitrates[1]).toBe(2500000);
                expect(bitrates[2]).toBe(2500000);

                scalabilityModes = utils.calculateEncodingsScalabilityMode(desktop, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = utils.calculateEncodingsScaleFactor(desktop, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested camera resolution is 720', () => {
                height = 720;

                activeState = utils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                bitrates = utils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = utils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = utils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested camera resolution is 360', () => {
                height = 360;

                activeState = utils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(false);

                bitrates = utils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = utils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = utils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested camera resolution is 180', () => {
                height = 180;

                activeState = utils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = utils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);
                expect(bitrates[1]).toBe(300000);
                expect(bitrates[2]).toBe(1200000);

                scalabilityModes = utils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[1]).toBe(VideoEncoderScalabilityMode.L1T3);
                expect(scalabilityModes[2]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = utils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested camera resolution is 0', () => {
                height = 0;

                activeState = utils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('for VP8 camera/desktop tracks when simulcast is used', () => {
            const track = new MockJitsiLocalTrack(2160, 'video', 'camera');
            const desktop = new MockJitsiLocalTrack(1440, 'video', 'desktop');
            const codec = CodecMimeType.VP8;
            const videoQuality = {};

            pc = new MockPeerConnection('1', true, true /* simulcast */);
            pc.options = { videoQuality };
            pc._capScreenshareBitrate = true;
            pc.videoTransferActive = true;
            const utils = new TPCUtils(pc);

            it('and requested desktop resolution is 2160', () => {
                height = 2160;

                activeState = utils.calculateEncodingsActiveState(desktop, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(true);

                bitrates = utils.calculateEncodingsBitrates(desktop, codec, height);
                expect(bitrates[0]).toBe(2500000);
                expect(bitrates[1]).toBe(2500000);
                expect(bitrates[2]).toBe(2500000);

                scalabilityModes = utils.calculateEncodingsScalabilityMode(desktop, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = utils.calculateEncodingsScaleFactor(desktop, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
                expect(scaleFactor[1]).toBe(SIM_LAYERS[1].scaleFactor);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested camera resolution is 2160', () => {
                height = 2160;

                activeState = utils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(true);

                bitrates = utils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(200000);
                expect(bitrates[1]).toBe(500000);
                expect(bitrates[2]).toBe(6000000);

                scalabilityModes = utils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = utils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(12);
                expect(scaleFactor[1]).toBe(6);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested camera resolution is 360', () => {
                height = 360;

                activeState = utils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(true);
                expect(activeState[2]).toBe(false);

                bitrates = utils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(200000);
                expect(bitrates[1]).toBe(500000);
                expect(bitrates[2]).toBe(6000000);

                scalabilityModes = utils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = utils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(12);
                expect(scaleFactor[1]).toBe(6);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested camera resolution is 180', () => {
                height = 180;

                activeState = utils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(true);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = utils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(200000);
                expect(bitrates[1]).toBe(500000);
                expect(bitrates[2]).toBe(6000000);

                scalabilityModes = utils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes).toBe(undefined);

                scaleFactor = utils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(12);
                expect(scaleFactor[1]).toBe(6);
                expect(scaleFactor[2]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested camera resolution is 0', () => {
                height = 0;

                activeState = utils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });

        describe('for VP9 camera tracks and the jvb connection is suspended', () => {
            const track = new MockJitsiLocalTrack(720, 'video', 'camera');
            const codec = CodecMimeType.VP9;

            beforeEach(() => {
                pc = new MockPeerConnection('1', true, true /* simulcast */);
                pc.options = {};
                pc.videoTransferActive = false;
                tpcUtils = new TPCUtils(pc);
            });

            afterEach(() => {
                pc = null;
                tpcUtils = null;
            });

            it('and requested resolution is 720', () => {
                height = 720;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(1200000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L3T3_KEY);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[2].scaleFactor);
            });

            it('and requested resolution is 360', () => {
                height = 360;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(300000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L2T3_KEY);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[1].scaleFactor);
            });

            it('and requested resolution is 180', () => {
                height = 180;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);

                bitrates = tpcUtils.calculateEncodingsBitrates(track, codec, height);
                expect(bitrates[0]).toBe(100000);

                scalabilityModes = tpcUtils.calculateEncodingsScalabilityMode(track, codec, height);
                expect(scalabilityModes[0]).toBe(VideoEncoderScalabilityMode.L1T3);

                scaleFactor = tpcUtils.calculateEncodingsScaleFactor(track, codec, height);
                expect(scaleFactor[0]).toBe(SIM_LAYERS[0].scaleFactor);
            });

            it('and requested resolution is 0', () => {
                height = 0;

                activeState = tpcUtils.calculateEncodingsActiveState(track, codec, height);
                expect(activeState[0]).toBe(false);
                expect(activeState[1]).toBe(false);
                expect(activeState[2]).toBe(false);
            });
        });
    });
});
