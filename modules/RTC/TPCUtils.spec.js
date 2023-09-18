/* eslint-disable max-len */
import CodecMimeType from '../../service/RTC/CodecMimeType';
import VideoEncoderScalabilityMode from '../../service/RTC/VideoEncoderScalabilityMode';

import { MockJitsiLocalTrack, MockPeerConnection } from './MockClasses';
import { HD_SCALE_FACTOR, LD_SCALE_FACTOR, SD_SCALE_FACTOR, TPCUtils } from './TPCUtils';

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
        let activeState, maxBitrates, pc, result, tpcUtils;

        beforeEach(() => {
            pc = new MockPeerConnection('1', true);

            const videoQuality = {};

            pc.options = { videoQuality };
            console.log(`videoQuality === ${videoQuality.AV1}`);
            tpcUtils = new TPCUtils(pc);
        });

        afterEach(() => {
            activeState = null;
            maxBitrates = null;
            pc = null;
            result = null;
            tpcUtils = null;
        });

        it('AV1 camera tracks', () => {
            const localVideoTrack = new MockJitsiLocalTrack(720, 'video', 'camera');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.AV1);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 720);
            expect(maxBitrates[0]).toBe(1000000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 720, CodecMimeType.AV1);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.AV1);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 360);
            expect(maxBitrates[0]).toBe(300000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 360, CodecMimeType.AV1);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L2T3_KEY);
            expect(result.scaleResolutionDownBy).toBe(SD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 180, CodecMimeType.AV1);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 180);
            expect(maxBitrates[0]).toBe(100000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 180, CodecMimeType.AV1);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L1T3);
            expect(result.scaleResolutionDownBy).toBe(LD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.AV1);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });

        it('AV1 low fps desktop tracks', () => {
            pc._capScreenshareBitrate = true;
            tpcUtils = new TPCUtils(pc);
            const localVideoTrack = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 2160, CodecMimeType.AV1);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 2160);
            expect(maxBitrates[0]).toBe(500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 2160, CodecMimeType.AV1);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L1T3);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.AV1);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 720);
            expect(maxBitrates[0]).toBe(500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 2160, CodecMimeType.AV1);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L1T3);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.AV1);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 360);
            expect(maxBitrates[0]).toBe(500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 360, CodecMimeType.AV1);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L1T3);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.AV1);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });

        it('AV1 high fps desktop tracks', () => {
            pc._capScreenshareBitrate = false;
            tpcUtils = new TPCUtils(pc);
            const localVideoTrack = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 2160, CodecMimeType.AV1);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 2160);
            expect(maxBitrates[0]).toBe(2500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 720, CodecMimeType.AV1);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.AV1);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 720);
            expect(maxBitrates[0]).toBe(2500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.AV1);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 360);
            expect(maxBitrates[0]).toBe(2500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.AV1);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });

        it('VP9 camera tracks', () => {
            const localVideoTrack = new MockJitsiLocalTrack(720, 'video', 'camera');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.VP9);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 720);
            expect(maxBitrates[0]).toBe(1200000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 720, CodecMimeType.VP9);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.VP9);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 360);
            expect(maxBitrates[0]).toBe(300000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 360, CodecMimeType.VP9);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L2T3_KEY);
            expect(result.scaleResolutionDownBy).toBe(SD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 180, CodecMimeType.VP9);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 180);
            expect(maxBitrates[0]).toBe(100000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 180, CodecMimeType.VP9);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L1T3);
            expect(result.scaleResolutionDownBy).toBe(LD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.VP9);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });

        it('VP9 low fps desktop tracks', () => {
            pc._capScreenshareBitrate = true;
            tpcUtils = new TPCUtils(pc);
            const localVideoTrack = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 2160, CodecMimeType.VP9);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 2160);
            expect(maxBitrates[0]).toBe(500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 2160, CodecMimeType.VP9);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L1T3);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.VP9);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 720);
            expect(maxBitrates[0]).toBe(500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 720, CodecMimeType.VP9);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L1T3);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.VP9);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 360);
            expect(maxBitrates[0]).toBe(500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 360, CodecMimeType.VP9);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L1T3);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.VP9);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });

        it('VP9 high fps desktop tracks', () => {
            pc._capScreenshareBitrate = false;
            tpcUtils = new TPCUtils(pc);
            const localVideoTrack = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 2160, CodecMimeType.VP9);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 2160);
            expect(maxBitrates[0]).toBe(2500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            result = tpcUtils._calculateActiveEncodingParamsForSvc(localVideoTrack, 2160, CodecMimeType.VP9);
            expect(result.scalabilityMode).toBe(VideoEncoderScalabilityMode.L3T3_KEY);
            expect(result.scaleResolutionDownBy).toBe(HD_SCALE_FACTOR);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.VP9);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 720);
            expect(maxBitrates[0]).toBe(2500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.VP9);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 360);
            expect(maxBitrates[0]).toBe(2500000);
            expect(maxBitrates[1]).toBe(0);
            expect(maxBitrates[2]).toBe(0);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.VP9);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });

        it('VP8 camera tracks', () => {
            const localVideoTrack = new MockJitsiLocalTrack(720, 'video', 'camera');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.VP8);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(true);
            expect(activeState[2]).toBe(true);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP8, 720);
            expect(maxBitrates[0]).toBe(200000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(1500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.VP8);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(true);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP8, 360);
            expect(maxBitrates[0]).toBe(200000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(1500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 180, CodecMimeType.VP8);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP8, 180);
            expect(maxBitrates[0]).toBe(200000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(1500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.VP8);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });

        it('VP8 low fps desktop tracks', () => {
            pc._capScreenshareBitrate = true;
            tpcUtils = new TPCUtils(pc);
            const localVideoTrack = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 2160, CodecMimeType.VP8);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(true);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP8, 2160);
            expect(maxBitrates[0]).toBe(500000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.VP8);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(true);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP8, 720);
            expect(maxBitrates[0]).toBe(500000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.VP8);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(true);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP8, 360);
            expect(maxBitrates[0]).toBe(500000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.VP8);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });

        it('VP8 high fps desktop tracks', () => {
            pc._capScreenshareBitrate = false;
            tpcUtils = new TPCUtils(pc);
            const localVideoTrack = new MockJitsiLocalTrack(1440, 'video', 'desktop');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 2160, CodecMimeType.VP8);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(true);
            expect(activeState[2]).toBe(true);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP8, 2160);
            expect(maxBitrates[0]).toBe(200000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(2500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.VP8);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(true);
            expect(activeState[2]).toBe(true);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP8, 720);
            expect(maxBitrates[0]).toBe(200000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(2500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.VP8);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(true);
            expect(activeState[2]).toBe(true);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP8, 360);
            expect(maxBitrates[0]).toBe(200000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(2500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.VP8);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });

        it('H.264 camera tracks', () => {
            // We expect simulcast to be enabled for H.264 tracks.
            const localVideoTrack = new MockJitsiLocalTrack(720, 'video', 'camera');

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.H264);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(true);
            expect(activeState[2]).toBe(true);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.H264, 720);
            expect(maxBitrates[0]).toBe(200000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(1500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.H264);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(true);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.H264, 360);
            expect(maxBitrates[0]).toBe(200000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(1500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 180, CodecMimeType.H264);
            expect(activeState[0]).toBe(true);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);

            maxBitrates = tpcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.H264, 180);
            expect(maxBitrates[0]).toBe(200000);
            expect(maxBitrates[1]).toBe(500000);
            expect(maxBitrates[2]).toBe(1500000);

            activeState = tpcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.H264);
            expect(activeState[0]).toBe(false);
            expect(activeState[1]).toBe(false);
            expect(activeState[2]).toBe(false);
        });
    });

    describe('Test encodings when settings are overwritten', () => {
        let bitrates, enabledState, pcUtils, peerconnection;

        beforeEach(() => {
            peerconnection = new MockPeerConnection('1', true);

            // Configure AV1 to run in simulcast mode.
            const av1Settings = {
                maxBitratesVideo: {
                    low: 300000,
                    standard: 600000,
                    high: 2000000,
                    ssHigh: 2500000
                },
                useSimulcast: true
            };

            // Disable scalability mode so VP9 runs in K-SVC mode.
            const vp9Settings = {
                scalabilityModeEnabled: false
            };

            const videoQuality = {
                AV1: av1Settings,
                VP9: vp9Settings
            };

            peerconnection.options = { videoQuality };
            pcUtils = new TPCUtils(peerconnection);
        });

        afterEach(() => {
            enabledState = null;
            bitrates = null;
            peerconnection = null;
            pcUtils = null;
        });

        it('for AV1 camera tracks', () => {
            // We expect AV1 to run in Simulcast mode.
            const localVideoTrack = new MockJitsiLocalTrack(720, 'video', 'camera');

            enabledState = pcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.AV1);
            expect(enabledState[0]).toBe(true);
            expect(enabledState[1]).toBe(true);
            expect(enabledState[2]).toBe(true);

            bitrates = pcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 720);
            expect(bitrates[0]).toBe(300000);
            expect(bitrates[1]).toBe(600000);
            expect(bitrates[2]).toBe(2000000);

            enabledState = pcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.AV1);
            expect(enabledState[0]).toBe(true);
            expect(enabledState[1]).toBe(true);
            expect(enabledState[2]).toBe(false);

            bitrates = pcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 360);
            expect(bitrates[0]).toBe(300000);
            expect(bitrates[1]).toBe(600000);
            expect(bitrates[2]).toBe(2000000);

            enabledState = pcUtils.calculateEncodingsActiveState(localVideoTrack, 180, CodecMimeType.AV1);
            expect(enabledState[0]).toBe(true);
            expect(enabledState[1]).toBe(false);
            expect(enabledState[2]).toBe(false);

            bitrates = pcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.AV1, 180);
            expect(bitrates[0]).toBe(300000);
            expect(bitrates[1]).toBe(600000);
            expect(bitrates[2]).toBe(2000000);

            enabledState = pcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.AV1);
            expect(enabledState[0]).toBe(false);
            expect(enabledState[1]).toBe(false);
            expect(enabledState[2]).toBe(false);
        });

        it('for VP9 camera tracks', () => {
            // We expect VP9 to run in K-SVC mode.
            const localVideoTrack = new MockJitsiLocalTrack(720, 'video', 'camera');

            enabledState = pcUtils.calculateEncodingsActiveState(localVideoTrack, 720, CodecMimeType.VP9);
            expect(enabledState[0]).toBe(true);
            expect(enabledState[1]).toBe(true);
            expect(enabledState[2]).toBe(true);

            bitrates = pcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 720);
            expect(bitrates[0]).toBe(100000);
            expect(bitrates[1]).toBe(300000);
            expect(bitrates[2]).toBe(1200000);

            enabledState = pcUtils.calculateEncodingsActiveState(localVideoTrack, 360, CodecMimeType.VP9);
            expect(enabledState[0]).toBe(true);
            expect(enabledState[1]).toBe(true);
            expect(enabledState[2]).toBe(false);

            bitrates = pcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 360);
            expect(bitrates[0]).toBe(100000);
            expect(bitrates[1]).toBe(300000);
            expect(bitrates[2]).toBe(1200000);

            enabledState = pcUtils.calculateEncodingsActiveState(localVideoTrack, 180, CodecMimeType.VP9);
            expect(enabledState[0]).toBe(true);
            expect(enabledState[1]).toBe(false);
            expect(enabledState[2]).toBe(false);

            bitrates = pcUtils.calculateEncodingsBitrates(localVideoTrack, CodecMimeType.VP9, 180);
            expect(bitrates[0]).toBe(100000);
            expect(bitrates[1]).toBe(300000);
            expect(bitrates[2]).toBe(1200000);

            enabledState = pcUtils.calculateEncodingsActiveState(localVideoTrack, 0, CodecMimeType.VP9);
            expect(enabledState[0]).toBe(false);
            expect(enabledState[1]).toBe(false);
            expect(enabledState[2]).toBe(false);
        });
    });
});
