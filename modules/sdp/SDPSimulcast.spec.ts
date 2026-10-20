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

describe('sdp-simulcast', () => {
    const numLayers = 3;
    let simulcast;

    beforeEach(() => {
        // @ts-ignore
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

        it('should use the a=msid of the current m-line for the cached SSRCs when a=ssrc msid is missing', () => {
            // Chrome and Safari only signal the media-level a=msid in answers to an offer that carries both a=msid
            // and a=ssrc msid, and in Unified Plan offers once https://webrtc-review.googlesource.com/c/src/+/509780
            // lands.
            const sdp = SampleSdpStrings.plainVideoSdp;
            const videoMLine = sdp.media.find(m => m.type === MediaType.VIDEO);

            videoMLine.ssrcs = videoMLine.ssrcs.filter(ssrc => ssrc.attribute !== 'msid');

            const cachedSsrcs = parseSimLayers(transform.parse(simulcast.mungeLocalDescription({
                type: 'answer',
                sdp: transform.write(sdp)
            }).sdp));

            // Re-adding a track, e.g. restarting a screenshare, gives the m-line a new SSRC and track id.
            const newMsid = '- 2c1ea6a9-6e94-4d7c-9a3e-2b8d1f0e7c55';

            videoMLine.msid = newMsid;
            videoMLine.ssrcs.forEach(ssrc => {
                ssrc.id = 1234567890;
            });

            const secondDesc = simulcast.mungeLocalDescription({
                type: 'answer',
                sdp: transform.write(sdp)
            });
            const secondSdp = transform.parse(secondDesc.sdp);
            const secondVideoMLine = secondSdp.media.find(m => m.type === MediaType.VIDEO);

            expect(secondDesc.sdp).not.toMatch(/^a=ssrc:\d+ msid(?!:)/m);
            expect(parseSimLayers(secondSdp)).toEqual(cachedSsrcs);
            for (const ssrc of cachedSsrcs) {
                const msid = secondVideoMLine.ssrcs.find(s => s.id === ssrc && s.attribute === 'msid');

                expect(msid?.value).toBe(newMsid);
            }
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
});
