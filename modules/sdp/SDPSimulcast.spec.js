import * as transform from 'sdp-transform';

import { MediaType } from '../../service/RTC/MediaType';

import { default as SampleSdpStrings } from './SampleSdpStrings.js';
import SdpSimulcast from './SdpSimulcast.ts';


const getVideoGroups = (parsedSdp, groupSemantics) => {
    const videoMLine = parsedSdp.media.find(m => m.type === MediaType.VIDEO);

    videoMLine.ssrcGroups = videoMLine.ssrcGroups || [];

    return videoMLine.ssrcGroups.filter(g => g.semantics === groupSemantics);
};

const numVideoSsrcs = parsedSdp => {
    const videoMLine = parsedSdp.media.find(m => m.type === MediaType.VIDEO);
    const ssrcs = new Set(videoMLine.ssrcs?.map(ssrcInfo => ssrcInfo.id));

    return ssrcs.size;
};

const parseSimLayers = parsedSdp => {
    const videoMLine = parsedSdp.media.find(m => m.type === MediaType.VIDEO);
    const simGroup = videoMLine.ssrcGroups?.find(group => group.semantics === 'SIM');

    if (simGroup) {
        return simGroup.ssrcs.split(' ').map(ssrc => parseInt(ssrc, 10));
    }

    return null;
};

describe('sdp-simulcast', () => {
    const numLayers = 3;
    let simulcast;

    beforeEach(() => {
        simulcast = new SdpSimulcast({ numOfLayers: numLayers });
    });

    describe('mungeLocalDescription', () => {
        it('should add simulcast layers to the local sdp', () => {
            const sdp = SampleSdpStrings.plainVideoSdp;
            const desc = {
                type: 'answer',
                sdp: transform.write(sdp)
            };

            const newDesc = simulcast.mungeLocalDescription(desc);
            const newSdp = transform.parse(newDesc.sdp);

            expect(numVideoSsrcs(newSdp)).toEqual(numLayers);
            const simGroup = getVideoGroups(newSdp, 'SIM')[0];

            expect(simGroup.ssrcs.split(' ').length).toEqual(numLayers);
        });

        it('should add the cached SSRCs on subsequent sLD calls to the local sdp', () => {
            const sdp = SampleSdpStrings.plainVideoSdp;
            const desc = {
                type: 'answer',
                sdp: transform.write(sdp)
            };

            const newDesc = simulcast.mungeLocalDescription(desc);
            const newSdp = transform.parse(newDesc.sdp);
            const cachedSsrcs = parseSimLayers(newSdp);

            // Call sLD again with the original description.
            const secondDesc = simulcast.mungeLocalDescription(desc);
            const secondSdp = transform.parse(secondDesc.sdp);

            expect(parseSimLayers(secondSdp)).toEqual(cachedSsrcs);
        });

        describe('corner cases', () => {
            it('should do nothing if the mline has no ssrcs in the local sdp', () => {
                const sdp = SampleSdpStrings.plainVideoSdp;
                const videoMLine = sdp.media.find(m => m.type === MediaType.VIDEO);

                videoMLine.ssrcs = [];
                const desc = {
                    type: 'answer',
                    sdp: transform.write(sdp)
                };

                const newDesc = simulcast.mungeLocalDescription(desc);
                const newSdp = transform.parse(newDesc.sdp);

                expect(numVideoSsrcs(newSdp)).toEqual(0);
            });

            it('should do nothing if the mline already has a SIM group and 3 ssrcs in the local sdp', () => {
                const sdp = SampleSdpStrings.simulcastSdp;
                const desc = {
                    type: 'answer',
                    sdp: transform.write(sdp)
                };
                const ssrcs = parseSimLayers(sdp);

                const newDesc = simulcast.mungeLocalDescription(desc);
                const newSdp = transform.parse(newDesc.sdp);

                expect(parseSimLayers(newSdp)).toEqual(ssrcs);
            });

            it('should do nothing if the m-line has only recv-only ssrcs', () => {
                const sdp = SampleSdpStrings.recvOnlySdp;
                const desc = {
                    type: 'answer',
                    sdp: transform.write(sdp)
                };
                const newDesc = simulcast.mungeLocalDescription(desc);
                const newSdp = transform.parse(newDesc.sdp);

                expect(numVideoSsrcs(newSdp)).toEqual(1);
            });
        });
    });

    describe('mungeRemoteDescription', () => {
        it('should implode remote simulcast SSRCs into one FID group', () => {
            const sdp = SampleSdpStrings.simulcastRtxSdp;
            const desc = {
                type: 'offer',
                sdp: transform.write(sdp)
            };
            const newDesc = simulcast.mungeRemoteDescription(desc);
            const newSdp = transform.parse(newDesc.sdp);
            const fidGroups = getVideoGroups(newSdp, 'FID');
            const simGroups = getVideoGroups(newSdp, 'SIM');

            expect(fidGroups.length).toEqual(1);
            expect(simGroups.length).toEqual(0);
            expect(fidGroups[0].ssrcs).toContain('1757014965');
            expect(fidGroups[0].ssrcs).toContain('984899560');
        });

        it('should implode remote simulcast SSRCs without RTX into one primary SSRC', () => {
            const sdp = SampleSdpStrings.simulcastNoRtxSdp;
            const desc = {
                type: 'offer',
                sdp: transform.write(sdp)
            };
            const newDesc = simulcast.mungeRemoteDescription(desc);
            const newSdp = transform.parse(newDesc.sdp);
            const fidGroups = getVideoGroups(newSdp, 'FID');
            const simGroups = getVideoGroups(newSdp, 'SIM');

            expect(fidGroups.length).toEqual(0);
            expect(simGroups.length).toEqual(0);
            expect(numVideoSsrcs(newSdp)).toEqual(1);
        });
    });
});
