import { getLogger } from '@jitsi/logger';

import JitsiConference from "../../JitsiConference";
import { JitsiConferenceEvents } from "../../JitsiConferenceEvents";
import { CodecMimeType } from "../../service/RTC/CodecMimeType";
import RTCEvents from "../../service/RTC/RTCEvents";
import JitsiLocalTrack from "../RTC/JitsiLocalTrack";
import RTC from "../RTC/RTC";
import TraceablePeerConnection from "../RTC/TraceablePeerConnection";
import JingleSessionPC from "../xmpp/JingleSessionPC";
import { CodecSelection } from "./CodecSelection";
import ReceiveVideoController from "./ReceiveVideoController";
import SendVideoController from "./SendVideoController";

const logger = getLogger(__filename);
const LIMITED_BY_CPU_TIMEOUT = 120000;

enum QualityLimitationReason {
    BANDWIDTH = 'bandwidth',
    CPU = 'cpu',
    NONE = 'none'
};

interface IResolution {
    height: number;
    width: number;
}

interface IOutboundRtpStats {
    codec: CodecMimeType;
    encodeTime: number;
    qualityLimitationReason: QualityLimitationReason;
    resolution: IResolution;
    timestamp: number;
}

interface ISourceStats {
    avgEncodeTime: number;
    codec: CodecMimeType;
    encodeResolution: number;
    localTrack: JitsiLocalTrack;
    qualityLimitationReason: QualityLimitationReason;
    timestamp: number;
};

interface ITrackStats {
    encodeResolution: number
    encodeTime: number;
    qualityLimitationReason: QualityLimitationReason;
}

interface IVideoConstraints {
    maxHeight: number;
    sourceName: string;
}

class FixedSizeArray {
    private _data: ISourceStats[];
    private _maxSize: number;
  
    constructor(size: number) {
      this._maxSize = size;
      this._data = [];
    }
  
    add(item: ISourceStats): void {
      if (this._data.length >= this._maxSize) {
        this._data.shift();
      }
      this._data.push(item);
    }
  
    get(index: number): ISourceStats | undefined {
      if (index < 0 || index >= this._data.length) {
        throw new Error("Index out of bounds");
      }
      return this._data[index];
    }

    size(): number {
        return this._data.length;
    }
}

/**
 * QualityController class that is responsible for maintaining optimal video quality experience on the local endpoint
 * by controlling the codec, encode resolution and receive resolution of the remote video streams. It also makes
 * adjustments based on the outbound and inbound rtp stream stats reported by the underlying peer connection.
 */
export default class QualityController {
    private _codecController: CodecSelection;
    private _conference: JitsiConference;
    private _enableAdaptiveMode: boolean;
    private _encodeTimeStats: Map<string, FixedSizeArray>;
    private _limitedByCpuTimeout: number | undefined;
    private _receiveVideoController: ReceiveVideoController;
    private _rtc: RTC;
    private _sendVideoController: SendVideoController;

    /**
     * 
     * @param conference - The JitsiConference instance.
     */
    constructor(conference: JitsiConference, rtc: RTC, codecSettings: any, enableAdaptiveMode: boolean) {
        this._conference = conference;
        this._rtc = rtc;
        this._codecController = new CodecSelection(conference, codecSettings);
        this._enableAdaptiveMode = enableAdaptiveMode;

        this._receiveVideoController = new ReceiveVideoController(conference, rtc);
        this._sendVideoController = new SendVideoController(conference, conference);
        this._encodeTimeStats = new Map();

        this._conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            (session: JingleSessionPC) => {
                this._codecController.selectPreferredCodec(session);
                this._receiveVideoController.onMediaSessionStarted(session);
                this._sendVideoController.onMediaSessionStarted(session);
            });
        this._conference.on(
                JitsiConferenceEvents._MEDIA_SESSION_ACTIVE_CHANGED,
                () => this._sendVideoController.configureConstraintsForLocalSources());
        this._conference.on(
            JitsiConferenceEvents.CONFERENCE_VISITOR_CODECS_CHANGED,
            (codecList: CodecMimeType[]) => this._codecController.updateVisitorCodecs(codecList));
        this._conference.on(
            JitsiConferenceEvents.USER_JOINED,
            () => this._codecController.selectPreferredCodec(this._conference.jvbJingleSession));
        this._conference.on(
            JitsiConferenceEvents.USER_LEFT,
            () => this._codecController.selectPreferredCodec(this._conference.jvbJingleSession));
            this._rtc.on(
                RTCEvents.SENDER_VIDEO_CONSTRAINTS_CHANGED,
                (videoConstraints: IVideoConstraints) => this._sendVideoController.onSenderConstraintsReceived(videoConstraints));
        this._conference.on(
            JitsiConferenceEvents.ENCODE_TIME_STATS_RECEIVED,
            (tpc: TraceablePeerConnection, stats: Map<number, IOutboundRtpStats>) => this._processOutboundRtpStats(tpc, stats));
    }

    /**
     * Updates the codec preference order for the local endpoint on the active media session and switches the video
     * codec if needed.
     *
     * @param {string} trackId - The track ID of the local video track for which stats have been captured.
     * @returns {boolean} - Returns true if video codec was changed.
     */
    _maybeSwitchVideoCodec(trackId: string): boolean {
        const stats = this._encodeTimeStats.get(trackId);
        const { codec, encodeResolution, localTrack } = stats.get(stats.size() - 1);

        if (!this._limitedByCpuTimeout) {
            this._limitedByCpuTimeout = window.setTimeout(() => {
                this._limitedByCpuTimeout = undefined;
                const updatedStats = this._encodeTimeStats.get(trackId);
                const latestSourceStats = updatedStats[updatedStats.size() - 1];

                // If the encoder is still limited by CPU, switch to a lower complexity codec.
                if ((latestSourceStats.qualityLimitationReason === QualityLimitationReason.CPU 
                    || encodeResolution < localTrack.maxEnabledResolution)) {
                    
                        return this._codecController.changeCodecPreferenceOrder(localTrack, codec)
                }
            }, LIMITED_BY_CPU_TIMEOUT);
        }

        return false;
    }

    /**
     * Processes the outbound RTP stream stats as reported by the WebRTC peerconnection and makes runtime adjustments
     * to the client for better quality experience if the adaptive mode is enabled.
     *
     * @param {TraceablePeerConnection} tpc - The underlying WebRTC peerconnection where stats have been captured.
     * @param {Map<number, IOutboundRtpStats>} stats - Outbound-rtp stream stats per SSRC.
     * @returns void
     */
    _processOutboundRtpStats(tpc: TraceablePeerConnection, stats: Map<number, IOutboundRtpStats>): void {
        const activeSession = this._conference.getActiveMediaSession();

        // Process stats only for the active media session.
        if (activeSession.peerconnection !== tpc) {
            return;
        }

        const statsPerTrack = new Map();

        for (const ssrc of stats.keys()) {
            const { codec, encodeTime, qualityLimitationReason, resolution, timestamp } = stats.get(ssrc);
            const track = tpc.getTrackBySSRC(ssrc);
            let existingStats = statsPerTrack.get(track.rtcId);
            const encodeResolution = Math.min(resolution.height, resolution.width);
            const ssrcStats = {
                encodeResolution,
                encodeTime,
                qualityLimitationReason
            };

            if (existingStats) {
                existingStats.codec = codec;
                existingStats.timestamp = timestamp;
                existingStats.trackStats.push(ssrcStats);
            } else {
                existingStats = {
                    codec,
                    timestamp,
                    trackStats: [ ssrcStats ]
                };

                statsPerTrack.set(track.rtcId, existingStats);
            }
        }

        // Aggregate the stats for multiple simulcast streams with different SSRCs but for the same video stream.
        for (const trackId of statsPerTrack.keys()) {
            const { codec, timestamp, trackStats } = statsPerTrack.get(trackId);
            const totalEncodeTime = trackStats
                .map((stat: ITrackStats) => stat.encodeTime)
                .reduce((totalValue: number, currentValue: number) => totalValue + currentValue, 0);
            const avgEncodeTime: number = totalEncodeTime / trackStats.length;
            const { qualityLimitationReason = QualityLimitationReason.NONE }
                = trackStats
                    .find((stat: ITrackStats) => stat.qualityLimitationReason !== QualityLimitationReason.NONE) ?? {};
            const encodeResolution: number = trackStats
                .map((stat: ITrackStats) => stat.encodeResolution)
                .reduce((resolution: number, currentValue: number) => Math.max(resolution, currentValue), 0);
            const localTrack = this._conference.getLocalVideoTracks().find(t => t.rtcId === trackId);

            const exisitingStats: FixedSizeArray = this._encodeTimeStats.get(trackId);
            const sourceStats = {
                avgEncodeTime,
                codec,
                encodeResolution,
                qualityLimitationReason,
                localTrack,
                timestamp
            };

            if (exisitingStats) {
                exisitingStats.add(sourceStats);
            } else {
                // Save stats for only the last 5 mins.
                const data = new FixedSizeArray(300);

                data.add(sourceStats);
                this._encodeTimeStats.set(trackId, data);
            }

            logger.debug(`Encode stats for ${localTrack}: codec=${codec}, time=${avgEncodeTime},`
                + `resolution=${encodeResolution}, qualityLimitationReason=${qualityLimitationReason}`);

            // Do not attempt run time adjustments if the adaptive mode is disabled.
            if (!this._enableAdaptiveMode) {
                return;
            }

            if (encodeResolution === localTrack.maxEnabledResolution) {
                if (this._limitedByCpuTimeout) {
                    window.clearTimeout(this._limitedByCpuTimeout);
                    this._limitedByCpuTimeout = undefined;
                }

                return;
            }

            if (qualityLimitationReason === QualityLimitationReason.CPU
                || encodeResolution < localTrack.maxEnabledResolution) {
                this._maybeSwitchVideoCodec(trackId);
            }
        }
    }

    get codecController() {
        return this._codecController;
    }

    get receiveVideoController() {
        return this._receiveVideoController;
    }

    get sendVideoController() {
        return this._sendVideoController;
    }
}
