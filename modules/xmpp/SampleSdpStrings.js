/* eslint-disable max-len*/
import * as transform from 'sdp-transform';

// A generic sdp session block
const baseSessionSdp = ''
+ 'v=0\r\n'
+ 'o=- 814997227879783433 5 IN IP4 127.0.0.1\r\n'
+ 's=-\r\n'
+ 't=0 0\r\n'
+ 'a=msid-semantic: WMS 0836cc8e-a7bb-47e9-affb-0599414bc56d\r\n'
+ 'a=group:BUNDLE audio video data\r\n';

// A basic sdp audio mline with a single stream
const baseAudioMLineSdp = ''
+ 'm=audio 54405 RTP/SAVPF 111 103 104 126\r\n'
+ 'c=IN IP4 172.29.32.39\r\n'
+ 'a=rtpmap:111 opus/48000/2\r\n'
+ 'a=rtpmap:103 ISAC/16000\r\n'
+ 'a=rtpmap:104 ISAC/32000\r\n'
+ 'a=rtpmap:126 telephone-event/8000\r\n'
+ 'a=fmtp:111 minptime=10;useinbandfec=1\r\n'
+ 'a=rtcp:9 IN IP4 0.0.0.0\r\n'
+ 'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n'
+ 'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n'
+ 'a=setup:passive\r\n'
+ 'a=mid:audio\r\n'
+ 'a=sendrecv\r\n'
+ 'a=ice-ufrag:adPg\r\n'
+ 'a=ice-pwd:Xsr05Mq8S7CR44DAnusZE26F\r\n'
+ 'a=fingerprint:sha-256 6A:39:DE:11:24:AD:2E:4E:63:D6:69:D3:85:05:53:C7:3C:38:A4:B7:91:74:C0:91:44:FC:94:63:7F:01:AB:A9\r\n'
+ 'a=candidate:1581043602 1 udp 2122260223 172.29.32.39 54405 typ host generation 0\r\n'
+ 'a=ssrc:124723944 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc:124723944 msid:dcbb0236-cea5-402e-9e9a-595c65ffcc2a 40abf2d3-a415-4c68-8c17-2a038e8bebcf\r\n'
+ 'a=ssrc:124723944 mslabel:dcbb0236-cea5-402e-9e9a-595c65ffcc2a\r\n'
+ 'a=ssrc:124723944 label:40abf2d3-a415-4c68-8c17-2a038e8bebcf\r\n'
+ 'a=rtcp-mux\r\n';

// A basic sdp application mline
const baseDataMLineSdp = ''
+ 'm=application 9 DTLS/SCTP 5000\r\n'
+ 'c=IN IP4 0.0.0.0\r\n'
+ 'b=AS:30\r\n'
+ 'a=setup:passive\r\n'
+ 'a=mid:data\r\n'
+ 'a=ice-ufrag:adPg\r\n'
+ 'a=ice-pwd:Xsr05Mq8S7CR44DAnusZE26F\r\n'
+ 'a=fingerprint:sha-256 6A:39:DE:11:24:AD:2E:4E:63:D6:69:D3:85:05:53:C7:3C:38:A4:B7:91:74:C0:91:44:FC:94:63:7F:01:AB:A9\r\n'
+ 'a=sctpmap:5000 webrtc-datachannel 1024\r\n';

// A basic sdp video mline with a single stream
const plainVideoMLineSdp = ''
+ 'm=video 9 RTP/SAVPF 100\r\n'
+ 'c=IN IP4 0.0.0.0\r\n'
+ 'a=rtpmap:100 VP8/90000\r\n'
+ 'a=rtcp:9 IN IP4 0.0.0.0\r\n'
+ 'a=rtcp-fb:100 ccm fir\r\n'
+ 'a=rtcp-fb:100 nack\r\n'
+ 'a=rtcp-fb:100 nack pli\r\n'
+ 'a=rtcp-fb:100 goog-remb\r\n'
+ 'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n'
+ 'a=setup:passive\r\n'
+ 'a=mid:video\r\n'
+ 'a=sendrecv\r\n'
+ 'a=ice-ufrag:adPg\r\n'
+ 'a=ice-pwd:Xsr05Mq8S7CR44DAnusZE26F\r\n'
+ 'a=fingerprint:sha-256 6A:39:DE:11:24:AD:2E:4E:63:D6:69:D3:85:05:53:C7:3C:38:A4:B7:91:74:C0:91:44:FC:94:63:7F:01:AB:A9\r\n'
+ 'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=rtcp-mux\r\n';

// A basic sdp video mline with a single stream and multiple codecs
const multiCodecVideoMLine = ''
+ 'm=video 9 RTP/SAVPF 100 126 97\r\n'
+ 'c=IN IP4 0.0.0.0\r\n'
+ 'a=rtpmap:100 VP8/90000\r\n'
+ 'a=rtpmap:126 H264/90000\r\n'
+ 'a=rtpmap:97 H264/90000\r\n'
+ 'a=rtcp:9 IN IP4 0.0.0.0\r\n'
+ 'a=rtcp-fb:100 ccm fir\r\n'
+ 'a=rtcp-fb:100 nack\r\n'
+ 'a=rtcp-fb:100 nack pli\r\n'
+ 'a=rtcp-fb:100 goog-remb\r\n'
+ 'a=fmtp:126 profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1\r\n'
+ 'a=fmtp:97 profile-level-id=42e01f;level-asymmetry-allowed=1\r\n'
+ 'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n'
+ 'a=setup:passive\r\n'
+ 'a=mid:video\r\n'
+ 'a=sendrecv\r\n'
+ 'a=ice-ufrag:adPg\r\n'
+ 'a=ice-pwd:Xsr05Mq8S7CR44DAnusZE26F\r\n'
+ 'a=fingerprint:sha-256 6A:39:DE:11:24:AD:2E:4E:63:D6:69:D3:85:05:53:C7:3C:38:A4:B7:91:74:C0:91:44:FC:94:63:7F:01:AB:A9\r\n'
+ 'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=rtcp-mux\r\n';

// An sdp video mline with 3 simulcast streams
const simulcastVideoMLineSdp = ''
+ 'm=video 9 RTP/SAVPF 100\r\n'
+ 'c=IN IP4 0.0.0.0\r\n'
+ 'a=rtpmap:100 VP8/90000\r\n'
+ 'a=rtcp:9 IN IP4 0.0.0.0\r\n'
+ 'a=rtcp-fb:100 ccm fir\r\n'
+ 'a=rtcp-fb:100 nack\r\n'
+ 'a=rtcp-fb:100 nack pli\r\n'
+ 'a=rtcp-fb:100 goog-remb\r\n'
+ 'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n'
+ 'a=setup:passive\r\n'
+ 'a=mid:video\r\n'
+ 'a=sendrecv\r\n'
+ 'a=ice-ufrag:adPg\r\n'
+ 'a=ice-pwd:Xsr05Mq8S7CR44DAnusZE26F\r\n'
+ 'a=fingerprint:sha-256 6A:39:DE:11:24:AD:2E:4E:63:D6:69:D3:85:05:53:C7:3C:38:A4:B7:91:74:C0:91:44:FC:94:63:7F:01:AB:A9\r\n'
+ 'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc:1479742055 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:1479742055 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc:1089111804 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:1089111804 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc-group:SIM 1757014965 1479742055 1089111804\r\n'
+ 'a=rtcp-mux\r\n';

// An sdp video mline with a single video stream and a
//  corresponding rtx stream
const rtxVideoMLineSdp = ''
+ 'm=video 9 RTP/SAVPF 100 96\r\n'
+ 'c=IN IP4 0.0.0.0\r\n'
+ 'a=rtpmap:100 VP8/90000\r\n'
+ 'a=fmtp:96 apt=100\r\n'
+ 'a=rtcp:9 IN IP4 0.0.0.0\r\n'
+ 'a=rtcp-fb:100 ccm fir\r\n'
+ 'a=rtcp-fb:100 nack\r\n'
+ 'a=rtcp-fb:100 nack pli\r\n'
+ 'a=rtcp-fb:100 goog-remb\r\n'
+ 'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n'
+ 'a=setup:passive\r\n'
+ 'a=mid:video\r\n'
+ 'a=sendrecv\r\n'
+ 'a=ice-ufrag:adPg\r\n'
+ 'a=ice-pwd:Xsr05Mq8S7CR44DAnusZE26F\r\n'
+ 'a=fingerprint:sha-256 6A:39:DE:11:24:AD:2E:4E:63:D6:69:D3:85:05:53:C7:3C:38:A4:B7:91:74:C0:91:44:FC:94:63:7F:01:AB:A9\r\n'
+ 'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc:984899560 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:984899560 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc-group:FID 1757014965 984899560\r\n'
+ 'a=rtcp-mux\r\n';

// An sdp video mline with 3 simulcast streams and 3 rtx streams
const simulcastRtxVideoMLineSdp = ''
+ 'm=video 9 RTP/SAVPF 100 96\r\n'
+ 'c=IN IP4 0.0.0.0\r\n'
+ 'a=rtpmap:100 VP8/90000\r\n'
+ 'a=fmtp:96 apt=100\r\n'
+ 'a=rtcp:9 IN IP4 0.0.0.0\r\n'
+ 'a=rtcp-fb:100 ccm fir\r\n'
+ 'a=rtcp-fb:100 nack\r\n'
+ 'a=rtcp-fb:100 nack pli\r\n'
+ 'a=rtcp-fb:100 goog-remb\r\n'
+ 'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n'
+ 'a=setup:passive\r\n'
+ 'a=mid:video\r\n'
+ 'a=sendrecv\r\n'
+ 'a=ice-ufrag:adPg\r\n'
+ 'a=ice-pwd:Xsr05Mq8S7CR44DAnusZE26F\r\n'
+ 'a=fingerprint:sha-256 6A:39:DE:11:24:AD:2E:4E:63:D6:69:D3:85:05:53:C7:3C:38:A4:B7:91:74:C0:91:44:FC:94:63:7F:01:AB:A9\r\n'
+ 'a=ssrc:1757014965 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:1757014965 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc:1479742055 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:1479742055 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc:1089111804 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:1089111804 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc:855213044 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:855213044 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc:984899560 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:984899560 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc:2963867077 msid:0836cc8e-a7bb-47e9-affb-0599414bc56d bdbd2c0a-7959-4578-8db5-9a6a1aec4ecf\r\n'
+ 'a=ssrc:2963867077 cname:peDGrDD6WsxUOki/\r\n'
+ 'a=ssrc-group:FID 1757014965 984899560\r\n'
+ 'a=ssrc-group:FID 1479742055 855213044\r\n'
+ 'a=ssrc-group:FID 1089111804 2963867077\r\n'
+ 'a=ssrc-group:SIM 1757014965 1479742055 1089111804\r\n'
+ 'a=rtcp-mux\r\n';

// An sdp video mline with 1 video ssrc, 1 video rtx ssrc and one flexfec ssrc
const flexFecVideoMLineSdp = ''
+ 'm=video 9 RTP/SAVPF 100 107 101 96 99 97 109\r\n'
+ 'c=IN IP4 0.0.0.0\r\n'
+ 'a=rtcp:9 IN IP4 0.0.0.0\r\n'
+ 'a=ice-ufrag:aLBh\r\n'
+ 'a=ice-pwd:7IeqrWG5ryCW2X47Lso8XYdK\r\n'
+ 'a=ice-options:trickle\r\n'
+ 'a=fingerprint:sha-256 78:3C:F9:96:85:FB:20:25:F8:2F:AB:37:8B:8B:17:29:EF:54:7B:7C:17:2E:90:02:8A:A1:8F:A7:F9:C5:F2:90\r\n'
+ 'a=setup:active\r\n'
+ 'a=mid:video\r\n'
+ 'a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n'
+ 'a=sendrecv\r\n'
+ 'a=rtcp-mux\r\n'
+ 'a=rtpmap:100 VP8/90000\r\n'
+ 'a=rtcp-fb:100 goog-remb\r\n'
+ 'a=rtcp-fb:100 ccm fir\r\n'
+ 'a=rtcp-fb:100 nack\r\n'
+ 'a=rtcp-fb:100 nack pli\r\n'
+ 'a=rtpmap:107 h264/90000\r\n'
+ 'a=rtcp-fb:107 goog-remb\r\n'
+ 'a=rtcp-fb:107 ccm fir\r\n'
+ 'a=rtcp-fb:107 nack\r\n'
+ 'a=rtcp-fb:107 nack pli\r\n'
+ 'a=fmtp:107 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\n'
+ 'a=rtpmap:101 VP9/90000\r\n'
+ 'a=rtcp-fb:101 goog-remb\r\n'
+ 'a=rtcp-fb:101 ccm fir\r\n'
+ 'a=rtcp-fb:101 nack\r\n'
+ 'a=rtcp-fb:101 nack pli\r\n'
+ 'a=rtpmap:96 rtx/90000\r\n'
+ 'a=fmtp:96 apt=100\r\n'
+ 'a=rtpmap:99 rtx/90000\r\n'
+ 'a=fmtp:99 apt=107\r\n'
+ 'a=rtpmap:97 rtx/90000\r\n'
+ 'a=fmtp:97 apt=101\r\n'
+ 'a=rtpmap:109 flexfec-03/90000\r\n'
+ 'a=fmtp:109 repair-window=10000000\r\n'
+ 'a=ssrc-group:FID 2864950112 2236303754\r\n'
+ 'a=ssrc-group:FEC-FR 2864950112 116623191\r\n'
+ 'a=ssrc:2864950112 cname:mT86hcsCZwQBPh6R\r\n'
+ 'a=ssrc:2864950112 msid:a2548ae2-32e8-4b09-89bc-b11f3e49ac5a b3e3d760-6b1b-48bd-8519-9d6261311d28\r\n'
+ 'a=ssrc:2864950112 mslabel:a2548ae2-32e8-4b09-89bc-b11f3e49ac5a\r\n'
+ 'a=ssrc:2864950112 label:b3e3d760-6b1b-48bd-8519-9d6261311d28\r\n'
+ 'a=ssrc:2236303754 cname:mT86hcsCZwQBPh6R\r\n'
+ 'a=ssrc:2236303754 msid:a2548ae2-32e8-4b09-89bc-b11f3e49ac5a b3e3d760-6b1b-48bd-8519-9d6261311d28\r\n'
+ 'a=ssrc:2236303754 mslabel:a2548ae2-32e8-4b09-89bc-b11f3e49ac5a\r\n'
+ 'a=ssrc:2236303754 label:b3e3d760-6b1b-48bd-8519-9d6261311d28\r\n'
+ 'a=ssrc:116623191 cname:mT86hcsCZwQBPh6R\r\n'
+ 'a=ssrc:116623191 msid:a2548ae2-32e8-4b09-89bc-b11f3e49ac5a b3e3d760-6b1b-48bd-8519-9d6261311d28\r\n'
+ 'a=ssrc:116623191 mslabel:a2548ae2-32e8-4b09-89bc-b11f3e49ac5a\r\n'
+ 'a=ssrc:116623191 label:b3e3d760-6b1b-48bd-8519-9d6261311d28\r\n'
+ 'm=application 9 DTLS/SCTP 5000\r\n'
+ 'c=IN IP4 0.0.0.0\r\n'
+ 'b=AS:30\r\n'
+ 'a=ice-ufrag:aLBh\r\n'
+ 'a=ice-pwd:7IeqrWG5ryCW2X47Lso8XYdK\r\n'
+ 'a=ice-options:trickle\r\n'
+ 'a=fingerprint:sha-256 78:3C:F9:96:85:FB:20:25:F8:2F:AB:37:8B:8B:17:29:EF:54:7B:7C:17:2E:90:02:8A:A1:8F:A7:F9:C5:F2:90\r\n'
+ 'a=setup:active\r\n'
+ 'a=mid:data\r\n'
+ 'a=sctpmap:5000 webrtc-datachannel 1024\r\n';

// A full sdp string representing a client doing simulcast
const simulcastSdpStr = baseSessionSdp + baseAudioMLineSdp + simulcastVideoMLineSdp + baseDataMLineSdp;

// A full sdp string representing a client doing simulcast and rtx
const simulcastRtxSdpStr = baseSessionSdp + baseAudioMLineSdp + simulcastRtxVideoMLineSdp + baseDataMLineSdp;

// A full sdp string representing a client doing a single video stream
const plainVideoSdpStr = baseSessionSdp + baseAudioMLineSdp + plainVideoMLineSdp + baseDataMLineSdp;

// A full sdp string representing a client doing a single video stream with rtx
const rtxVideoSdpStr = baseSessionSdp + baseAudioMLineSdp + rtxVideoMLineSdp + baseDataMLineSdp;

// A full sdp string representing a client doing a single video stream with multiple codec options
const multiCodecVideoSdpStr = baseSessionSdp + baseAudioMLineSdp + multiCodecVideoMLine + baseDataMLineSdp;

// A full sdp string representing a client doing a single video stream with flexfec
const flexFecSdpStr = baseSessionSdp + baseAudioMLineSdp + flexFecVideoMLineSdp + baseDataMLineSdp;

export default {
    get simulcastSdp() {
        return transform.parse(simulcastSdpStr);
    },

    get simulcastRtxSdp() {
        return transform.parse(simulcastRtxSdpStr);
    },

    get plainVideoSdp() {
        return transform.parse(plainVideoSdpStr);
    },

    get rtxVideoSdp() {
        return transform.parse(rtxVideoSdpStr);
    },

    get multiCodecVideoSdp() {
        return transform.parse(multiCodecVideoSdpStr);
    },

    get flexFecSdp() {
        return transform.parse(flexFecSdpStr);
    }
};

/* eslint-enable max-len*/
