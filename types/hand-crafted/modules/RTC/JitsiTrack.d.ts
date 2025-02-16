import EventEmitter from "events";
import JitsiConference from "../../JitsiConference";
import { MediaType } from "../../service/RTC/MediaType";
import { VideoType } from "../../service/RTC/VideoType";
import TraceablePeerConnection from "./TraceablePeerConnection";

export default class JitsiTrack extends EventEmitter {
    constructor(
        conference: JitsiConference | null,
        stream: MediaStream,
        track: MediaStreamTrack,
        streamInactiveHandler: Function,
        trackMediaType: MediaType,
        videoType: VideoType
    );
    readonly conference: null | JitsiConference;
    audioLevel: number;
    containers: HTMLElement[];
    handlers: Map<string, Function>;
    type: MediaType;
    disposed: boolean;
    _addMediaStreamInactiveHandler: (handler: Function) => void;
    _attachTTFMTracker: (container: HTMLElement) => void;
    _onTrackAttach: (container: HTMLElement) => void;
    _onTrackDetach: (container: HTMLElement) => void;
    _setHandler: (type: string, handler: Function) => void;
    _setStream: (stream: MediaStream) => void;
    _unregisterHandlers: () => void;
    attach: (container: HTMLElement) => Promise<void>;
    detach: (container?: HTMLElement) => void;
    dispose: () => Promise<void>;
    getId: () => string | null;
    getOriginalStream: () => MediaStream;
    getSourceName: () => string | undefined;
    getSsrc: () => number;
    getStreamId: () => string | null;
    getTrack: () => MediaStreamTrack;
    getTrackLabel: () => string;
    getTrackId: () => string | null;
    getType: () => MediaType;
    getUsageLabel: () => string;
    getVideoType: () => VideoType;
    getHeight: () => number;
    getWidth: () => number;
    isActive: () => boolean;
    isAudioTrack: () => boolean;
    isLocal: () => boolean;
    isLocalAudioTrack: () => boolean;
    isVideoTrack: () => boolean;
    isWebRTCTrackMuted: () => boolean;
    setAudioLevel: (audioLevel: number, tpc?: TraceablePeerConnection) => void;
    setAudioOutput: (audioOutputDeviceId: string) => Promise<void>;
    setSourceName: (name: string) => void;
}
