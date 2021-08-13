/**
 * Mock {@link TraceablePeerConnection} - add things as needed, but only things useful for all tests.
 */
export class MockPeerConnection {
    /**
     * Constructor.
     *
     * @param {string} id RTC id
     * @param {boolean} usesUnifiedPlan
     */
    constructor(id: string, usesUnifiedPlan: boolean);
    id: string;
    _usesUnifiedPlan: boolean;
    /**
     * {@link TraceablePeerConnection.localDescription}.
     *
     * @returns {Object}
     */
    get localDescription(): any;
    /**
     * {@link TraceablePeerConnection.remoteDescription}.
     *
     * @returns {Object}
     */
    get remoteDescription(): any;
    /**
     * {@link TraceablePeerConnection.createAnswer}.
     *
     * @returns {Promise<Object>}
     */
    createAnswer(): Promise<any>;
    /**
     * {@link TraceablePeerConnection.setLocalDescription}.
     *
     * @returns {Promise<void>}
     */
    setLocalDescription(): Promise<void>;
    /**
     * {@link TraceablePeerConnection.setRemoteDescription}.
     *
     * @returns {Promise<void>}
     */
    setRemoteDescription(): Promise<void>;
    /**
     * {@link TraceablePeerConnection.setSenderVideoConstraints}.
     */
    setSenderVideoConstraints(): void;
    /**
     * {@link TraceablePeerConnection.setVideoTransferActive}.
     */
    setVideoTransferActive(): boolean;
    /**
     * {@link TraceablePeerConnection.usesUnifiedPlan}.
     */
    usesUnifiedPlan(): boolean;
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
    createPeerConnection(): MockPeerConnection;
    pc: MockPeerConnection;
}
