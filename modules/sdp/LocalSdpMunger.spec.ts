import * as transform from 'sdp-transform';

import { MockPeerConnection } from '../RTC/MockClasses';

import LocalSdpMunger from './LocalSdpMunger';
import { default as SampleSdpStrings } from './SampleSdpStrings';

/**
 * Returns the associated ssrc lines for a given media type.
 *
 * @param {RTCSessionDescription} desc
 * @param {string} mediaType
 * @returns
 */
function getSsrcLines(desc, mediaType) {
    const mline = desc.media.find(m => m.type === mediaType);

    return mline.ssrcs ?? [];
}

describe('TransformSdpsForUnifiedPlan', () => {
    let localSdpMunger;
    const tpc = new MockPeerConnection('1', true, false);
    const localEndpointId = 'sRdpsdg';

    beforeEach(() => {
        localSdpMunger = new LocalSdpMunger(tpc as any, localEndpointId);
    });
    describe('StripSsrcs', () => {
        describe('should strip label and mslabel from an sdp with msid', () => {
            let audioSsrcs, videoSsrcs;

            const transformStreamIdentifiers = () => {
                const sdpStr = transform.write(SampleSdpStrings.simulcastSdp);
                const desc = new RTCSessionDescription({
                    type: 'offer',
                    sdp: sdpStr
                });
                const ssrcMap = new Map();

                ssrcMap.set('sRdpsdg-v0', {
                    ssrcs: [ 1757014965, 1479742055, 1089111804 ],
                    msid: 'sRdpsdg-video-0',
                    groups: [ {
                        semantics: 'SIM',
                        ssrcs: [ 1757014965, 1479742055, 1089111804 ] } ]
                });
                ssrcMap.set('sRdpsdg-a0', {
                    ssrcs: [ 124723944 ],
                    msid: 'sRdpsdg-audio-0'
                });
                const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc, ssrcMap);
                const newSdp = transform.parse(transformedDesc.sdp);

                audioSsrcs = getSsrcLines(newSdp, 'audio');
                videoSsrcs = getSsrcLines(newSdp, 'video');
            };

            it('with source name signaling enabled (injected source name)', () => {
                transformStreamIdentifiers();

                expect(audioSsrcs.length).toEqual(2 + 1 /* injected source name */);
                expect(videoSsrcs.length).toEqual(6 + 3 /* injected source name into each ssrc */);
            });
        });
    });

    describe('addMsids', () => {
        it('should add endpointId to msid', () => {
            const sdpStr = transform.write(SampleSdpStrings.firefoxSdp);
            const desc = new RTCSessionDescription({
                type: 'offer',
                sdp: sdpStr
            });
            const ssrcMap = new Map();

            ssrcMap.set('sRdpsdg-v0', {
                ssrcs: [ 984899560 ],
                msid: 'sRdpsdg-video-0'
            });
            ssrcMap.set('sRdpsdg-a0', {
                ssrcs: [ 124723944 ],
                msid: 'sRdpsdg-audio-0'
            });
            const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc, ssrcMap);
            const newSdp = transform.parse(transformedDesc.sdp);

            const videoSsrcs = getSsrcLines(newSdp, 'video');

            for (const ssrcLine of videoSsrcs) {
                if (ssrcLine.attribute === 'msid') {
                    const msid = ssrcLine.value;

                    expect(msid)
                        .toBe(`${localEndpointId}-video-0-${tpc.id} bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf-${tpc.id}`);
                }
            }
        });

        it('should add missing msid', () => {
            // P2P case only.
            localSdpMunger._tpc.isP2P = true;

            const sdpStr = transform.write(SampleSdpStrings.firefoxP2pSdp);
            const desc = new RTCSessionDescription({
                type: 'offer',
                sdp: sdpStr
            });
            const ssrcMap = new Map();

            ssrcMap.set('sRdpsdg-v0', {
                ssrcs: [ 984899560 ],
                msid: 'sRdpsdg-video-0'
            });
            ssrcMap.set('sRdpsdg-a0', {
                ssrcs: [ 124723944 ],
                msid: 'sRdpsdg-audio-0'
            });
            const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc, ssrcMap);
            const newSdp = transform.parse(transformedDesc.sdp);
            const videoSsrcs = getSsrcLines(newSdp, 'video');
            const msidExists = videoSsrcs.find(s => s.attribute === 'msid');

            expect(msidExists).toBeDefined();
        });
    });
});

describe('Transform msids for source-name signaling', () => {
    const tpc = new MockPeerConnection('1', false, false);
    const localEndpointId = 'sRdpsdg';

    const localSdpMunger = new LocalSdpMunger(tpc as any, localEndpointId);
    let audioMsid, audioMsidLine, videoMsid, videoMsidLine;
    const transformStreamIdentifiers = () => {
        const sdpStr = transform.write(SampleSdpStrings.simulcastRtxSdp);
        const desc = new RTCSessionDescription({
            type: 'offer',
            sdp: sdpStr
        });
        const ssrcMap = new Map();

        ssrcMap.set('sRdpsdg-v0', {
            ssrcs: [ 1757014965, 984899560, 1479742055, 855213044, 1089111804, 2963867077 ],
            msid: 'sRdpsdg-video-0'
        });
        ssrcMap.set('sRdpsdg-a0', {
            ssrcs: [ 124723944 ],
            msid: 'sRdpsdg-audio-0'
        });
        const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc, ssrcMap);
        const newSdp = transform.parse(transformedDesc.sdp);

        audioMsidLine = getSsrcLines(newSdp, 'audio').find(ssrc => ssrc.attribute === 'msid')?.value;
        audioMsid = audioMsidLine.split(' ')[0];
        videoMsidLine = getSsrcLines(newSdp, 'video').find(ssrc => ssrc.attribute === 'msid')?.value;
        videoMsid = videoMsidLine.split(' ')[0];
    };

    it('should transform', () => {
        transformStreamIdentifiers();

        expect(audioMsid).toBe('sRdpsdg-audio-0-1');
        expect(videoMsid).toBe('sRdpsdg-video-0-1');
    });
});
