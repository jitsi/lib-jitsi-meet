import * as SDPUtil from './SDPUtil';
import * as SampleSdpStrings from './SampleSdpStrings.js';

describe('SDPUtil', () => {
    it('should parse an ice ufrag correctly', () => {
        const line = 'a=ice-ufrag:3jlcc1b3j1rqt6';
        const parsed = SDPUtil.parse_iceufrag(line);

        expect(parsed).toEqual('3jlcc1b3j1rqt6');
    });

    describe('preferVideoCodec', () => {
        it('should move a preferred codec to the front', () => {
            const sdp = SampleSdpStrings.multiCodecVideoSdp;
            const videoMLine = sdp.media.find(m => m.type === 'video');

            SDPUtil.preferVideoCodec(videoMLine, 'H264');
            const newPayloadTypesOrder
                = videoMLine.payloads.split(' ').map(
                    ptStr => parseInt(ptStr, 10));

            expect(newPayloadTypesOrder[0]).toEqual(126);
        });
    });
});
