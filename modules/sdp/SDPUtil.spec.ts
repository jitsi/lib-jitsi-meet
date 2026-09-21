import SDPUtil from './SDPUtil';
import { default as SampleSdpStrings } from './SampleSdpStrings';

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

    describe('strip high profile video codec', () => {
        it('should only remove the payload types that signal a high profile', () => {
            const sdp = SampleSdpStrings.multiProfileVideoSdp;
            const videoMLine = sdp.media.find(m => m.type === 'video');

            SDPUtil.stripCodec(videoMLine, 'VP9', true /* high profile */);
            SDPUtil.stripCodec(videoMLine, 'H264', true /* high profile */);

            const payloadTypes = videoMLine.payloads.split(' ').map(Number);

            // Firefox does not signal 'profile-id' for VP9 which implies profile 0, therefore the payload type and
            // its RTX have to be kept, otherwise Firefox ends up sending a codec that was not negotiated.
            expect(payloadTypes).toContain(98);
            expect(payloadTypes).toContain(99);

            // Same for H264 payload types that signal the baseline profile or no profile at all.
            expect(payloadTypes).toContain(108);
            expect(payloadTypes).toContain(109);
            expect(payloadTypes).toContain(102);
            expect(payloadTypes).toContain(103);

            // The high profile payload types and their RTX are removed.
            expect(payloadTypes).not.toContain(100);
            expect(payloadTypes).not.toContain(101);
            expect(payloadTypes).not.toContain(114);
            expect(payloadTypes).not.toContain(115);

            // The other codecs are not touched.
            expect(payloadTypes).toContain(45);
            expect(payloadTypes).toContain(96);
        });

        it('should keep VP9 when profile 0 is signaled explicitly', () => {
            const sdp = SampleSdpStrings.multiCodecVideoSdp;
            const videoMLine = sdp.media.find(m => m.type === 'video');

            SDPUtil.stripCodec(videoMLine, 'VP9', true /* high profile */);

            const payloadTypes = videoMLine.payloads.split(' ').map(Number);

            expect(payloadTypes).toContain(98);
            expect(payloadTypes).toContain(99);
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

    describe('replaceIceCredentialsAndStripCandidates', () => {
        // A bundled 2 m-line remote offer as it comes from the bridge, with per m-line ICE credentials and both
        // trickled and in-SDP candidates.
        const OFFER = [
            'v=0',
            'o=- 1 2 IN IP4 127.0.0.1',
            's=-',
            't=0 0',
            'a=group:BUNDLE 0 1',
            'a=msid-semantic: WMS *',
            'm=audio 10000 UDP/TLS/RTP/SAVPF 111',
            'c=IN IP4 10.0.0.1',
            'a=mid:0',
            'a=rtpmap:111 opus/48000/2',
            'a=ice-ufrag:oldfrag',
            'a=ice-pwd:oldpwdoldpwdoldpwdoldpwd',
            'a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0',
            'a=candidate:2 1 udp 1694498815 1.2.3.4 10000 typ srflx generation 0',
            'a=end-of-candidates',
            'a=fingerprint:sha-256 AA:BB',
            'a=setup:actpass',
            'a=sendonly',
            'm=video 10000 UDP/TLS/RTP/SAVPF 100',
            'c=IN IP4 10.0.0.1',
            'a=mid:1',
            'a=rtpmap:100 VP8/90000',
            'a=ice-ufrag:oldfrag',
            'a=ice-pwd:oldpwdoldpwdoldpwdoldpwd',
            'a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0',
            'a=end-of-candidates',
            'a=fingerprint:sha-256 AA:BB',
            'a=setup:actpass',
            'a=sendonly',
            ''
        ].join('\r\n');

        it('replaces every ICE ufrag and pwd', () => {
            const patched = SDPUtil.replaceIceCredentialsAndStripCandidates(OFFER, 'newfrag', 'newpwd');
            const lines = patched.split('\r\n');

            expect(lines.filter(l => l.startsWith('a=ice-ufrag:'))).toEqual([
                'a=ice-ufrag:newfrag',
                'a=ice-ufrag:newfrag'
            ]);
            expect(lines.filter(l => l.startsWith('a=ice-pwd:'))).toEqual([
                'a=ice-pwd:newpwd',
                'a=ice-pwd:newpwd'
            ]);
            expect(patched).not.toContain('oldfrag');
            expect(patched).not.toContain('oldpwd');
        });

        it('strips every candidate and end-of-candidates line', () => {
            const patched = SDPUtil.replaceIceCredentialsAndStripCandidates(OFFER, 'newfrag', 'newpwd');

            expect(patched).not.toContain('a=candidate:');
            expect(patched).not.toContain('a=end-of-candidates');
        });

        it('leaves every other line untouched', () => {
            const patched = SDPUtil.replaceIceCredentialsAndStripCandidates(OFFER, 'newfrag', 'newpwd');
            const isIceLine = line => line.startsWith('a=candidate:')
                || line.startsWith('a=end-of-candidates')
                || line.startsWith('a=ice-ufrag:')
                || line.startsWith('a=ice-pwd:');

            expect(patched.split('\r\n').filter(l => !isIceLine(l)))
                .toEqual(OFFER.split('\r\n').filter(l => !isIceLine(l)));
        });

        it('preserves the CRLF line endings', () => {
            const patched = SDPUtil.replaceIceCredentialsAndStripCandidates(OFFER, 'newfrag', 'newpwd');

            expect(patched.split('\n').every(l => l === '' || l.endsWith('\r'))).toBe(true);
            expect(patched.endsWith('\r\n')).toBe(true);
        });

        it('handles an SDP with LF line endings', () => {
            const lfOffer = OFFER.replace(/\r\n/g, '\n');
            const patched = SDPUtil.replaceIceCredentialsAndStripCandidates(lfOffer, 'newfrag', 'newpwd');

            expect(patched).not.toContain('\r');
            expect(patched).toContain('a=ice-ufrag:newfrag\n');
            expect(patched).not.toContain('a=candidate:');
        });

        it('is a no-op for an SDP with no ICE lines', () => {
            const noIce = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';

            expect(SDPUtil.replaceIceCredentialsAndStripCandidates(noIce, 'newfrag', 'newpwd')).toEqual(noIce);
        });
    });
});
