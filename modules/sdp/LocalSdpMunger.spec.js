
import * as transform from 'sdp-transform';

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

describe('TransformRecvOnly', () => {
    let localSdpMunger;
    const tpc = { id: '1' };
    const localEndpointId = 'sRdpsdg';

    beforeEach(() => {
        localSdpMunger = new LocalSdpMunger(tpc, localEndpointId);
    });
    describe('stripSsrcs', () => {
        beforeEach(() => { }); // eslint-disable-line no-empty-function
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

        it('should do nothing to an sdp with msid', () => {
            const sdpStr = transform.write(SampleSdpStrings.simulcastSdp);
            const desc = new RTCSessionDescription({
                type: 'offer',
                sdp: sdpStr
            });
            const transformedDesc = localSdpMunger.transformStreamIdentifiers(desc);
            const newSdp = transform.parse(transformedDesc.sdp);
            const audioSsrcs = getSsrcLines(newSdp, 'audio');
            const videoSsrcs = getSsrcLines(newSdp, 'video');

            expect(audioSsrcs.length).toEqual(4);
            expect(videoSsrcs.length).toEqual(6);
        });

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

        it('should add msid', () => {
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
