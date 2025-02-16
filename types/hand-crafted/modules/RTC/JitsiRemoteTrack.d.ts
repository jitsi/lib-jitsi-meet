import JitsiTrack from "./JitsiTrack";
import RTC from "./RTC";
import JitsiConference from "../../JitsiConference";
import { VideoType } from "../../service/RTC/VideoType";

type TrackStreamingStatus = any; //as it has not specifies properly

export default class JitsiRemoteTrack extends JitsiTrack {
    constructor(
        rtc: RTC,
        conference: JitsiConference,
        ownerEndpointId: string,
        stream: MediaStream,
        track: MediaStreamTrack,
        mediaType: any,
        videoType: any,
        ssrc: number,
        muted: boolean,
        isP2P: boolean,
        sourceName: string
    );
  
    _trackStreamingStatus: TrackStreamingStatus | null;
    _trackStreamingStatusImpl: any; // Replace 'any' with the actual type if available
    _enteredForwardedSourcesTimestamp: number | null;
    hasBeenMuted: boolean;
    _containerHandlers: { [key: string]: EventListener };


    readonly conference: JitsiConference;
    setMute: (value: boolean) => void;
    isMuted: () => boolean;
    getParticipantId: () => string;
    isLocal: () => false; // Always returns false
    getSSRC: () => number;
    getSourceName: () => string;
    setOwner: (owner: string) => void;
    setSourceName: (name: string) => void;
    _setVideoType: (type: VideoType) => void;
    _playCallback: () => void;
    _attachTTFMTracker: (container: HTMLElement) => void;
    _onTrackAttach: (container: HTMLElement) => void;
    _onTrackDetach: (container: HTMLElement) => void;
    _containerEventHandler: (type: string) => void;
    _getStatus: () => string;
    _initTrackStreamingStatus: () => void;
    _disposeTrackStreamingStatus: () => void;
    _setTrackStreamingStatus: (status: TrackStreamingStatus) => void;
    getTrackStreamingStatus: () => TrackStreamingStatus | null;
    _clearEnteredForwardedSourcesTimestamp: () => void;
    _setEnteredForwardedSourcesTimestamp: (timestamp: number) => void;
    _getEnteredForwardedSourcesTimestamp: () => number | null;
    toString: () => string;
    dispose: () => Promise<void>;

    _bindTrackHandlers: () => void;
    _addEventListener: (event: string, handler: Function) => void;
    _removeEventListener: (event: string, handler: Function) => void;
    _onTrackMute: () => void;
    _onTrackUnmute: () => void;
    
    containerEvents: [
        "abort",
        "canplay",
        "canplaythrough",
        "emptied",
        "ended",
        "error",
        "loadeddata",
        "loadedmetadata",
        "loadstart",
        "pause",
        "play",
        "playing",
        "ratechange",
        "stalled",
        "suspend",
        "waiting"
    ]; // TODO: this might be private
}
