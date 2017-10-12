import { $iq } from 'strophe.js';
import SDP from './SDP';

describe('SDP', () => {
    describe('toJingle', () => {
        /* eslint-disable max-len*/
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
            'a=rtcp-mux\r\n',
            'm=video 9 UDP/TLS/RTP/SAVPF 107 100 99 96\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:107 h264/90000\r\n',
            'a=rtpmap:100 VP8/90000\r\n',
            'a=rtpmap:99 rtx/90000\r\n',
            'a=rtpmap:96 rtx/90000\r\n',
            'a=fmtp:107 x-google-start-bitrate=800\r\n',
            'a=fmtp:100 x-google-start-bitrate=800\r\n',
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
            'a=ssrc-group:FID 4004 4005\r\n',
            'a=rtcp-mux\r\n'
        ].join('');
        /* eslint-enable max-len*/

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

            sdp.toJingle(accept, false);

            const { nodeTree } = accept;
            const descriptions
                = Array.from(nodeTree.getElementsByTagName('description'));
            const videoDescriptions = descriptions.filter(description =>
                description.getAttribute('media') === 'video');
            const count = videoDescriptions.reduce((iterator, description) => {
                const childNodes = Array.from(description.childNodes);
                const childNodesSources = childNodes.filter(child =>
                    child.nodeName === 'source');

                return iterator + childNodesSources.length;
            }, 0);

            expect(count).toBe(2);
        });
    });
});
