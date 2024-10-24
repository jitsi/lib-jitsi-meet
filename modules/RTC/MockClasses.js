import transform from 'sdp-transform';

import Listenable from '../util/Listenable';

/* eslint-disable no-empty-function */
/* eslint-disable max-len */

/**
 * MockRTCPeerConnection that return the local description sdp.
 */
class MockRTCPeerConnection {
    /**
     * local description SDP.
     */
    get localDescription() {
        return { sdp: [
            'v=0\r\n',
            'o=- 2074571967553371465 5 IN IP4 127.0.0.1\r\n',
            's=-\r\n',
            't=0 0\r\n',
            'a=msid-semantic: WMS 2a9e4328-59f4-4af5-883f-4b265ac854d6\r\n',
            'a=group:BUNDLE 0 1\r\n',
            'a=extmap-allow-mixed\r\n',
            'm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:111 opus/48000/2\r\n',
            'a=rtpmap:126 telephone-event/8000\r\n',
            'a=fmtp:126 0-15\r\n',
            'a=fmtp:111 minptime=10;useinbandfec=1\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=setup:active\r\n',
            'a=mid:0\r\n',
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
            'm=video 9 UDP/TLS/RTP/SAVPF 100 98 96 45\r\n',
            'c=IN IP4 0.0.0.0\r\n',
            'a=rtpmap:100 VP9/90000\r\n',
            'a=rtpmap:98 VP9/90000\r\n',
            'a=rtpmap:96 VP8/90000\r\n',
            'a=rtpmap:45 AV1/90000\r\n',
            'a=fmtp:100 profile-id=2\r\n',
            'a=fmtp:98 profile-id=0\r\n',
            'a=rtcp:9 IN IP4 0.0.0.0\r\n',
            'a=rtcp-fb:100 goog-remb\r\n',
            'a=rtcp-fb:100 transport-cc\r\n',
            'a=rtcp-fb:100 ccm fir\r\n',
            'a=rtcp-fb:100 nack\r\n',
            'a=rtcp-fb:100 nack pli\r\n',
            'a=rtcp-fb:98 goog-remb\r\n',
            'a=rtcp-fb:98 transport-cc\r\n',
            'a=rtcp-fb:98 ccm fir\r\n',
            'a=rtcp-fb:98 nack\r\n',
            'a=rtcp-fb:98 nack pli\r\n',
            'a=rtcp-fb:96 goog-remb\r\n',
            'a=rtcp-fb:96 transport-cc\r\n',
            'a=rtcp-fb:96 ccm fir\r\n',
            'a=rtcp-fb:96 nack\r\n',
            'a=rtcp-fb:96 nack pli\r\n',
            'a=rtcp-fb:45 goog-remb\r\n',
            'a=rtcp-fb:45 transport-cc\r\n',
            'a=rtcp-fb:45 ccm fir\r\n',
            'a=rtcp-fb:45 nack\r\n',
            'a=rtcp-fb:45 nack pli\r\n',
            'a=extmap:14 urn:ietf:params:rtp-hdrext:toffset\r\n',
            'a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n',
            'a=extmap:13 urn:3gpp:video-orientation\r\n',
            'a=extmap:3 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n',
            'a=extmap:5 http://www.webrtc.org/experiments/rtp-hdrext/playout-delay\r\n',
            'a=extmap:6 http://www.webrtc.org/experiments/rtp-hdrext/video-content-type\r\n',
            'a=extmap:7 http://www.webrtc.org/experiments/rtp-hdrext/video-timing\r\n',
            'a=extmap:8 http://www.webrtc.org/experiments/rtp-hdrext/color-space\r\n',
            'a=extmap:4 urn:ietf:params:rtp-hdrext:sdes:mid\r\n',
            'a=extmap:10 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r\n',
            'a=extmap:11 urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id\r\n',
            'a=setup:actpass\r\n',
            'a=mid:1\r\n',
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
        ].join('') };
    }
}

/**
 * Mock {@link TraceablePeerConnection} - add things as needed, but only things useful for all tests.
 */
export class MockPeerConnection {

    /**
     * Constructor.
     *
     * @param {string} id RTC id
     * @param {boolean} usesUnifiedPlan
     * @param {boolean} simulcast
     */
    constructor(id, usesUnifiedPlan, simulcast) {
        this.id = id;
        this._usesUnifiedPlan = usesUnifiedPlan;
        this.peerconnection = new MockRTCPeerConnection();
        this._simulcast = simulcast;
    }

    /**
     * {@link TraceablePeerConnection.localDescription}.
     *
     * @returns {Object}
     */
    get localDescription() {
        return {
            sdp: ''
        };
    }

    /**
     * {@link TraceablePeerConnection.remoteDescription}.
     *
     * @returns {Object}
     */
    get remoteDescription() {
        return {
            sdp: ''
        };
    }

    /**
     * {@link TracablePeerConnection.calculateExpectedSendResolution}.
     * @param {JitsiLocalTrack} localTrack
     * @returns {number}
     */
    calculateExpectedSendResolution(localTrack) {
        return localTrack.getCaptureResolution();
    }

    /**
     * {@link TraceablePeerConnection.createAnswer}.
     *
     * @returns {Promise<Object>}
     */
    createAnswer() {
        return Promise.resolve(/* answer */{});
    }

    /**
     * {@link TraceablePeerConnection.doesTrueSimulcast}.
     * @returns {boolean}
     */
    doesTrueSimulcast() {
        return false;
    }

    /**
     * Returns the list of the codecs negotiated.
     * @returns {Array<string>}
     */
    getConfiguredVideoCodecs() {
        const sdp = this.peerconnection.localDescription?.sdp;

        if (!sdp) {
            return [];
        }
        const parsedSdp = transform.parse(sdp);
        const mLine = parsedSdp.media.find(m => m.type === 'video');
        const codecs = new Set(mLine.rtp.map(pt => pt.codec.toLowerCase()));

        return Array.from(codecs);
    }

    /**
     * {@link TraceablePeerConnection.getDesiredMediaDirection}.
     */
    getDesiredMediaDirection() {
        return 'sendrecv';
    }

    /**
     * {@link TraceablePeerConnection.isSpatialScalabilityOn}.
     *
     * @returns {boolean}
     */
    isSpatialScalabilityOn() {
        return this._simulcast;
    }

    /**
     * {@link TraceablePeerConnection.processLocalSdpForTransceiverInfo}.
     *
     * @returns {void}
     */
    processLocalSdpForTransceiverInfo() {
    }

    /**
     * {@link TraceablePeerConnection.setLocalDescription}.
     *
     * @returns {Promise<void>}
     */
    setLocalDescription() {
        return Promise.resolve();
    }

    /**
     * {@link TraceablePeerConnection.setRemoteDescription}.
     *
     * @returns {Promise<void>}
     */
    setRemoteDescription() {
        return Promise.resolve();
    }

    /**
     * {@link TraceablePeerConnection.setSenderVideoConstraints}.
     */
    setSenderVideoConstraints() {
    }

    /**
     * {@link TraceablePeerConnection.setVideoTransferActive}.
     */
    setVideoTransferActive() {
        return false;
    }

    /**
     * {@link TraceablePeerConnection.updateRemoteSources}.
     */
    updateRemoteSources() {
    }

    /**
     * {@link TraceablePeerConnection.usesUnifiedPlan}.
     */
    usesUnifiedPlan() {
        return this._usesUnifiedPlan;
    }

    /**
     * {@link TraceablePeerConnection.getLocalVideoTracks}.
     */
    getLocalVideoTracks() {
        return [];
    }
}

/**
 * Mock {@link RTC} - add things as needed, but only things useful for all tests.
 */
export class MockRTC extends Listenable {
    /**
     * {@link RTC.createPeerConnection}.
     *
     * @returns {MockPeerConnection}
     */
    createPeerConnection() {
        this.pc = new MockPeerConnection();
        this.forwardedSources = [];

        return this.pc;
    }

    /**
     * Returns the list of sources that the bridge is forwarding to the client.
     * @returns {Array<string>}
     */
    getForwardedSources() {
        return this.forwardedSources;
    }
}

/**
 * MockSignalingLayerImpl
 */
export class MockSignalingLayerImpl {
    /**
     * A constructor
     */
    constructor() {
        this._remoteSourceState = {};
    }

    /**
     * Returns the muted state, videoType and codec info received in presence.
     * @param {string} endpointId
     * @returns Object
     */
    getPeerMediaInfo(endpointId) {
        return this._remoteSourceState[endpointId];
    }

    /**
     * Updates the media info for peer on join/leave.
     * @param {boolean} isJoin - whether endpoint is joining or leaving the call
     * @param {string} endpointId - endpoint id
     * @param {Array<string>} codecList - new codec list published in presence
     * @param {string} codecType - legacy codec setting published in presence
     */
    setPeerMediaInfo(isJoin, endpointId, codecList, codecType) {
        if (isJoin) {
            this._remoteSourceState[endpointId] = {
                muted: true, // muted by default
                videoType: 'camera',
                codecList,
                codecType
            };
        } else {
            this._remoteSourceState[endpointId] = undefined;
        }
    }

}

/**
 * MockTrack
 */
export class MockTrack {
    /**
     * A constructor
     */
    constructor(height) {
        this.height = height;
    }

    /**
     * Returns height.
     * @returns {number}
     */
    getSettings() {
        return {
            height: this.height
        };
    }
}

/**
 * MockJitsiLocalTrack
 */
export class MockJitsiLocalTrack {
    /**
     * A constructor
     */
    constructor(height, mediaType, videoType) {
        this.resolution = height;
        this.track = new MockTrack(height);
        this.type = mediaType;
        this.videoType = videoType;
    }

    /**
     * Returns the height.
     * @returns {number}
     */
    getHeight() {
        return this.track.height;
    }

    /**
     * Returns the capture resolution.
     * @returns {number}
     */
    getCaptureResolution() {
        return this.getHeight();
    }

    /**
     * Returns track.
     * @returns {MockTrack}
     */
    getTrack() {
        return this.track;
    }

    /**
     * Returns media type.
     * @returns {MediaType}
     */
    getType() {
        return this.type;
    }

    /**
     * Returns video type.
     * @returns {VideoType}
     */
    getVideoType() {
        return this.videoType;
    }
}
