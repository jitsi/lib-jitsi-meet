import SDPUtil from './SDPUtil';
import { default as SampleSdpStrings } from './SampleSdpStrings.js';

describe('SDPUtil', () => {
    it('should parse an ice ufrag correctly', () => {
        const line = 'a=ice-ufrag:3jlcc1b3j1rqt6';
        const parsed = SDPUtil.parseICEUfrag(line);

        expect(parsed).toEqual('3jlcc1b3j1rqt6');
    });

    describe('preferCodec for video codec', () => {
        it('should move a preferred video codec to the front', () => {
            const sdp = SampleSdpStrings.multiCodecVideoSdp;
            const videoMLine = sdp.media.find(m => m.type === 'video');

            SDPUtil.preferCodec(videoMLine, 'H264');
            const newPayloadTypesOrder
                = videoMLine.payloads.split(' ').map(
                    ptStr => parseInt(ptStr, 10));

            expect(newPayloadTypesOrder[0]).toEqual(102);
            expect(newPayloadTypesOrder[1]).toEqual(127);
        });
    });

    describe('preferCodec for audio codec', () => {
        it('should move a preferred audio codec to the front', () => {
            const sdp = SampleSdpStrings.multiCodecVideoSdp;
            const audioMLine = sdp.media.find(m => m.type === 'audio');

            SDPUtil.preferCodec(audioMLine, 'ISAC');
            const newPayloadTypesOrder
                = audioMLine.payloads.split(' ').map(
                    ptStr => parseInt(ptStr, 10));

            expect(newPayloadTypesOrder[0]).toEqual(103);
            expect(newPayloadTypesOrder[1]).toEqual(104);
        });
    });

    describe('strip Video Codec', () => {
        it('should remove a video codec', () => {
            const sdp = SampleSdpStrings.multiCodecVideoSdp;
            const videoMLine = sdp.media.find(m => m.type === 'video');

            SDPUtil.stripCodec(videoMLine, 'H264');
            const newPayloadTypes = videoMLine.payloads.split(' ').map(Number);

            expect(newPayloadTypes.length).toEqual(4);
            expect(newPayloadTypes[0]).toEqual(96);
        });
    });

    describe('strip Audio Codec', () => {
        it('should remove an audio codec', () => {
            const sdp = SampleSdpStrings.multiCodecVideoSdp;
            const audioMLine = sdp.media.find(m => m.type === 'audio');

            SDPUtil.stripCodec(audioMLine, 'OPUS');
            const newPayloadTypes = audioMLine.payloads.split(' ').map(Number);

            expect(newPayloadTypes.length).toEqual(3);
            expect(newPayloadTypes[0]).toEqual(103);
        });
    });
});
