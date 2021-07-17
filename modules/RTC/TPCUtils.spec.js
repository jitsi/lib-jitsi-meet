/* eslint-disable max-len */
import { MockPeerConnection } from './MockClasses';
import { TPCUtils } from './TPCUtils';

const TEST_VIDEO_BITRATES = {
    low: 200000,
    standard: 700000,
    high: 2500000
};

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
            const tpcUtils = new TPCUtils(pc, TEST_VIDEO_BITRATES);

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
            const tpcUtils = new TPCUtils(pc, TEST_VIDEO_BITRATES);

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
            const tpcUtils = new TPCUtils(pc, TEST_VIDEO_BITRATES);

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
});
