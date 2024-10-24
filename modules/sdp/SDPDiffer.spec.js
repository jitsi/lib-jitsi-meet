import { $iq } from 'strophe.js';

import FeatureFlags from '../flags/FeatureFlags';

import SDP from './SDP';
import { SDPDiffer } from './SDPDiffer';
import SampleSdpStrings from './SampleSdpStrings';

/* eslint-disable max-len*/

describe('SDPDiffer', () => {
    beforeEach(() => {
        FeatureFlags.init({ });
    });
    describe('toJingle', () => {
        it('should include source names in added/removed sources', () => {
            FeatureFlags.init({ });

            const testSdpOld = [
                'v=0\r\n',
                'o=thisisadapterortc 2719486166053431 0 IN IP4 127.0.0.1\r\n',
                's=-\r\n',
                't=0 0\r\n',
                'a=group:BUNDLE audio video\r\n',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
                'a=mid:audio\r\n',
                'a=ssrc:2002 msid:26D16D51-503A-420B-8274-3DD1174E498F 8205D1FC-50B4-407C-87D5-9C45F1B779F0\r\n',
                'a=ssrc:2002 cname:juejgy8a01\r\n',
                'a=ssrc:2002 name:a8f7g30-a0\r\n',
                'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
                'a=mid:video\r\n'
            ].join('');
            const testSdpNew = [
                'v=0\r\n',
                'o=thisisadapterortc 2719486166053431 0 IN IP4 127.0.0.1\r\n',
                's=-\r\n',
                't=0 0\r\n',
                'a=group:BUNDLE audio video\r\n',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
                'a=mid:audio\r\n',
                'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
                'a=mid:video\r\n',
                'a=ssrc:4004 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4005 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4004 cname:juejgy8a01\r\n',
                'a=ssrc:4005 cname:juejgy8a01\r\n',
                'a=ssrc:4004 name:a8f7g30-v0\r\n',
                'a=ssrc:4005 name:a8f7g30-v0\r\n',
                'a=ssrc-group:FID 4004 4005\r\n'
            ].join('');
            const newToOldDiff = new SDPDiffer(new SDP(testSdpNew), new SDP(testSdpOld));
            const sourceRemoveIq = $iq({})
                .c('jingle', { action: 'source-remove' });

            newToOldDiff.toJingle(sourceRemoveIq);

            const removedAudioSources = sourceRemoveIq.nodeTree.querySelectorAll('description[media=\'audio\']>source');

            expect(removedAudioSources[0].getAttribute('name')).toBe('a8f7g30-a0');

            const oldToNewDiff = new SDPDiffer(new SDP(testSdpOld), new SDP(testSdpNew));
            const sourceAddIq = $iq({})
                .c('jingle', { action: 'source-add' });

            oldToNewDiff.toJingle(sourceAddIq);

            const addedVideoSources = sourceAddIq.nodeTree.querySelectorAll('description[media=\'video\']>source');
            const addedVideoSourceGroups = sourceAddIq.nodeTree.querySelectorAll('description[media=\'video\']>ssrc-group');

            expect(addedVideoSources.length).toBe(2);
            expect(addedVideoSources[0].getAttribute('name')).toBe('a8f7g30-v0');
            expect(addedVideoSources[1].getAttribute('name')).toBe('a8f7g30-v0');
            expect(addedVideoSourceGroups.length).toBe(1);
        });

        it('should send source-remove/source-add when ssrc changes', () => {
            FeatureFlags.init({ });

            const testSdpOld = [
                'v=0\r\n',
                'o=thisisadapterortc 2719486166053431 0 IN IP4 127.0.0.1\r\n',
                's=-\r\n',
                't=0 0\r\n',
                'a=group:BUNDLE audio video\r\n',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
                'a=mid:audio\r\n',
                'a=ssrc:2002 msid:26D16D51-503A-420B-8274-3DD1174E498F 8205D1FC-50B4-407C-87D5-9C45F1B779F0\r\n',
                'a=ssrc:2002 cname:juejgy8a01\r\n',
                'a=ssrc:2002 name:a8f7g30-a0\r\n',
                'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
                'a=mid:video\r\n',
                'a=ssrc:4004 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4005 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4004 cname:juejgy8a01\r\n',
                'a=ssrc:4005 cname:juejgy8a01\r\n',
                'a=ssrc:4004 name:a8f7g30-v0\r\n',
                'a=ssrc:4005 name:a8f7g30-v0\r\n',
                'a=ssrc-group:FID 4004 4005\r\n'
            ].join('');
            const testSdpNew = [
                'v=0\r\n',
                'o=thisisadapterortc 2719486166053431 0 IN IP4 127.0.0.1\r\n',
                's=-\r\n',
                't=0 0\r\n',
                'a=group:BUNDLE audio video\r\n',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
                'a=mid:audio\r\n',
                'a=ssrc:2003 msid:26D16D51-503A-420B-8274-3DD1174E498F 8205D1FC-50B4-407C-87D5-9C45F1B779F0\r\n',
                'a=ssrc:2003 cname:juejgy8a01\r\n',
                'a=ssrc:2003 name:a8f7g30-a0\r\n',
                'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
                'a=mid:video\r\n',
                'a=ssrc:4004 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4005 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4004 cname:juejgy8a01\r\n',
                'a=ssrc:4005 cname:juejgy8a01\r\n',
                'a=ssrc:4004 name:a8f7g30-v0\r\n',
                'a=ssrc:4005 name:a8f7g30-v0\r\n',
                'a=ssrc-group:FID 4004 4005\r\n'
            ].join('');
            const newToOldDiff = new SDPDiffer(new SDP(testSdpNew), new SDP(testSdpOld));
            const sourceRemoveIq = $iq({})
                .c('jingle', { action: 'source-remove' });

            newToOldDiff.toJingle(sourceRemoveIq);

            const removedAudioSources = sourceRemoveIq.nodeTree.querySelectorAll('description[media=\'audio\']>source');
            const removedVideoSources = sourceRemoveIq.nodeTree.querySelectorAll('description[media=\'video\']>source');

            expect(removedAudioSources.length).toBe(1);
            expect(removedAudioSources[0].getAttribute('name')).toBe('a8f7g30-a0');
            expect(removedAudioSources[0].getAttribute('ssrc')).toBe('2002');
            expect(removedVideoSources.length).toBe(0);

            const oldToNewDiff = new SDPDiffer(new SDP(testSdpOld), new SDP(testSdpNew));
            const sourceAddIq = $iq({})
                .c('jingle', { action: 'source-add' });

            oldToNewDiff.toJingle(sourceAddIq);

            const addedAudioSources = sourceAddIq.nodeTree.querySelectorAll('description[media=\'audio\']>source');
            const addedVideoSources = sourceAddIq.nodeTree.querySelectorAll('description[media=\'video\']>source');

            expect(addedAudioSources.length).toBe(1);
            expect(addedAudioSources[0].getAttribute('name')).toBe('a8f7g30-a0');
            expect(addedAudioSources[0].getAttribute('ssrc')).toBe('2003');
            expect(addedVideoSources.length).toBe(0);
        });

        it('should not send source-remove/source-add when nothing changes', () => {
            FeatureFlags.init({ });

            const testSdpOld = [
                'v=0\r\n',
                'o=thisisadapterortc 2719486166053431 0 IN IP4 127.0.0.1\r\n',
                's=-\r\n',
                't=0 0\r\n',
                'a=group:BUNDLE audio video\r\n',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
                'a=mid:audio\r\n',
                'a=ssrc:2002 msid:26D16D51-503A-420B-8274-3DD1174E498F 8205D1FC-50B4-407C-87D5-9C45F1B779F0\r\n',
                'a=ssrc:2002 cname:juejgy8a01\r\n',
                'a=ssrc:2002 name:a8f7g30-a0\r\n',
                'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
                'a=mid:video\r\n',
                'a=ssrc:4004 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4005 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4004 cname:juejgy8a01\r\n',
                'a=ssrc:4005 cname:juejgy8a01\r\n',
                'a=ssrc:4004 name:a8f7g30-v0\r\n',
                'a=ssrc:4005 name:a8f7g30-v0\r\n',
                'a=ssrc-group:FID 4004 4005\r\n'
            ].join('');
            const testSdpNew = [
                'v=0\r\n',
                'o=thisisadapterortc 2719486166053431 0 IN IP4 127.0.0.1\r\n',
                's=-\r\n',
                't=0 0\r\n',
                'a=group:BUNDLE audio video\r\n',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
                'a=mid:audio\r\n',
                'a=ssrc:2002 msid:26D16D51-503A-420B-8274-3DD1174E498F 8205D1FC-50B4-407C-87D5-9C45F1B779F0\r\n',
                'a=ssrc:2002 cname:juejgy8a01\r\n',
                'a=ssrc:2002 name:a8f7g30-a0\r\n',
                'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
                'a=mid:video\r\n',
                'a=ssrc:4004 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4005 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4004 cname:juejgy8a01\r\n',
                'a=ssrc:4005 cname:juejgy8a01\r\n',
                'a=ssrc:4004 name:a8f7g30-v0\r\n',
                'a=ssrc:4005 name:a8f7g30-v0\r\n',
                'a=ssrc-group:FID 4004 4005\r\n'
            ].join('');
            const newToOldDiff = new SDPDiffer(new SDP(testSdpNew), new SDP(testSdpOld));
            const sourceRemoveIq = $iq({})
                .c('jingle', { action: 'source-remove' });

            newToOldDiff.toJingle(sourceRemoveIq);

            const removedAudioSources = sourceRemoveIq.nodeTree.querySelectorAll('description[media=\'audio\']>source');
            const removedVideoSources = sourceRemoveIq.nodeTree.querySelectorAll('description[media=\'video\']>source');

            expect(removedAudioSources.length).toBe(0);
            expect(removedVideoSources.length).toBe(0);

            const oldToNewDiff = new SDPDiffer(new SDP(testSdpOld), new SDP(testSdpNew));
            const sourceAddIq = $iq({})
                .c('jingle', { action: 'source-add' });

            oldToNewDiff.toJingle(sourceAddIq);

            const addedAudioSources = sourceAddIq.nodeTree.querySelectorAll('description[media=\'audio\']>source');
            const addedVideoSources = sourceAddIq.nodeTree.querySelectorAll('description[media=\'video\']>source');

            expect(addedAudioSources.length).toBe(0);
            expect(addedVideoSources.length).toBe(0);
        });

        it('should send source-adds for 2 sources', () => {
            FeatureFlags.init({ });

            const testSdpOld = [
                'v=0\r\n',
                'o=thisisadapterortc 2719486166053431 0 IN IP4 127.0.0.1\r\n',
                's=-\r\n',
                't=0 0\r\n',
                'a=group:BUNDLE audio video\r\n',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
                'a=mid:audio\r\n',
                'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
                'a=mid:video\r\n'
            ].join('');
            const testSdpNew = [
                'v=0\r\n',
                'o=thisisadapterortc 2719486166053431 0 IN IP4 127.0.0.1\r\n',
                's=-\r\n',
                't=0 0\r\n',
                'a=group:BUNDLE audio video\r\n',
                'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
                'a=mid:audio\r\n',
                'a=ssrc:2002 msid:26D16D51-503A-420B-8274-3DD1174E498F 8205D1FC-50B4-407C-87D5-9C45F1B779F0\r\n',
                'a=ssrc:2002 cname:juejgy8a01\r\n',
                'a=ssrc:2002 name:a8f7g30-a0\r\n',
                'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
                'a=mid:video\r\n',
                'a=ssrc:4004 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4005 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
                'a=ssrc:4004 cname:juejgy8a01\r\n',
                'a=ssrc:4005 cname:juejgy8a01\r\n',
                'a=ssrc:4004 name:a8f7g30-v0\r\n',
                'a=ssrc:4005 name:a8f7g30-v0\r\n',
                'a=ssrc-group:FID 4004 4005\r\n'
            ].join('');
            const newToOldDiff = new SDPDiffer(new SDP(testSdpNew), new SDP(testSdpOld));
            const sourceRemoveIq = $iq({})
                .c('jingle', { action: 'source-remove' });

            newToOldDiff.toJingle(sourceRemoveIq);

            const removedAudioSources = sourceRemoveIq.nodeTree.querySelectorAll('description[media=\'audio\']>source');
            const removedVideoSources = sourceRemoveIq.nodeTree.querySelectorAll('description[media=\'video\']>source');

            expect(removedAudioSources.length).toBe(0);
            expect(removedVideoSources.length).toBe(0);

            const oldToNewDiff = new SDPDiffer(new SDP(testSdpOld), new SDP(testSdpNew));
            const sourceAddIq = $iq({})
                .c('jingle', { action: 'source-add' });

            oldToNewDiff.toJingle(sourceAddIq);

            const addedAudioSources = sourceAddIq.nodeTree.querySelectorAll('description[media=\'audio\']>source');
            const addedVideoSources = sourceAddIq.nodeTree.querySelectorAll('description[media=\'video\']>source');
            const addedVideoSourceGroups = sourceAddIq.nodeTree.querySelectorAll('description[media=\'video\']>ssrc-group');

            expect(addedAudioSources.length).toBe(1);
            expect(addedVideoSources.length).toBe(2);
            expect(addedVideoSourceGroups.length).toBe(1);
        });
    });

    describe('getNewMedia', () => {
        it(' should generate sources for source-remove when SSCRs are missing from the new SDP', () => {
            const oldSdp = new SDP(SampleSdpStrings.simulcastSdpStr);
            const newSdp = new SDP(SampleSdpStrings.recvOnlySdpStrChrome);

            let sdpDiffer = new SDPDiffer(newSdp, oldSdp, false);
            let diff = sdpDiffer.getNewMedia();

            // There should be 2 sources for source-remove.
            expect(Object.keys(diff).length).toBe(2);

            sdpDiffer = new SDPDiffer(oldSdp, newSdp, false);
            diff = sdpDiffer.getNewMedia();

            // There should zero sources for source-add.
            expect(Object.keys(diff).length).toBe(0);
        });

        it(' should not generate sources for source-remove or source-add if the SDP does not change', () => {
            const oldSdp = new SDP(SampleSdpStrings.simulcastSdpStr);
            const newSdp = new SDP(SampleSdpStrings.simulcastSdpStr);

            const sdpDiffer = new SDPDiffer(newSdp, oldSdp, false);
            const diff = sdpDiffer.getNewMedia();

            // There should be zero sources in diff.
            expect(Object.keys(diff).length).toBe(0);
        });

        it(' should generate sources for source-remove and source-add when SSRC changes', () => {
            const oldSdp = new SDP(SampleSdpStrings.simulcastSdpStr);
            const newSdp = new SDP(SampleSdpStrings.simulcastDifferentSsrcSdpStr);

            let sdpDiffer = new SDPDiffer(newSdp, oldSdp, false);
            let diff = sdpDiffer.getNewMedia();

            // There should be 1 source for source-remove.
            expect(Object.keys(diff).length).toBe(1);

            sdpDiffer = new SDPDiffer(oldSdp, newSdp, false);
            diff = sdpDiffer.getNewMedia();

            // There should 1 source for source-add.
            expect(Object.keys(diff).length).toBe(1);
        });
    });
});
