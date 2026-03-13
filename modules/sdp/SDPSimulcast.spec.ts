import * as transform from 'sdp-transform';

import { MediaType } from '../../service/RTC/MediaType';

import { default as SampleSdpStrings } from './SampleSdpStrings';
import SdpSimulcast from './SdpSimulcast';


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

const getVideoMid = parsedSdp => {
    const videoMLine = parsedSdp.media.find(m => m.type === MediaType.VIDEO);
    return videoMLine?.mid?.toString();
};

describe('sdp-simulcast', () => {
    let simulcast;

    beforeEach(() => {
        simulcast = new SdpSimulcast();
    });

    describe('mungeLocalDescription with dynamic layers', () => {
        it('should add 3 simulcast layers for high resolution (720p)', () => {
            const sdp = SampleSdpStrings.plainVideoSdp;
            const desc = {
                type: 'answer',
                sdp: transform.write(sdp)
            };
            const mid = getVideoMid(sdp);
            const trackResolutionMap = new Map([[mid, 720]]); // 720p = 3 layers

            const newDesc = simulcast.mungeLocalDescription(desc, trackResolutionMap);
            const newSdp = transform.parse(newDesc.sdp);

            expect(numVideoSsrcs(newSdp)).toEqual(3);
            const simGroup = getVideoGroups(newSdp, 'SIM')[0];
            expect(simGroup).toBeDefined();
            expect(simGroup.ssrcs.split(' ').length).toEqual(3);
        });

        it('should add 2 simulcast layers for medium resolution (480p)', () => {
            const sdp = SampleSdpStrings.plainVideoSdp;
            const desc = {
                type: 'answer',
                sdp: transform.write(sdp)
            };
            const mid = getVideoMid(sdp);
            const trackResolutionMap = new Map([[mid, 480]]); // 480p = 2 layers

            const newDesc = simulcast.mungeLocalDescription(desc, trackResolutionMap);
            const newSdp = transform.parse(newDesc.sdp);

            expect(numVideoSsrcs(newSdp)).toEqual(2);
            const simGroup = getVideoGroups(newSdp, 'SIM')[0];
            expect(simGroup).toBeDefined();
            expect(simGroup.ssrcs.split(' ').length).toEqual(2);
        });

        it('should add 1 layer (no simulcast) for low resolution (320p)', () => {
            const sdp = SampleSdpStrings.plainVideoSdp;
            const desc = {
                type: 'answer',
                sdp: transform.write(sdp)
            };
            const mid = getVideoMid(sdp);
            const trackResolutionMap = new Map([[mid, 320]]); // 320p = 1 layer

            const newDesc = simulcast.mungeLocalDescription(desc, trackResolutionMap);
            const newSdp = transform.parse(newDesc.sdp);

            expect(numVideoSsrcs(newSdp)).toEqual(1);
            const simGroups = getVideoGroups(newSdp, 'SIM');
            // No SIM group should exist for single layer
            expect(simGroups.length).toEqual(0);
        });

        it('should default to 3 layers when no resolution map provided', () => {
            const sdp = SampleSdpStrings.plainVideoSdp;
            const desc = {
                type: 'answer',
                sdp: transform.write(sdp)
            };

            const newDesc = simulcast.mungeLocalDescription(desc);
            const newSdp = transform.parse(newDesc.sdp);

            // Default behavior (720p assumption) should give 3 layers
            expect(numVideoSsrcs(newSdp)).toEqual(3);
            const simGroup = getVideoGroups(newSdp, 'SIM')[0];
            expect(simGroup).toBeDefined();
        });

        it('should add the cached SSRCs on subsequent sLD calls', () => {
            const sdp = SampleSdpStrings.plainVideoSdp;
            const desc = {
                type: 'answer',
                sdp: transform.write(sdp)
            };
            const mid = getVideoMid(sdp);
            const trackResolutionMap = new Map([[mid, 480]]); // 2 layers

            const newDesc = simulcast.mungeLocalDescription(desc, trackResolutionMap);
            const newSdp = transform.parse(newDesc.sdp);
            const cachedSsrcs = parseSimLayers(newSdp);

            // Call sLD again with the original description.
            const secondDesc = simulcast.mungeLocalDescription(desc, trackResolutionMap);
            const secondSdp = transform.parse(secondDesc.sdp);

            expect(parseSimLayers(secondSdp)).toEqual(cachedSsrcs);
        });

        describe('corner cases', () => {
            it('should do nothing if the mline has no ssrcs in the local sdp', () => {
                const sdp = SampleSdpStrings.plainVideoSdp;
                const videoMLine = sdp.media.find(m => m.type === MediaType.VIDEO);
                if(videoMLine) {
                    videoMLine.ssrcs = [];
                }
                const desc = {
                    type: 'answer',
                    sdp: transform.write(sdp)
                };

                const newDesc = simulcast.mungeLocalDescription(desc);
                const newSdp = transform.parse(newDesc.sdp);

                expect(numVideoSsrcs(newSdp)).toEqual(0);
            });

            it('should do nothing if the mline already has simulcast enabled', () => {
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
});
