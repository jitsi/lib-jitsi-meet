/* globals $ */
import { $iq } from 'strophe.js';
import SDP from './SDP';

/**
 * @param {string} xml - raw xml of the stanza
 */
function createStanzaElement(xml) {
    return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

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

    describe('fromJingle', () => {
        /* eslint-disable max-len*/
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
                <parameter name='x-google-start-bitrate' value='800'/>
            </payload-type>
            <payload-type clockrate='90000' name='rtx' id='96'>
                <rtcp-fb subtype='fir' type='ccm' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <rtcp-fb type='nack' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <rtcp-fb subtype='pli' type='nack' xmlns='urn:xmpp:jingle:apps:rtp:rtcp-fb:0'/>
                <parameter name='apt' value='100'/>
            </payload-type>
            <rtp-hdrext uri='http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time' id='3' xmlns='urn:xmpp:jingle:apps:rtp:rtp-hdrext:0'/>
            <rtp-hdrext uri='http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01' id='5' xmlns='urn:xmpp:jingle:apps:rtp:rtp-hdrext:0'/>
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
o=- 123 2 IN IP4 0.0.0.0
s=-
t=0 0
a=group:BUNDLE audio video
m=audio 1 RTP/SAVPF 111 103 104 126
c=IN IP4 0.0.0.0
a=rtcp:1 IN IP4 0.0.0.0
a=ice-ufrag:someufrag
a=ice-pwd:somepwd
a=fingerprint:sha-256 09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7
a=setup:actpass
a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0
a=candidate:2 1 udp 1694498815 10.0.0.2 10000 typ srflx raddr 10.0.0.1 rport 10000 generation 0
a=sendrecv
a=mid:audio
a=rtcp-mux
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10; useinbandfec=1
a=rtcp-fb:111 transport-cc
a=rtpmap:103 ISAC/16000
a=rtpmap:104 ISAC/32000
a=rtpmap:126 telephone-event/8000
a=fmtp:126 0-15
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level
a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
a=ssrc:4039389863 cname:mixed
a=ssrc:4039389863 label:mixedlabelaudio0
a=ssrc:4039389863 msid:mixedmslabel mixedlabelaudio0
a=ssrc:4039389863 mslabel:mixedmslabel
m=video 1 RTP/SAVPF 100 96
c=IN IP4 0.0.0.0
a=rtcp:1 IN IP4 0.0.0.0
a=ice-ufrag:someufrag
a=ice-pwd:somepwd
a=fingerprint:sha-256 09:B1:51:0F:85:4C:80:19:A1:AF:81:73:47:EE:ED:3D:00:3A:84:C7:76:C1:4E:34:BE:56:F6:42:AD:15:D5:D7
a=setup:actpass
a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0
a=candidate:2 1 udp 1694498815 10.0.0.2 10000 typ srflx raddr 10.0.0.1 rport 10000 generation 0
a=sendrecv
a=mid:video
a=rtcp-mux
a=rtpmap:100 VP8/90000
a=fmtp:100 x-google-start-bitrate=800
a=rtcp-fb:100 ccm fir
a=rtcp-fb:100 nack
a=rtcp-fb:100 nack pli
a=rtcp-fb:100 goog-remb
a=rtcp-fb:100 transport-cc
a=rtpmap:96 rtx/90000
a=fmtp:96 apt=100
a=rtcp-fb:96 ccm fir
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
a=ssrc:3758540092 cname:mixed
a=ssrc:3758540092 label:mixedlabelvideo0
a=ssrc:3758540092 msid:mixedmslabel mixedlabelvideo0
a=ssrc:3758540092 mslabel:mixedmslabel
`.split('\n').join('\r\n');
        /* eslint-enable max-len*/

        it('gets converted to SDP', () => {
            const offer = createStanzaElement(stanza);
            const sdp = new SDP('');

            sdp.fromJingle($(offer).find('>jingle'));
            const rawSDP = sdp.raw.replace(/o=- \d+/, 'o=- 123'); // replace generated o= timestamp.

            expect(rawSDP).toEqual(expectedSDP);
        });
    });
});
