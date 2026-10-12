/** Creation-time native protection owned by the managed conference. */
export interface INativePeerConnectionContext {
    cleanupAll: () => void | Promise<unknown>;
    closePeerConnection: (peer: any) => void | Promise<unknown>;
    createPeerConnection: (PeerConnection: any, config: RTCConfiguration) => {
        peerConnection: any;
        ready: Promise<unknown>;
    };
    releaseReceiver?: (receiver: RTCRtpReceiver) => void;
}
