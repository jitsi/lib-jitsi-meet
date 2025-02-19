import $ from 'jquery';
import { $iq } from 'strophe.js';

import FeatureFlags from '../flags/FeatureFlags';
import { expandSourcesFromJson } from '../xmpp/JingleHelperFunctions';

import SDP from './SDP';

/* eslint-disable max-len */

/**
 * @param {string} xml - raw xml of the stanza
 */
function createStanzaElement(xml) {
    return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('SDP', () => {
    afterEach(() => {
        FeatureFlags.init({ });
    });
    describe('toJingle', () => {
        const testSdp = [
            'v=0\r\n',
            'o=thisisadapterortc 2719486166053431 0 IN IP4 127.0.0.1\r\n',
            's=-\r\n',
            't=0 0\r\n',
            'a=group:BUNDLE audio video\r\n',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:111 opus/48000/2\r\n',
            'a=rtpmap:126 telephone-event/8000\r\n',
            'a=fmtp:126 0-15\r\n',
            'a=fmtp:111 minptime=10;useinbandfec=1\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=setup:active\r\n',
            'a=mid:audio\r\n',
            'a=msid:26D16D51-503A-420B-8274-3DD1174E498F 8205D1FC-50B4-407C-87D5-9C45F1B779F0\r\n',
            'a=sendrecv\r\n',
            'a=ice-ufrag:tOQd\r\n',
            'a=ice-pwd:3sAozs7hw6+2O6DBp2pt9fvY\r\n',
            'a=fingerprint:sha-256 A9:00:CC:F9:81:33:EA:E9:E3:B4:01:E9:9E:18:B3:9B:F8:49:25:A0:5D:12:20:70:D5:6F:34:5A:2A:39:19:0A\r\n',
            'a=ssrc:2002 msid:26D16D51-503A-420B-8274-3DD1174E498F 8205D1FC-50B4-407C-87D5-9C45F1B779F0\r\n',
            'a=ssrc:2002 cname:juejgy8a01\r\n',
            'a=ssrc:2002 name:a8f7g30-a0\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:107 h264/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 goog-remb\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 goog-remb\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap-allow-mixed\r\n',
            'a=setup:active\r\n',
            'a=mid:video\r\n',
            'a=msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
            'a=sendrecv\r\n',
            'a=ice-ufrag:tOQd\r\n',
            'a=ice-pwd:3sAozs7hw6+2O6DBp2pt9fvY\r\n',
            'a=fingerprint:sha-256 A9:00:CC:F9:81:33:EA:E9:E3:B4:01:E9:9E:18:B3:9B:F8:49:25:A0:5D:12:20:70:D5:6F:34:5A:2A:39:19:0A\r\n',
            'a=ssrc:4004 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
            'a=ssrc:4005 msid:7C0035E5-2DA1-4AEA-804A-9E75BF9B3768 225E9CDA-0384-4C92-92DD-E74C1153EC68\r\n',
            'a=ssrc:4004 cname:juejgy8a01\r\n',
            'a=ssrc:4005 cname:juejgy8a01\r\n',
            'a=ssrc:4004 name:a8f7g30-v0\r\n',
            'a=ssrc:4005 name:a8f7g30-v0\r\n',
            'a=ssrc-group:FID 4004 4005\r\n',
            'a=rtcp-mux\r\n'
        ].join('');

        it('correctly groups ssrcs lines that are not in order', () => {
            const sdp = new SDP(testSdp);
            const accept = $iq({
                to: 'peerjid',
                type: 'set'
            })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'session-accept',
                initiator: false,
                responder: true,
                sid: 'temp-sid'
            });

            sdp.toJingle(accept, 'responder');

            const { nodeTree } = accept;
            const videoSources = nodeTree.querySelectorAll('description[media=\'video\']>source');

            expect(videoSources.length).toBe(2);
        });
        it('put source names as source element attributes', () => {
            FeatureFlags.init({ });

            const sdp = new SDP(testSdp);
            const accept = $iq({
                to: 'peerjid',
                type: 'set'
            })
                .c('jingle', {
                    xmlns: 'urn:xmpp:jingle:1',
                    action: 'session-accept',
                    initiator: false,
                    responder: true,
                    sid: 'temp-sid'
                });

            sdp.toJingle(accept, 'responder');

            const { nodeTree } = accept;

            const audioSources = nodeTree.querySelectorAll('description[media=\'audio\']>source');
            const videoSources = nodeTree.querySelectorAll('description[media=\'video\']>source');

            for (const source of audioSources) {
                expect(source.getAttribute('name')).toBe('a8f7g30-a0');
            }

            for (const source of videoSources) {
                expect(source.getAttribute('name')).toBe('a8f7g30-v0');
            }
        });
    });

    describe('toJingle for multiple m-lines', () => {
        const testSdp = [
            'v=0\r\n',
            'o=- 6251210045590020951 2 IN IP4 127.0.0.1\r\n',
            's=-\r\n',
            't=0 0\r\n',
            'a=msid-semantic:  WMS\r\n',
            'a=group:BUNDLE 0 1 2\r\n',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:111 opus/48000/2\r\n',
            'a=rtpmap:126 telephone-event/8000\r\n',
            'a=fmtp:111 minptime=10;useinbandfec=1\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:111 transport-cc\r\n',
            'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:0\r\n',
            'a=msid:- 5caf9eeb-f846-43cf-8868-78ed2e0fea74\r\n',
            'a=sendrecv\r\n',
            'a=ice-ufrag:gi+W\r\n',
            'a=ice-pwd:NmFZJ6NWoC2gjagIudLFWI8Q\r\n',
            'a=fingerprint:sha-256 41:1D:49:50:40:0D:68:9F:C6:AB:B2:14:98:67:E7:06:70:F0:B2:4A:5C:AB:03:F3:89:AF:B0:11:AF:05:2D:D6\r\n',
            'a=ice-options:trickle\r\n',
            'a=ssrc:3134174615 cname:Ypjacq/wapOqDJKy\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 101 97 100 96 107 99 41 42\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:101 VP9/90000\r\n',
            'a=rtpmap:97 rtx/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=rtpmap:107 H264/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:41 AV1/90000\r\n',
            'a=rtpmap:42 rtx/90000\r\n',
            'a=fmtp:101 profile-id=0\r\n',
            'a=fmtp:97 apt=101\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=fmtp:107 ;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:41 level-idx=5;profile=0;tier=0\r\n',
            'a=fmtp:42 apt=41\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:101 ccm fir\r\n',
            'a=rtcp-fb:101 nack\r\n',
            'a=rtcp-fb:101 nack pli\r\n',
            'a=rtcp-fb:101 transport-cc\r\n',
            'a=rtcp-fb:97 ccm fir\r\n',
            'a=rtcp-fb:97 nack\r\n',
            'a=rtcp-fb:97 nack pli\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:107 ccm fir\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 transport-cc\r\n',
            'a=rtcp-fb:41 ccm fir\r\n',
            'a=rtcp-fb:41 nack\r\n',
            'a=rtcp-fb:41 nack pli\r\n',
            'a=rtcp-fb:41 transport-cc\r\n',
            'a=rtcp-fb:42 ccm fir\r\n',
            'a=rtcp-fb:42 nack\r\n',
            'a=rtcp-fb:42 nack pli\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:1\r\n',
            'a=msid:- 84615c77-2441-4d1f-801d-591a4bc1beaa\r\n',
            'a=sendrecv\r\n',
            'a=ice-ufrag:gi+W\r\n',
            'a=ice-pwd:NmFZJ6NWoC2gjagIudLFWI8Q\r\n',
            'a=fingerprint:sha-256 41:1D:49:50:40:0D:68:9F:C6:AB:B2:14:98:67:E7:06:70:F0:B2:4A:5C:AB:03:F3:89:AF:B0:11:AF:05:2D:D6\r\n',
            'a=ice-options:trickle\r\n',
            'a=ssrc:691901703 cname:Ypjacq/wapOqDJKy\r\n',
            'a=ssrc:3967743536 cname:Ypjacq/wapOqDJKy\r\n',
            'a=ssrc:691901703 msid:- 84615c77-2441-4d1f-801d-591a4bc1beaa\r\n',
            'a=ssrc:3967743536 msid:- 84615c77-2441-4d1f-801d-591a4bc1beaa\r\n',
            'a=ssrc:4098097822 cname:Ypjacq/wapOqDJKy\r\n',
            'a=ssrc:4098097822 msid:- 84615c77-2441-4d1f-801d-591a4bc1beaa\r\n',
            'a=ssrc:731566086 cname:Ypjacq/wapOqDJKy\r\n',
            'a=ssrc:731566086 msid:- 84615c77-2441-4d1f-801d-591a4bc1beaa\r\n',
            'a=ssrc:2374965413 cname:Ypjacq/wapOqDJKy\r\n',
            'a=ssrc:2374965413 msid:- 84615c77-2441-4d1f-801d-591a4bc1beaa\r\n',
            'a=ssrc:3680614139 cname:Ypjacq/wapOqDJKy\r\n',
            'a=ssrc:3680614139 msid:- 84615c77-2441-4d1f-801d-591a4bc1beaa\r\n',
            'a=ssrc-group:FID 691901703 3967743536\r\n',
            'a=ssrc-group:SIM 691901703 4098097822 731566086\r\n',
            'a=ssrc-group:FID 4098097822 2374965413\r\n',
            'a=ssrc-group:FID 731566086 3680614139\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=setup:active\r\n',
            'a=mid:2\r\n',
            'a=ice-ufrag:gi+W\r\n',
            'a=ice-pwd:NmFZJ6NWoC2gjagIudLFWI8Q\r\n',
            'a=fingerprint:sha-256 41:1D:49:50:40:0D:68:9F:C6:AB:B2:14:98:67:E7:06:70:F0:B2:4A:5C:AB:03:F3:89:AF:B0:11:AF:05:2D:D6\r\n',
            'a=ice-options:trickle\r\n',
            'a=sctp-port:5000\r\n',
            'a=max-message-size:262144\r\n'
        ].join('');

        it('correctly groups ssrcs lines', () => {
            const sdp = new SDP(testSdp);
            const accept = $iq({
                to: 'peerjid',
                type: 'set'
            })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'session-accept',
                initiator: false,
                responder: true,
                sid: 'temp-sid'
            });

            sdp.toJingle(accept, 'responder');
            const { nodeTree } = accept;
            const content = nodeTree.querySelectorAll('jingle>content');

            expect(content.length).toBe(3);
            const videoSources = nodeTree.querySelectorAll('description[media=\'video\']>source');

            expect(videoSources.length).toBe(6);
            const audioSources = nodeTree.querySelectorAll('description[media=\'audio\']>source');

            expect(audioSources.length).toBe(1);
            const videoSourceGroups = nodeTree.querySelectorAll('description[media=\'video\']>ssrc-group');

            expect(videoSourceGroups.length).toBe(4);
            const data = nodeTree.querySelectorAll('jingle>content[name=\'data\']');

            expect(data.length).toBe(1);
        });
    });

    describe('toJingle for multiple m-lines with recv-only', () => {
        const testSdp = [
            'v=0\r\n',
            'o=- 8014175770430016012 6 IN IP4 127.0.0.1\r\n',
            's=-\r\n',
            't=0 0\r\n',
            'a=msid-semantic:  WMS\r\n',
            'a=group:BUNDLE 0 1 2 3 4 5 6 7\r\n',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:111 opus/48000/2\r\n',
            'a=rtpmap:126 telephone-event/8000\r\n',
            'a=fmtp:111 minptime=10;useinbandfec=1\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:111 transport-cc\r\n',
            'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:0\r\n',
            'a=msid:- 836692af-4ea9-432f-811c-fef6ec7ee612\r\n',
            'a=sendrecv\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=candidate:4240059272 1 UDP 2122260223 x.x.x.x 54192 typ host\r\n',
            'a=ice-options:trickle\r\n',
            'a=ssrc:2833013218 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:2833013218 msid:- 836692af-4ea9-432f-811c-fef6ec7ee612\r\n',
            'a=ssrc:2833013218 name:abcd-a0\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 101 97 100 96 107 99 41 42\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:101 VP9/90000\r\n',
            'a=rtpmap:97 rtx/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=rtpmap:107 H264/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:41 AV1/90000\r\n',
            'a=rtpmap:42 rtx/90000\r\n',
            'a=fmtp:101 profile-id=0\r\n',
            'a=fmtp:97 apt=101\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=fmtp:107 ;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:41 level-idx=5;profile=0;tier=0\r\n',
            'a=fmtp:42 apt=41\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:101 ccm fir\r\n',
            'a=rtcp-fb:101 nack\r\n',
            'a=rtcp-fb:101 nack pli\r\n',
            'a=rtcp-fb:101 transport-cc\r\n',
            'a=rtcp-fb:97 ccm fir\r\n',
            'a=rtcp-fb:97 nack\r\n',
            'a=rtcp-fb:97 nack pli\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:107 ccm fir\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 transport-cc\r\n',
            'a=rtcp-fb:41 ccm fir\r\n',
            'a=rtcp-fb:41 nack\r\n',
            'a=rtcp-fb:41 nack pli\r\n',
            'a=rtcp-fb:41 transport-cc\r\n',
            'a=rtcp-fb:42 ccm fir\r\n',
            'a=rtcp-fb:42 nack\r\n',
            'a=rtcp-fb:42 nack pli\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:1\r\n',
            'a=msid:- 72254a21-ae73-4c0e-bd47-e84a2d3b9474\r\n',
            'a=sendrecv\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=ssrc:1261622218 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:1261622218 msid:- 7c3aee52-697e-446e-a898-9ea470a19b27\r\n',
            'a=ssrc:1261622218 videoType:camera\r\n',
            'a=ssrc:1261622218 name:abcd-v0\r\n',
            'a=ssrc:2809057491 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:2809057491 msid:- 7c3aee52-697e-446e-a898-9ea470a19b27\r\n',
            'a=ssrc:2809057491 videoType:camera\r\n',
            'a=ssrc:2809057491 name:abcd-v0\r\n',
            'a=ssrc:4223705690 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:4223705690 msid:- 7c3aee52-697e-446e-a898-9ea470a19b27\r\n',
            'a=ssrc:4223705690 videoType:camera\r\n',
            'a=ssrc:4223705690 name:abcd-v0\r\n',
            'a=ssrc:44482421 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:44482421 msid:- 7c3aee52-697e-446e-a898-9ea470a19b27\r\n',
            'a=ssrc:44482421 videoType:camera\r\n',
            'a=ssrc:44482421 name:abcd-v0\r\n',
            'a=ssrc:1408200021 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:1408200021 msid:- 7c3aee52-697e-446e-a898-9ea470a19b27\r\n',
            'a=ssrc:1408200021 videoType:camera\r\n',
            'a=ssrc:1408200021 name:abcd-v0\r\n',
            'a=ssrc:712505591 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:712505591 msid:- 7c3aee52-697e-446e-a898-9ea470a19b27\r\n',
            'a=ssrc:712505591 videoType:camera\r\n',
            'a=ssrc:712505591 name:abcd-v0\r\n',
            'a=ssrc-group:FID 1261622218 2809057491\r\n',
            'a=ssrc-group:SIM 1261622218 4223705690 44482421\r\n',
            'a=ssrc-group:FID 4223705690 1408200021\r\n',
            'a=ssrc-group:FID 44482421 712505591\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=setup:active\r\n',
            'a=mid:2\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=sctp-port:5000\r\n',
            'a=max-message-size:262144\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 101 97 100 96 107 99 41 42\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:101 VP9/90000\r\n',
            'a=rtpmap:97 rtx/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=rtpmap:107 H264/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:41 AV1/90000\r\n',
            'a=rtpmap:42 rtx/90000\r\n',
            'a=fmtp:101 profile-id=0\r\n',
            'a=fmtp:97 apt=101\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=fmtp:107 ;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:41 level-idx=5;profile=0;tier=0\r\n',
            'a=fmtp:42 apt=41\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:101 ccm fir\r\n',
            'a=rtcp-fb:101 nack\r\n',
            'a=rtcp-fb:101 nack pli\r\n',
            'a=rtcp-fb:101 transport-cc\r\n',
            'a=rtcp-fb:97 ccm fir\r\n',
            'a=rtcp-fb:97 nack\r\n',
            'a=rtcp-fb:97 nack pli\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:107 ccm fir\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 transport-cc\r\n',
            'a=rtcp-fb:41 ccm fir\r\n',
            'a=rtcp-fb:41 nack\r\n',
            'a=rtcp-fb:41 nack pli\r\n',
            'a=rtcp-fb:41 transport-cc\r\n',
            'a=rtcp-fb:42 ccm fir\r\n',
            'a=rtcp-fb:42 nack\r\n',
            'a=rtcp-fb:42 nack pli\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=extmap:11 https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension\r\n',
            'a=setup:active\r\n',
            'a=mid:3\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 101 97 100 96 107 99 41 42\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:101 VP9/90000\r\n',
            'a=rtpmap:97 rtx/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=rtpmap:107 H264/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:41 AV1/90000\r\n',
            'a=rtpmap:42 rtx/90000\r\n',
            'a=fmtp:101 profile-id=0\r\n',
            'a=fmtp:97 apt=101\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=fmtp:107 ;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:41 level-idx=5;profile=0;tier=0\r\n',
            'a=fmtp:42 apt=41\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:101 ccm fir\r\n',
            'a=rtcp-fb:101 nack\r\n',
            'a=rtcp-fb:101 nack pli\r\n',
            'a=rtcp-fb:101 transport-cc\r\n',
            'a=rtcp-fb:97 ccm fir\r\n',
            'a=rtcp-fb:97 nack\r\n',
            'a=rtcp-fb:97 nack pli\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:107 ccm fir\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 transport-cc\r\n',
            'a=rtcp-fb:41 ccm fir\r\n',
            'a=rtcp-fb:41 nack\r\n',
            'a=rtcp-fb:41 nack pli\r\n',
            'a=rtcp-fb:41 transport-cc\r\n',
            'a=rtcp-fb:42 ccm fir\r\n',
            'a=rtcp-fb:42 nack\r\n',
            'a=rtcp-fb:42 nack pli\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=extmap:11 https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension\r\n',
            'a=setup:active\r\n',
            'a=mid:4\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:111 opus/48000/2\r\n',
            'a=rtpmap:126 telephone-event/8000\r\n',
            'a=fmtp:111 minptime=10;useinbandfec=1\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:111 transport-cc\r\n',
            'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:5\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:111 opus/48000/2\r\n',
            'a=rtpmap:126 telephone-event/8000\r\n',
            'a=fmtp:111 minptime=10;useinbandfec=1\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:111 transport-cc\r\n',
            'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:6\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 101 97 100 96 107 99 41 42\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:101 VP9/90000\r\n',
            'a=rtpmap:97 rtx/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=rtpmap:107 H264/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:41 AV1/90000\r\n',
            'a=rtpmap:42 rtx/90000\r\n',
            'a=fmtp:101 profile-id=0\r\n',
            'a=fmtp:97 apt=101\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=fmtp:107 ;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:41 level-idx=5;profile=0;tier=0\r\n',
            'a=fmtp:42 apt=41\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:101 ccm fir\r\n',
            'a=rtcp-fb:101 nack\r\n',
            'a=rtcp-fb:101 nack pli\r\n',
            'a=rtcp-fb:101 transport-cc\r\n',
            'a=rtcp-fb:97 ccm fir\r\n',
            'a=rtcp-fb:97 nack\r\n',
            'a=rtcp-fb:97 nack pli\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:107 ccm fir\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 transport-cc\r\n',
            'a=rtcp-fb:41 ccm fir\r\n',
            'a=rtcp-fb:41 nack\r\n',
            'a=rtcp-fb:41 nack pli\r\n',
            'a=rtcp-fb:41 transport-cc\r\n',
            'a=rtcp-fb:42 ccm fir\r\n',
            'a=rtcp-fb:42 nack\r\n',
            'a=rtcp-fb:42 nack pli\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:7\r\n',
            'a=msid:- 7c3aee52-697e-446e-a898-9ea470a19b26\r\n',
            'a=sendonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=ssrc:4074534577 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:4074534577 msid:- 7c3aee52-697e-446e-a898-9ea470a19b26\r\n',
            'a=ssrc:4074534577 videoType:desktop\r\n',
            'a=ssrc:4074534577 name:abcd-v1\r\n',
            'a=ssrc:3122913012 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:3122913012 msid:- 7c3aee52-697e-446e-a898-9ea470a19b26\r\n',
            'a=ssrc:3122913012 videoType:desktop\r\n',
            'a=ssrc:3122913012 name:abcd-v1\r\n',
            'a=ssrc:3145321104 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:3145321104 msid:- 7c3aee52-697e-446e-a898-9ea470a19b26\r\n',
            'a=ssrc:3145321104 videoType:desktop\r\n',
            'a=ssrc:3145321104 name:abcd-v1\r\n',
            'a=ssrc:2686550307 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:2686550307 msid:- 7c3aee52-697e-446e-a898-9ea470a19b26\r\n',
            'a=ssrc:2686550307 videoType:desktop\r\n',
            'a=ssrc:2686550307 name:abcd-v1\r\n',
            'a=ssrc:2960588630 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:2960588630 msid:- 7c3aee52-697e-446e-a898-9ea470a19b26\r\n',
            'a=ssrc:2960588630 videoType:desktop\r\n',
            'a=ssrc:2960588630 name:abcd-v1\r\n',
            'a=ssrc:3495860096 cname:0T+Z3AzTbva5NoHF\r\n',
            'a=ssrc:3495860096 msid:- 7c3aee52-697e-446e-a898-9ea470a19b26\r\n',
            'a=ssrc:3495860096 videoType:desktop\r\n',
            'a=ssrc:3495860096 name:abcd-v1\r\n',
            'a=ssrc-group:FID 4074534577 3122913012\r\n',
            'a=ssrc-group:SIM 4074534577 3145321104 2686550307\r\n',
            'a=ssrc-group:FID 3145321104 2960588630\r\n',
            'a=ssrc-group:FID 2686550307 3495860096\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n'
        ].join('');

        it('correctly groups ssrcs lines', () => {
            const sdp = new SDP(testSdp);
            const accept = $iq({
                to: 'peerjid',
                type: 'set'
            })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'session-accept',
                initiator: false,
                responder: true,
                sid: 'temp-sid'
            });

            sdp.toJingle(accept, 'responder');
            const { nodeTree } = accept;
            const content = nodeTree.querySelectorAll('jingle>content');

            expect(content.length).toBe(3);
            const videoSources = nodeTree.querySelectorAll('description[media=\'video\']>source');

            expect(videoSources.length).toBe(12);
            const audioSources = nodeTree.querySelectorAll('description[media=\'audio\']>source');

            expect(audioSources.length).toBe(1);
            const videoSourceGroups = nodeTree.querySelectorAll('description[media=\'video\']>ssrc-group');

            expect(videoSourceGroups.length).toBe(8);
            const data = nodeTree.querySelectorAll('jingle>content[name=\'data\']');

            expect(data.length).toBe(1);
        });
    });

    describe('toJingle for multiple m-lines with only recv-only', () => {
        const testSdp = [
            'v=0\r\n',
            'o=- 8014175770430016012 6 IN IP4 127.0.0.1\r\n',
            's=-\r\n',
            't=0 0\r\n',
            'a=msid-semantic:  WMS\r\n',
            'a=group:BUNDLE 0 1 2 3 4 5 6 7\r\n',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:111 opus/48000/2\r\n',
            'a=rtpmap:126 telephone-event/8000\r\n',
            'a=fmtp:111 minptime=10;useinbandfec=1\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:111 transport-cc\r\n',
            'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:0\r\n',
            'a=msid:- 836692af-4ea9-432f-811c-fef6ec7ee612\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=candidate:4240059272 1 UDP 2122260223 x.x.x.x 54192 typ host\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 101 97 100 96 107 99 41 42\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:101 VP9/90000\r\n',
            'a=rtpmap:97 rtx/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=rtpmap:107 H264/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:41 AV1/90000\r\n',
            'a=rtpmap:42 rtx/90000\r\n',
            'a=fmtp:101 profile-id=0\r\n',
            'a=fmtp:97 apt=101\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=fmtp:107 ;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:41 level-idx=5;profile=0;tier=0\r\n',
            'a=fmtp:42 apt=41\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:101 ccm fir\r\n',
            'a=rtcp-fb:101 nack\r\n',
            'a=rtcp-fb:101 nack pli\r\n',
            'a=rtcp-fb:101 transport-cc\r\n',
            'a=rtcp-fb:97 ccm fir\r\n',
            'a=rtcp-fb:97 nack\r\n',
            'a=rtcp-fb:97 nack pli\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:107 ccm fir\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 transport-cc\r\n',
            'a=rtcp-fb:41 ccm fir\r\n',
            'a=rtcp-fb:41 nack\r\n',
            'a=rtcp-fb:41 nack pli\r\n',
            'a=rtcp-fb:41 transport-cc\r\n',
            'a=rtcp-fb:42 ccm fir\r\n',
            'a=rtcp-fb:42 nack\r\n',
            'a=rtcp-fb:42 nack pli\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:1\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=setup:active\r\n',
            'a=mid:2\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=sctp-port:5000\r\n',
            'a=max-message-size:262144\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 101 97 100 96 107 99 41 42\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:101 VP9/90000\r\n',
            'a=rtpmap:97 rtx/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=rtpmap:107 H264/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:41 AV1/90000\r\n',
            'a=rtpmap:42 rtx/90000\r\n',
            'a=fmtp:101 profile-id=0\r\n',
            'a=fmtp:97 apt=101\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=fmtp:107 ;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:41 level-idx=5;profile=0;tier=0\r\n',
            'a=fmtp:42 apt=41\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:101 ccm fir\r\n',
            'a=rtcp-fb:101 nack\r\n',
            'a=rtcp-fb:101 nack pli\r\n',
            'a=rtcp-fb:101 transport-cc\r\n',
            'a=rtcp-fb:97 ccm fir\r\n',
            'a=rtcp-fb:97 nack\r\n',
            'a=rtcp-fb:97 nack pli\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:107 ccm fir\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 transport-cc\r\n',
            'a=rtcp-fb:41 ccm fir\r\n',
            'a=rtcp-fb:41 nack\r\n',
            'a=rtcp-fb:41 nack pli\r\n',
            'a=rtcp-fb:41 transport-cc\r\n',
            'a=rtcp-fb:42 ccm fir\r\n',
            'a=rtcp-fb:42 nack\r\n',
            'a=rtcp-fb:42 nack pli\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=extmap:11 https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension\r\n',
            'a=setup:active\r\n',
            'a=mid:3\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 101 97 100 96 107 99 41 42\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:101 VP9/90000\r\n',
            'a=rtpmap:97 rtx/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=rtpmap:107 H264/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:41 AV1/90000\r\n',
            'a=rtpmap:42 rtx/90000\r\n',
            'a=fmtp:101 profile-id=0\r\n',
            'a=fmtp:97 apt=101\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=fmtp:107 ;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:41 level-idx=5;profile=0;tier=0\r\n',
            'a=fmtp:42 apt=41\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:101 ccm fir\r\n',
            'a=rtcp-fb:101 nack\r\n',
            'a=rtcp-fb:101 nack pli\r\n',
            'a=rtcp-fb:101 transport-cc\r\n',
            'a=rtcp-fb:97 ccm fir\r\n',
            'a=rtcp-fb:97 nack\r\n',
            'a=rtcp-fb:97 nack pli\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:107 ccm fir\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 transport-cc\r\n',
            'a=rtcp-fb:41 ccm fir\r\n',
            'a=rtcp-fb:41 nack\r\n',
            'a=rtcp-fb:41 nack pli\r\n',
            'a=rtcp-fb:41 transport-cc\r\n',
            'a=rtcp-fb:42 ccm fir\r\n',
            'a=rtcp-fb:42 nack\r\n',
            'a=rtcp-fb:42 nack pli\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=extmap:11 https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension\r\n',
            'a=setup:active\r\n',
            'a=mid:4\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:111 opus/48000/2\r\n',
            'a=rtpmap:126 telephone-event/8000\r\n',
            'a=fmtp:111 minptime=10;useinbandfec=1\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:111 transport-cc\r\n',
            'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:5\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:111 opus/48000/2\r\n',
            'a=rtpmap:126 telephone-event/8000\r\n',
            'a=fmtp:111 minptime=10;useinbandfec=1\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:111 transport-cc\r\n',
            'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:6\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 101 97 100 96 107 99 41 42\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:101 VP9/90000\r\n',
            'a=rtpmap:97 rtx/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=rtpmap:107 H264/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:41 AV1/90000\r\n',
            'a=rtpmap:42 rtx/90000\r\n',
            'a=fmtp:101 profile-id=0\r\n',
            'a=fmtp:97 apt=101\r\n',
            'a=fmtp:96 apt=100\r\n',
            'a=fmtp:107 ;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n',
            'a=fmtp:99 apt=107\r\n',
            'a=fmtp:41 level-idx=5;profile=0;tier=0\r\n',
            'a=fmtp:42 apt=41\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:101 ccm fir\r\n',
            'a=rtcp-fb:101 nack\r\n',
            'a=rtcp-fb:101 nack pli\r\n',
            'a=rtcp-fb:101 transport-cc\r\n',
            'a=rtcp-fb:97 ccm fir\r\n',
            'a=rtcp-fb:97 nack\r\n',
            'a=rtcp-fb:97 nack pli\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:107 ccm fir\r\n',
            'a=rtcp-fb:107 nack\r\n',
            'a=rtcp-fb:107 nack pli\r\n',
            'a=rtcp-fb:107 transport-cc\r\n',
            'a=rtcp-fb:41 ccm fir\r\n',
            'a=rtcp-fb:41 nack\r\n',
            'a=rtcp-fb:41 nack pli\r\n',
            'a=rtcp-fb:41 transport-cc\r\n',
            'a=rtcp-fb:42 ccm fir\r\n',
            'a=rtcp-fb:42 nack\r\n',
            'a=rtcp-fb:42 nack pli\r\n',
            'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=setup:active\r\n',
            'a=mid:7\r\n',
            'a=recvonly\r\n',
            'a=ice-ufrag:/5Yo\r\n',
            'a=ice-pwd:Bn+13yvssP5vicDc0mUO7Aiu\r\n',
            'a=fingerprint:sha-256 54:99:99:D2:C9:FE:63:B2:12:A5:D6:BA:BD:FA:F0:46:7E:E4:18:F8:9C:DF:25:55:94:DA:21:AE:19:19:56:AB\r\n',
            'a=ice-options:trickle\r\n',
            'a=rtcp-mux\r\n',
            'a=extmap-allow-mixed\r\n'
        ].join('');

        it('correctly groups ssrcs lines', () => {
            const sdp = new SDP(testSdp);
            const accept = $iq({
                to: 'peerjid',
                type: 'set'
            })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'session-accept',
                initiator: false,
                responder: true,
                sid: 'temp-sid'
            });

            sdp.toJingle(accept, 'responder');
            const { nodeTree } = accept;
            const content = nodeTree.querySelectorAll('jingle>content');

            expect(content.length).toBe(3);
            const videoSources = nodeTree.querySelectorAll('description[media=\'video\']>source');

            expect(videoSources.length).toBe(0);
            const audioSources = nodeTree.querySelectorAll('description[media=\'audio\']>source');

            expect(audioSources.length).toBe(0);
            const videoSourceGroups = nodeTree.querySelectorAll('description[media=\'video\']>ssrc-group');

            expect(videoSourceGroups.length).toBe(0);
            const data = nodeTree.querySelectorAll('jingle>content[name=\'data\']');

            expect(data.length).toBe(1);
        });
    });

    describe('fromJingle', () => {
        let sdp;

        beforeEach(() => {
            sdp = new SDP('');
        });

        it('should handle no sources', () => {
            const jingle = $(
                `<jingle xmlns='urn:xmpp:jingle:1'>
                    <content name='audio'>
                        <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/>
                    </content>
                </jingle>`
            );

            sdp.fromJingle(jingle);

            expect(sdp.raw).toContain('m=audio');
        });

        it('gets converted to SDP', () => {
            const stanza = `<iq>
<jingle action='session-initiate' initiator='focus' sid='123' xmlns='urn:xmpp:jingle:1'>
    <content creator='initiator' name='audio' senders='both'>
        <description media='audio' maxptime='60' xmlns='urn:xmpp:jingle:apps:rtp:1'>
            <payload-type channels='2' clockrate='48000' name='opus' id='111'>
                <parameter name='minptime' value='10'/>
                <parameter name='useinbandfec' value='1'/>
                <rtcp-fb type='transport-cc' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
            </payload-type>
            <payload-type clockrate='16000' name='ISAC' id='103'/>
            <payload-type clockrate='32000' name='ISAC' id='104'/>
            <payload-type clockrate='8000' name='telephone-event' id='126'>
                <parameter name="" value="0-15"/>
            </payload-type>
            <rtp-hdrext uri='urn:ietf:params:rtp-hdrext:ssrc-audio-level' id='1' xmlns='urn:xmpp:jingle:apps:rtp:rtp-hdrext:0'/>
            <rtp-hdrext uri='http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01' id='5' xmlns='urn:xmpp:jingle:apps:rtp:rtp-hdrext:0'/>
            <extmap-allow-mixed xmlns='urn:xmpp:jingle:apps:rtp:rtp-hdrext:0'/>
            <rtcp-mux/>
            <source ssrc='4039389863' xmlns='urn:xmpp:jingle:apps:rtp:ssma:0'>
                <parameter name='cname' value='mixed'/>
                <parameter name='label' value='mixedlabelaudio0'/>
                <parameter name='msid' value='mixedmslabel mixedlabelaudio0'/>
                <parameter name='mslabel' value='mixedmslabel'/>
            </source>
        </description>
        <transport ufrag='someufrag' pwd='somepwd' xmlns='urn:xmpp:jingle:transports:ice-udp:1'>
            <fingerprint hash='sha-256' required='false' setup='actpass' xmlns='urn:xmpp:jingle:apps:dtls:0'>09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7</fingerprint>
            <candidate foundation='1' id='3cbe5aea5bde0c1401a60bbc2' network='0' protocol='udp' generation='0' port='10000' priority='2130706431' type='host' ip='10.0.0.1' component='1'/>
            <candidate rel-addr='10.0.0.1' network='0' foundation='2' id='dfcfd075bde0c140ffffffff927646ba' port='10000' protocol='udp' generation='0' rel-port='10000' priority='1694498815' type='srflx' ip='10.0.0.2' component='1'/>
        </transport>
    </content>
    <content creator='initiator' name='video' senders='both'>
        <description media='video' xmlns='urn:xmpp:jingle:apps:rtp:1'>
            <payload-type clockrate='90000' name='VP8' id='100'>
                <rtcp-fb subtype='fir' type='ccm' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <rtcp-fb type='nack' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <rtcp-fb subtype='pli' type='nack' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <rtcp-fb type='goog-remb' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <rtcp-fb type='transport-cc' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
            </payload-type>
            <payload-type clockrate='90000' name='rtx' id='96'>
                <rtcp-fb subtype='fir' type='ccm' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <rtcp-fb type='nack' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <rtcp-fb subtype='pli' type='nack' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <parameter name='apt' value='100'/>
            </payload-type>
            <rtp-hdrext uri='http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time' id='3' xmlns='urn:xmpp:jingle:apps:rtp:rtp-hdrext:0'/>
            <rtp-hdrext uri='http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01' id='5' xmlns='urn:xmpp:jingle:apps:rtp:rtp-hdrext:0'/>
            <extmap-allow-mixed xmlns='urn:xmpp:jingle:apps:rtp:rtp-hdrext:0'/>
            <rtcp-mux/>
            <source ssrc='3758540092' xmlns='urn:xmpp:jingle:apps:rtp:ssma:0'>
                <parameter name='cname' value='mixed'/>
                <parameter name='label' value='mixedlabelvideo0'/>
                <parameter name='msid' value='mixedmslabel mixedlabelvideo0'/>
                <parameter name='mslabel' value='mixedmslabel'/>
            </source>
        </description>
        <transport ufrag='someufrag' pwd='somepwd' xmlns='urn:xmpp:jingle:transports:ice-udp:1'>
            <fingerprint hash='sha-256' required='false' setup='actpass' xmlns='urn:xmpp:jingle:apps:dtls:0'>09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7</fingerprint>
            <candidate foundation='1' id='3cbe5aea5bde0c1401a60bbc2' network='0' protocol='udp' generation='0' port='10000' priority='2130706431' type='host' ip='10.0.0.1' component='1'/>
            <candidate rel-addr='10.0.0.1' network='0' foundation='2' id='dfcfd075bde0c140ffffffff927646ba' port='10000' protocol='udp' generation='0' rel-port='10000' priority='1694498815' type='srflx' ip='10.0.0.2' component='1'/>
        </transport>
    </content>
    <group semantics='BUNDLE' xmlns='urn:xmpp:jingle:apps:grouping:0'>
        <content name='audio'/>
        <content name='video'/>
    </group>
</jingle></iq>`;
            const expectedSDP = `v=0
o=- 123 3 IN IP4 0.0.0.0
s=-
t=0 0
a=msid-semantic: WMS *
a=group:BUNDLE 0 1
m=audio 9 UDP/TLS/RTP/SAVPF 111 103 104 126
c=IN IP4 0.0.0.0
a=rtpmap:111 opus/48000/2
a=rtpmap:103 ISAC/16000
a=rtpmap:104 ISAC/32000
a=rtpmap:126 telephone-event/8000
a=fmtp:111 minptime=10;useinbandfec=1
a=fmtp:126 0-15
a=rtcp:1 IN IP4 0.0.0.0
a=rtcp-fb:111 transport-cc
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level
a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
a=setup:actpass
a=mid:0
a=sendrecv
a=ice-ufrag:someufrag
a=ice-pwd:somepwd
a=fingerprint:sha-256 09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7
a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0
a=candidate:2 1 udp 1694498815 10.0.0.2 10000 typ srflx raddr 10.0.0.1 rport 10000 generation 0
a=ssrc:4039389863 cname:mixed
a=rtcp-mux
a=extmap-allow-mixed
m=video 9 UDP/TLS/RTP/SAVPF 100 96
c=IN IP4 0.0.0.0
a=rtpmap:100 VP8/90000
a=rtpmap:96 rtx/90000
a=fmtp:96 apt=100
a=rtcp:1 IN IP4 0.0.0.0
a=rtcp-fb:100 ccm fir
a=rtcp-fb:100 nack
a=rtcp-fb:100 nack pli
a=rtcp-fb:100 goog-remb
a=rtcp-fb:100 transport-cc
a=rtcp-fb:96 ccm fir
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
a=setup:actpass
a=mid:1
a=sendrecv
a=ice-ufrag:someufrag
a=ice-pwd:somepwd
a=fingerprint:sha-256 09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7
a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0
a=candidate:2 1 udp 1694498815 10.0.0.2 10000 typ srflx raddr 10.0.0.1 rport 10000 generation 0
a=ssrc:3758540092 cname:mixed
a=rtcp-mux
a=extmap-allow-mixed
`.split('\n').join('\r\n');
            const offer = createStanzaElement(stanza);

            sdp.fromJingle($(offer).find('>jingle'));
            const rawSDP = sdp.raw.replace(/o=- \d+/, 'o=- 123'); // replace generated o= timestamp.

            expect(rawSDP).toEqual(expectedSDP);
        });

        it('fromJingleWithJSONFormat gets converted to SDP', () => {
            const stanza = `
    <iq>
        <jingle xmlns="urn:xmpp:jingle:1" action="session-initiate" initiator="focus" sid="123">
            <content name="audio" creator="initiator" senders="both">
                <description xmlns="urn:xmpp:jingle:apps:rtp:1" maxptime="60" media="audio">
                    <payload-type name="opus" clockrate="48000" id="111" channels="2">
                        <parameter value="10" name="minptime"/>
                        <parameter value="1" name="useinbandfec"/>
                        <rtcp-fb xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0" type="transport-cc"/>
                    </payload-type>
                    <payload-type name="ISAC" clockrate="16000" id="103"/>
                    <payload-type name="ISAC" clockrate="32000" id="104"/>
                    <payload-type name="telephone-event" clockrate="8000" id="126"/>
                    <rtp-hdrext xmlns="urn:xmpp:jingle:apps:rtp:rtp-hdrext:0" id="1" uri="urn:ietf:params:rtp-hdrext:ssrc-audio-level"/>
                    <rtp-hdrext xmlns="urn:xmpp:jingle:apps:rtp:rtp-hdrext:0" id="5" uri="http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"/>
                    <rtcp-mux/>
                </description>
                <transport ufrag='someufrag' pwd='somepwd' xmlns='urn:xmpp:jingle:transports:ice-udp:1'>
                    <fingerprint hash='sha-256' required='false' setup='actpass' xmlns='urn:xmpp:jingle:apps:dtls:0'>09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7</fingerprint>
                    <candidate foundation='1' id='3cbe5aea5bde0c1401a60bbc2' network='0' protocol='udp' generation='0' port='10000' priority='2130706431' type='host' ip='10.0.0.1' component='1'/>
                    <candidate rel-addr='10.0.0.1' network='0' foundation='2' id='dfcfd075bde0c140ffffffff927646ba' port='10000' protocol='udp' generation='0' rel-port='10000' priority='1694498815' type='srflx' ip='10.0.0.2' component='1'/>
                </transport>
            </content>
            <content name="video" creator="initiator" senders="both">
                <description xmlns="urn:xmpp:jingle:apps:rtp:1" media="video">
                    <payload-type name="VP8" clockrate="90000" id="100">
                        <rtcp-fb xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0" subtype="fir" type="ccm"/>
                        <rtcp-fb xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0" type="nack"/>
                        <rtcp-fb xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0" subtype="pli" type="nack"/>
                        <rtcp-fb xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0" type="transport-cc"/>
                    </payload-type>
                    <payload-type name="rtx" clockrate="90000" id="96">
                        <parameter value="100" name="apt"/>
                        <rtcp-fb xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0" subtype="fir" type="ccm"/>
                        <rtcp-fb xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0" type="nack"/>
                        <rtcp-fb xmlns="urn:xmpp:jingle:apps:rtp:rtcp-fb:0" subtype="pli" type="nack"/>
                    </payload-type>
                    <rtp-hdrext xmlns="urn:xmpp:jingle:apps:rtp:rtp-hdrext:0" id="3" uri="http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time"/>
                    <rtp-hdrext xmlns="urn:xmpp:jingle:apps:rtp:rtp-hdrext:0" id="5" uri="http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"/>
                    <rtcp-mux/>
                </description>
                <transport ufrag='someufrag' pwd='somepwd' xmlns='urn:xmpp:jingle:transports:ice-udp:1'>
                    <fingerprint hash='sha-256' required='false' setup='actpass' xmlns='urn:xmpp:jingle:apps:dtls:0'>09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7</fingerprint>
                    <candidate foundation='1' id='3cbe5aea5bde0c1401a60bbc2' network='0' protocol='udp' generation='0' port='10000' priority='2130706431' type='host' ip='10.0.0.1' component='1'/>
                    <candidate rel-addr='10.0.0.1' network='0' foundation='2' id='dfcfd075bde0c140ffffffff927646ba' port='10000' protocol='udp' generation='0' rel-port='10000' priority='1694498815' type='srflx' ip='10.0.0.2' component='1'/>
                </transport>
            </content>
            <group xmlns="urn:xmpp:jingle:apps:grouping:0" semantics="BUNDLE">
                <content name="audio"/>
                <content name="video"/>
            </group>
            <json-message xmlns="http://jitsi.org/jitmeet">{"sources":{"831de82b":[[{"s":257838819,"m":"831de82b-video-1 9bb949d4-5abd-4498-98e9-2be1222b8d3e-1"},{"s":865670341,"m":"831de82b-video-1 9bb949d4-5abd-4498-98e9-2be1222b8d3e-1"}],[["f",257838819,865670341]],[]],"07af8d49":[[{"s":110279275,"m":"07af8d49-video-2 f685aa25-0318-442e-bd00-cd2a911236da-2"},{"s":3873826414,"m":"07af8d49-video-2 f685aa25-0318-442e-bd00-cd2a911236da-2"}],[["f",3873826414,110279275]],[]],"95edea8d":[[{"s":620660772,"m":"95edea8d-video-1 0c5d94d1-1902-4fb7-bf6a-76517d065d02-1"},{"s":2306112481,"m":"95edea8d-video-1 0c5d94d1-1902-4fb7-bf6a-76517d065d02-1"}],[["f",2306112481,620660772]],[]],"jvb":[[{"s":1427774514,"m":"mixedmslabel mixedlabelvideo0","c":"mixed"}],[],[{"s":3659539811,"m":"mixedmslabel mixedlabelaudio0","c":"mixed"}]]}}</json-message>
        </jingle>
    </iq>`;
            const expectedSDP = `v=0
o=- 123 3 IN IP4 0.0.0.0
s=-
t=0 0
a=msid-semantic: WMS *
a=group:BUNDLE 0 1 2 3 4
m=audio 9 UDP/TLS/RTP/SAVPF 111 103 104 126
c=IN IP4 0.0.0.0
a=rtpmap:111 opus/48000/2
a=rtpmap:103 ISAC/16000
a=rtpmap:104 ISAC/32000
a=rtpmap:126 telephone-event/8000
a=fmtp:111 minptime=10;useinbandfec=1
a=rtcp:1 IN IP4 0.0.0.0
a=rtcp-fb:111 transport-cc
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level
a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
a=setup:actpass
a=mid:0
a=sendrecv
a=ice-ufrag:someufrag
a=ice-pwd:somepwd
a=fingerprint:sha-256 09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7
a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0
a=candidate:2 1 udp 1694498815 10.0.0.2 10000 typ srflx raddr 10.0.0.1 rport 10000 generation 0
a=ssrc:3659539811 msid:mixedmslabel mixedlabelaudio0
a=rtcp-mux
m=video 9 UDP/TLS/RTP/SAVPF 100 96
c=IN IP4 0.0.0.0
a=rtpmap:100 VP8/90000
a=rtpmap:96 rtx/90000
a=fmtp:96 apt=100
a=rtcp:1 IN IP4 0.0.0.0
a=rtcp-fb:100 ccm fir
a=rtcp-fb:100 nack
a=rtcp-fb:100 nack pli
a=rtcp-fb:100 transport-cc
a=rtcp-fb:96 ccm fir
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
a=setup:actpass
a=mid:1
a=sendrecv
a=ice-ufrag:someufrag
a=ice-pwd:somepwd
a=fingerprint:sha-256 09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7
a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0
a=candidate:2 1 udp 1694498815 10.0.0.2 10000 typ srflx raddr 10.0.0.1 rport 10000 generation 0
a=ssrc:1427774514 msid:mixedmslabel mixedlabelvideo0
a=rtcp-mux
m=video 9 UDP/TLS/RTP/SAVPF 100 96
c=IN IP4 0.0.0.0
a=rtpmap:100 VP8/90000
a=rtpmap:96 rtx/90000
a=fmtp:96 apt=100
a=rtcp:1 IN IP4 0.0.0.0
a=rtcp-fb:100 ccm fir
a=rtcp-fb:100 nack
a=rtcp-fb:100 nack pli
a=rtcp-fb:100 transport-cc
a=rtcp-fb:96 ccm fir
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
a=setup:actpass
a=mid:2
a=sendonly
a=ice-ufrag:someufrag
a=ice-pwd:somepwd
a=fingerprint:sha-256 09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7
a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0
a=candidate:2 1 udp 1694498815 10.0.0.2 10000 typ srflx raddr 10.0.0.1 rport 10000 generation 0
a=ssrc:257838819 msid:831de82b-video-1 9bb949d4-5abd-4498-98e9-2be1222b8d3e-1
a=ssrc:865670341 msid:831de82b-video-1 9bb949d4-5abd-4498-98e9-2be1222b8d3e-1
a=ssrc-group:FID 257838819 865670341
a=rtcp-mux
m=video 9 UDP/TLS/RTP/SAVPF 100 96
c=IN IP4 0.0.0.0
a=rtpmap:100 VP8/90000
a=rtpmap:96 rtx/90000
a=fmtp:96 apt=100
a=rtcp:1 IN IP4 0.0.0.0
a=rtcp-fb:100 ccm fir
a=rtcp-fb:100 nack
a=rtcp-fb:100 nack pli
a=rtcp-fb:100 transport-cc
a=rtcp-fb:96 ccm fir
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
a=setup:actpass
a=mid:3
a=sendonly
a=ice-ufrag:someufrag
a=ice-pwd:somepwd
a=fingerprint:sha-256 09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7
a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0
a=candidate:2 1 udp 1694498815 10.0.0.2 10000 typ srflx raddr 10.0.0.1 rport 10000 generation 0
a=ssrc:110279275 msid:07af8d49-video-2 f685aa25-0318-442e-bd00-cd2a911236da-2
a=ssrc:3873826414 msid:07af8d49-video-2 f685aa25-0318-442e-bd00-cd2a911236da-2
a=ssrc-group:FID 3873826414 110279275
a=rtcp-mux
m=video 9 UDP/TLS/RTP/SAVPF 100 96
c=IN IP4 0.0.0.0
a=rtpmap:100 VP8/90000
a=rtpmap:96 rtx/90000
a=fmtp:96 apt=100
a=rtcp:1 IN IP4 0.0.0.0
a=rtcp-fb:100 ccm fir
a=rtcp-fb:100 nack
a=rtcp-fb:100 nack pli
a=rtcp-fb:100 transport-cc
a=rtcp-fb:96 ccm fir
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
a=setup:actpass
a=mid:4
a=sendonly
a=ice-ufrag:someufrag
a=ice-pwd:somepwd
a=fingerprint:sha-256 09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7
a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0
a=candidate:2 1 udp 1694498815 10.0.0.2 10000 typ srflx raddr 10.0.0.1 rport 10000 generation 0
a=ssrc:620660772 msid:95edea8d-video-1 0c5d94d1-1902-4fb7-bf6a-76517d065d02-1
a=ssrc:2306112481 msid:95edea8d-video-1 0c5d94d1-1902-4fb7-bf6a-76517d065d02-1
a=ssrc-group:FID 2306112481 620660772
a=rtcp-mux
`.split('\n').join('\r\n');
            const offer = createStanzaElement(stanza);
            const jsonMessages = $(offer).find('jingle>json-message');

            for (let i = 0; i < jsonMessages.length; i++) {
                expandSourcesFromJson(offer, jsonMessages[i]);
            }

            sdp.fromJingle($(offer).find('>jingle'));
            const rawSDP = sdp.raw.replace(/o=- \d+/, 'o=- 123'); // replace generated o= timestamp.

            expect(rawSDP).toEqual(expectedSDP);
        });
    });

    /* eslint-disable max-len */
    describe('jingle2media', () => {
        it('should convert basic Jingle content to SDP', () => {
            const jingleContent = createStanzaElement(`
                <content name="audio">
                    <description media="audio" xmlns="urn:xmpp:jingle:apps:rtp:1">
                        <payload-type id="111" name="opus" clockrate="48000" channels="2"/>
                    </description>
                    <transport xmlns="urn:xmpp:jingle:transports:ice-udp:1">
                        <candidate foundation="1" component="1" protocol="udp" priority="2130706431" ip="192.168.1.1" port="10000" type="host"/>
                    </transport>
                </content>
            `);

            const sdp = new SDP('');
            const media = sdp.jingle2media($(jingleContent));

            expect(media).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 111');
            expect(media).toContain('a=rtpmap:111 opus/48000/2');
            expect(media).toContain('c=IN IP4 0.0.0.0');
            expect(media).toContain('a=candidate:1 1 udp 2130706431 192.168.1.1 10000 typ host');
        });

        it('should convert Jingle content with multiple payload types to SDP', () => {
            const jingleContent = createStanzaElement(`
                <content name="video">
                    <description media="video" xmlns="urn:xmpp:jingle:apps:rtp:1">
                        <payload-type id="100" name="VP8" clockrate="90000"/>
                        <payload-type id="101" name="VP9" clockrate="90000"/>
                    </description>
                    <transport xmlns="urn:xmpp:jingle:transports:ice-udp:1">
                        <candidate foundation="1" component="1" protocol="udp" priority="2130706431" ip="192.168.1.1" port="10000" type="host"/>
                    </transport>
                </content>
            `);

            const sdp = new SDP('');
            const media = sdp.jingle2media($(jingleContent));

            expect(media).toContain('m=video 9 UDP/TLS/RTP/SAVPF 100 101');
            expect(media).toContain('a=rtpmap:100 VP8/90000');
            expect(media).toContain('a=rtpmap:101 VP9/90000');
            expect(media).toContain('c=IN IP4 0.0.0.0');
            expect(media).toContain('a=candidate:1 1 udp 2130706431 192.168.1.1 10000 typ host');
        });

        it('should convert Jingle content with ICE candidates to SDP', () => {
            const jingleContent = createStanzaElement(`
                <content name="audio">
                    <description media="audio" xmlns="urn:xmpp:jingle:apps:rtp:1">
                        <payload-type id="111" name="opus" clockrate="48000" channels="2"/>
                    </description>
                    <transport xmlns="urn:xmpp:jingle:transports:ice-udp:1">
                        <candidate foundation="1" component="1" protocol="udp" priority="2130706431" ip="192.168.1.1" port="10000" type="host"/>
                        <candidate foundation="2" component="1" protocol="tcp" priority="2130706430" ip="192.168.1.2" port="10001" type="host"/>
                    </transport>
                </content>
            `);

            const sdp = new SDP('');
            const media = sdp.jingle2media($(jingleContent));

            expect(media).toContain('a=candidate:1 1 udp 2130706431 192.168.1.1 10000 typ host');
            expect(media).toContain('a=candidate:2 1 tcp 2130706430 192.168.1.2 10001 typ host');
        });
    });
});
