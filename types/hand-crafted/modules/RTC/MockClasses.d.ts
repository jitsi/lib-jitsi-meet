import { MediaType } from "../../service/RTC/MediaType";
import { VideoType } from "../../service/RTC/VideoType";
import Listenable from "../util/Listenable";

/**
 * MockRTCPeerConnection that returns the local description SDP.
 */
declare class MockRTCPeerConnection {
    /**
     * Local description SDP.
     */
    readonly localDescription: { sdp: string };
}

/**
 * Mock {@link TraceablePeerConnection} - add things as needed, but only things useful for all tests.
 */
export declare class MockPeerConnection {
    constructor(id: string, usesUnifiedPlan: boolean, simulcast: boolean);

    readonly localDescription: { sdp: string };
    readonly remoteDescription: { sdp: string };
    calculateExpectedSendResolution(localTrack: MockJitsiLocalTrack): number;
    createAnswer(): Promise<object>;
    doesTrueSimulcast(): boolean;
    getConfiguredVideoCodecs(): string[];
    getDesiredMediaDirection(): string;
    isSpatialScalabilityOn(): boolean;
    processLocalSdpForTransceiverInfo(): void;
    setLocalDescription(): Promise<void>;
    setRemoteDescription(): Promise<void>;
    setSenderVideoConstraints(): void;
    setVideoTransferActive(): boolean;
    updateRemoteSources(): void;
    usesUnifiedPlan(): boolean;
    getLocalVideoTracks(): any[]; // Replace 'any' with the actual type if available
}

/**
 * Mock {@link RTC} - add things as needed, but only things useful for all tests.
 */
export declare class MockRTC extends Listenable {
    createPeerConnection(): MockPeerConnection;
    getForwardedSources(): string[];
}

/**
 * MockSignalingLayerImpl
 */
export declare class MockSignalingLayerImpl {
    constructor();

    getPeerMediaInfo(endpointId: string): object | undefined;
    setPeerMediaInfo(isJoin: boolean, endpointId: string, codecList: string[], codecType: string): void;
}

/**
 * MockTrack
 */
export declare class MockTrack {
    constructor(height: number);

    getSettings(): { height: number };
}

/**
 * MockJitsiLocalTrack
 */
export declare class MockJitsiLocalTrack {
    constructor(height: number, mediaType: MediaType, videoType: VideoType);

    getHeight(): number;
    getCaptureResolution(): number;
    getTrack(): MockTrack;
    getType(): MediaType;
    getVideoType(): VideoType;
}
