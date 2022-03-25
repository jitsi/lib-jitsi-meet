
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
    describe('stripSsrcs', () => {
        it('should strip ssrcs from an sdp with no msid', () => {
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

            expect(audioSsrcs.length).toEqual(0);
            expect(videoSsrcs.length).toEqual(0);
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

            it('without source name signaling enabled (no injected source name)', () => {
                transformStreamIdentifiers();

                expect(audioSsrcs.length).toEqual(4);
                expect(videoSsrcs.length).toEqual(6);
            });
            it('with source name signaling enabled (injected source name)', () => {
                FeatureFlags.init({ sourceNameSignaling: true });
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

                    expect(msid).toBe(`${localEndpointId}-video-${tpc.id}`);
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
        FeatureFlags.init({ });
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

            it('without source name signaling', () => {
                transformStreamIdentifiers();

                expect(audioSsrcs.length).toEqual(1);
                expect(videoSsrcs.length).toEqual(1);
            });
            it('with source name signaling', () => {
                FeatureFlags.init({ sourceNameSignaling: true });
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

    it('should not transform', () => {
        FeatureFlags.init({ sourceNameSignaling: false });
        transformStreamIdentifiers();

        expect(audioMsid).toBe('dcbb0236-cea5-402e-9e9a-595c65ffcc2a-1');
        expect(videoMsid).toBe('0836cc8e-a7bb-47e9-affb-0599414bc56d-1');
    });

    it('should transform', () => {
        FeatureFlags.init({ sourceNameSignaling: true });
        transformStreamIdentifiers();

        expect(audioMsid).toBe('sRdpsdg-audio-0-1');
        expect(videoMsid).toBe('sRdpsdg-video-0-1');
    });
});
