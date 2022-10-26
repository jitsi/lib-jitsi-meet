
import * as transform from 'sdp-transform';

import { MockPeerConnection } from '../RTC/MockClasses';
import FeatureFlags from '../flags/FeatureFlags';

import LocalSdpMunger from './LocalSdpMunger';
import { default as SampleSdpStrings } from './SampleSdpStrings.js';

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
    const tpc = new MockPeerConnection('1', true);
    const localEndpointId = 'sRdpsdg';

    beforeEach(() => {
        FeatureFlags.init({ });
        localSdpMunger = new LocalSdpMunger(tpc, localEndpointId);
    });
    describe('dontStripSsrcs', () => {
        it('shouldn\'t strip ssrcs from an sdp with no msid', () => {
            localSdpMunger.tpc.isP2P = false;

            const sdpStr = transform.write(SampleSdpStrings.recvOnlySdp);
            const desc = new RTCSessionDescription({
                type: 'offer',
                sdp: sdpStr
            });
            const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc);
            const newSdp = transform.parse(transformedDesc.sdp);
            const audioSsrcs = getSsrcLines(newSdp, 'audio');
            const videoSsrcs = getSsrcLines(newSdp, 'video');

            expect(audioSsrcs.length).toEqual(2);
            expect(videoSsrcs.length).toEqual(2);
        });

        describe('should do nothing to an sdp with msid', () => {
            let audioSsrcs, videoSsrcs;

            const transformStreamIdentifiers = () => {
                const sdpStr = transform.write(SampleSdpStrings.simulcastSdp);
                const desc = new RTCSessionDescription({
                    type: 'offer',
                    sdp: sdpStr
                });
                const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc);
                const newSdp = transform.parse(transformedDesc.sdp);

                audioSsrcs = getSsrcLines(newSdp, 'audio');
                videoSsrcs = getSsrcLines(newSdp, 'video');
            };

            it('with source name signaling enabled (injected source name)', () => {
                transformStreamIdentifiers();

                expect(audioSsrcs.length).toEqual(4 + 1 /* injected source name */);
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
            const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc);
            const newSdp = transform.parse(transformedDesc.sdp);

            const videoSsrcs = getSsrcLines(newSdp, 'video');

            for (const ssrcLine of videoSsrcs) {
                if (ssrcLine.attribute === 'msid') {
                    const msid = ssrcLine.value.split(' ')[0];

                    expect(msid).toBe(`${localEndpointId}-video-0-${tpc.id}`);
                }
            }
        });

        it('should add missing msid', () => {
            // P2P case only.
            localSdpMunger.tpc.isP2P = true;

            const sdpStr = transform.write(SampleSdpStrings.firefoxP2pSdp);
            const desc = new RTCSessionDescription({
                type: 'offer',
                sdp: sdpStr
            });
            const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc);
            const newSdp = transform.parse(transformedDesc.sdp);
            const videoSsrcs = getSsrcLines(newSdp, 'video');
            const msidExists = videoSsrcs.find(s => s.attribute === 'msid');

            expect(msidExists).toBeDefined();
        });
    });
});

describe('DoNotTransformSdpForPlanB', () => {
    let localSdpMunger;
    const tpc = new MockPeerConnection('1', false);
    const localEndpointId = 'sRdpsdg';

    beforeEach(() => {
        localSdpMunger = new LocalSdpMunger(tpc, localEndpointId);
    });
    describe('stripSsrcs', () => {
        describe('should not strip ssrcs from an sdp with no msid', () => {
            let audioSsrcs, videoSsrcs;

            const transformStreamIdentifiers = () => {
                localSdpMunger.tpc.isP2P = false;

                const sdpStr = transform.write(SampleSdpStrings.recvOnlySdp);
                const desc = new RTCSessionDescription({
                    type: 'offer',
                    sdp: sdpStr
                });
                const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc);
                const newSdp = transform.parse(transformedDesc.sdp);

                audioSsrcs = getSsrcLines(newSdp, 'audio');
                videoSsrcs = getSsrcLines(newSdp, 'video');
            };

            it('with source name signaling', () => {
                FeatureFlags.init({ });
                transformStreamIdentifiers();

                expect(audioSsrcs.length).toEqual(1 + 1 /* injected source name */);
                expect(videoSsrcs.length).toEqual(1 + 1 /* injected source name */);
            });
        });
    });
});

describe('Transform msids for source-name signaling', () => {
    const tpc = new MockPeerConnection('1', false);
    const localEndpointId = 'sRdpsdg';

    const localSdpMunger = new LocalSdpMunger(tpc, localEndpointId);
    let audioMsid, audioMsidLine, videoMsid, videoMsidLine;
    const transformStreamIdentifiers = () => {
        const sdpStr = transform.write(SampleSdpStrings.simulcastRtxSdp);
        const desc = new RTCSessionDescription({
            type: 'offer',
            sdp: sdpStr
        });
        const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc);
        const newSdp = transform.parse(transformedDesc.sdp);

        audioMsidLine = getSsrcLines(newSdp, 'audio').find(ssrc => ssrc.attribute === 'msid')?.value;
        audioMsid = audioMsidLine.split(' ')[0];
        videoMsidLine = getSsrcLines(newSdp, 'video').find(ssrc => ssrc.attribute === 'msid')?.value;
        videoMsid = videoMsidLine.split(' ')[0];
    };

    it('should transform', () => {
        FeatureFlags.init({ });
        transformStreamIdentifiers();

        expect(audioMsid).toBe('sRdpsdg-audio-0-1');
        expect(videoMsid).toBe('sRdpsdg-video-0-1');
    });
});

describe('Track replace operations in plan-b', () => {
    const tpc = new MockPeerConnection('1', false);
    const localEndpointId = 'sRdpsdg';
    let desc, newSdp, sdpStr, transformedDesc, videoMsid, videoMsidLine;
    const localSdpMunger = new LocalSdpMunger(tpc, localEndpointId);

    it('should not increment track index for new tracks', () => {
        FeatureFlags.init({ });

        sdpStr = transform.write(SampleSdpStrings.simulcastRtxSdp);
        desc = new RTCSessionDescription({
            type: 'offer',
            sdp: sdpStr
        });
        transformedDesc = localSdpMunger.transformStreamIdentifiers(desc);
        newSdp = transform.parse(transformedDesc.sdp);

        videoMsidLine = getSsrcLines(newSdp, 'video').find(ssrc => ssrc.attribute === 'msid')?.value;
        videoMsid = videoMsidLine.split(' ')[0];

        expect(videoMsid).toBe('sRdpsdg-video-0-1');

        sdpStr = transform.write(SampleSdpStrings.simulcastRtxSdpReplacedTrack);
        desc = new RTCSessionDescription({
            type: 'offer',
            sdp: sdpStr
        });
        transformedDesc = localSdpMunger.transformStreamIdentifiers(desc);
        newSdp = transform.parse(transformedDesc.sdp);

        videoMsidLine = getSsrcLines(newSdp, 'video').find(ssrc => ssrc.attribute === 'msid')?.value;
        videoMsid = videoMsidLine.split(' ')[0];

        expect(videoMsid).toBe('sRdpsdg-video-0-1');
    });
});
