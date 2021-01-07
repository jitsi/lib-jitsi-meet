/* eslint-disable no-empty-function */

/**
 * Mock {@link TraceablePeerConnection} - add things as needed, but only things useful for all tests.
 */
export class MockPeerConnection {
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
     * {@link TraceablePeerConnection.createAnswer}.
     *
     * @returns {Promise<Object>}
     */
    createAnswer() {
        return Promise.resolve(/* answer */{});
    }

    /**
     * {@link TraceablePeerConnection.getConfiguredVideoCodec}.
     *
     * @returns {CodecMimeType}
     */
    getConfiguredVideoCodec() {
        return 'vp8';
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
     * {@link TraceablePeerConnection.setSenderVideoConstraint}.
     */
    setSenderVideoConstraint() {
    }

    /**
     * {@link TraceablePeerConnection.setVideoTransferActive}.
     */
    setVideoTransferActive() {
        return false;
    }
}

/**
 * Mock {@link RTC} - add things as needed, but only things useful for all tests.
 */
export class MockRTC {
    /**
     * {@link RTC.createPeerConnection}.
     *
     * @returns {MockPeerConnection}
     */
    createPeerConnection() {
        this.pc = new MockPeerConnection();

        return this.pc;
    }
}

/* eslint-enable no-empty-function */
