import { getLogger } from '@jitsi/logger';

import JitsiConference from "../../JitsiConference";
import { JitsiConferenceEvents } from "../../JitsiConferenceEvents";
import { CodecMimeType } from "../../service/RTC/CodecMimeType";
import RTCEvents from "../../service/RTC/RTCEvents";
import JitsiLocalTrack from "../RTC/JitsiLocalTrack";
import TraceablePeerConnection from "../RTC/TraceablePeerConnection";
import JingleSessionPC from "../xmpp/JingleSessionPC";
import { CodecSelection } from "./CodecSelection";
import ReceiveVideoController from "./ReceiveVideoController";
import SendVideoController from "./SendVideoController";
import {
    DEFAULT_LAST_N,
    LAST_N_UNLIMITED,
    VIDEO_CODECS_BY_COMPLEXITY,
    VIDEO_QUALITY_LEVELS
} from '../../service/RTC/StandardVideoQualitySettings';

const logger = getLogger(__filename);

// Period for which the client will wait for the cpu limitation flag to be reset in the peerconnection stats before it
// attempts to rectify the situation by attempting a codec switch.
const LIMITED_BY_CPU_TIMEOUT = 60000;

// The min. value that lastN will be set to while trying to fix video qaulity issues.
const MIN_LAST_N = 3;

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
    tpc: TraceablePeerConnection;
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

export class FixedSizeArray {
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
export class QualityController {
    private _codecController: CodecSelection;
    private _conference: JitsiConference;
    private _enableAdaptiveMode: boolean;
    private _encodeTimeStats: Map<number, FixedSizeArray>;
    private _isLastNRampupBlocked: boolean;
    private _lastNRampupTime: number;
    private _lastNRampupTimeout: number | undefined;
    private _limitedByCpuTimeout: number | undefined;
    private _receiveVideoController: ReceiveVideoController;
    private _sendVideoController: SendVideoController;

    /**
     * 
     * @param {JitsiConference} conference - The JitsiConference instance.
     * @param {Object} options - video quality settings passed through config.js.
     */
    constructor(conference: JitsiConference, options: {
        enableAdaptiveMode: boolean;
        jvb: Object;
        lastNRampupTime: number;
        p2p: Object;
    }) {
        this._conference = conference;
        const { jvb, p2p } = options;
        this._codecController = new CodecSelection(conference, { jvb, p2p });
        this._enableAdaptiveMode = options.enableAdaptiveMode;
        this._encodeTimeStats = new Map();
        this._isLastNRampupBlocked = false;
        this._lastNRampupTime = options.lastNRampupTime;
        this._receiveVideoController = new ReceiveVideoController(conference);
        this._sendVideoController = new SendVideoController(conference);

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
        this._conference.rtc.on(
            RTCEvents.SENDER_VIDEO_CONSTRAINTS_CHANGED,
            (videoConstraints: IVideoConstraints) => this._sendVideoController.onSenderConstraintsReceived(videoConstraints));
        this._conference.on(
            JitsiConferenceEvents.ENCODE_TIME_STATS_RECEIVED,
            (tpc: TraceablePeerConnection, stats: Map<number, IOutboundRtpStats>) => this._processOutboundRtpStats(tpc, stats));
    }

    /**
     * Adjusts the lastN value so that fewer remote video sources are received from the bridge in an attempt to improve
     * encode resolution of the outbound video streams based on cpuLimited parameter passed. If cpuLimited is false,
     * the lastN value will slowly be ramped back up to the channelLastN value set in config.js.
     *
     * @param {boolean} cpuLimited - whether the endpoint is cpu limited or not.
     * @returns boolean - Returns true if an action was taken, false otherwise.
     */
    _lowerOrRaiseLastN(cpuLimited: boolean): boolean {
        const lastN = this.receiveVideoController.getLastN();
        let newLastN = lastN;

        if (cpuLimited && (lastN !== LAST_N_UNLIMITED && lastN <= MIN_LAST_N)) {
            return false;
        }

        // If channelLastN is not set or set to -1 in config.js, the client will ramp up lastN to only up to 25.
        let { channelLastN = DEFAULT_LAST_N } = this._conference.options.config;

        channelLastN = channelLastN === LAST_N_UNLIMITED ? DEFAULT_LAST_N : channelLastN;
        if (cpuLimited) {
            const videoStreamsReceived = this._conference.getForwardedSources().length;

            newLastN = Math.floor(videoStreamsReceived / 2);
            if (newLastN < MIN_LAST_N) {
                newLastN = MIN_LAST_N;
            }

        // Increment lastN by 1 every LAST_N_RAMPUP_TIME (60) secs.
        } else if (lastN < channelLastN) {
            newLastN++;
        }

        if (newLastN === lastN) {
            return false;
        }

        const isStillLimitedByCpu = newLastN < channelLastN;

        this.receiveVideoController.setLastNLimitedByCpu(isStillLimitedByCpu);
        logger.info(`QualityController - setting lastN=${newLastN}, limitedByCpu=${isStillLimitedByCpu}`);
        this.receiveVideoController.setLastN(newLastN);

        return true;
    }

    /**
     * Adjusts the requested resolution for remote video sources by updating the receiver constraints in an attempt to
     * improve the encode resolution of the outbound video streams.
     * @return {void}
     */
    _maybeLowerReceiveResolution(): void {
        const currentConstraints = this.receiveVideoController.getCurrentReceiverConstraints();
        const individualConstraints = currentConstraints.constraints;
        let maxHeight = 0;

        if (individualConstraints && Object.keys(individualConstraints).length) {
            for (const value of Object.values(individualConstraints)) {
                const v: any = value;
                maxHeight = Math.max(maxHeight, v.maxHeight);
            }
        }

        const currentLevel = VIDEO_QUALITY_LEVELS.findIndex(lvl => lvl.height <= maxHeight);

        // Do not lower the resolution to less than 180p.
        if (VIDEO_QUALITY_LEVELS[currentLevel].height === 180) {
            return;
        }

        this.receiveVideoController.setPreferredReceiveMaxFrameHeight(VIDEO_QUALITY_LEVELS[currentLevel + 1].height);
    }

    /**
     * Updates the codec preference order for the local endpoint on the active media session and switches the video
     * codec if needed.
     *
     * @param {number} trackId - The track ID of the local video track for which stats have been captured.
     * @returns {boolean} - Returns true if video codec was changed.
     */
    _maybeSwitchVideoCodec(trackId: number): boolean {
        const stats = this._encodeTimeStats.get(trackId);
        const { codec, encodeResolution, localTrack } = stats.get(stats.size() - 1);
        const codecsByVideoType = VIDEO_CODECS_BY_COMPLEXITY[localTrack.getVideoType()];
        const codecIndex = codecsByVideoType.findIndex(val => val === codec.toLowerCase());

        // Do nothing if the encoder is using the lowest complexity codec already.
        if (codecIndex === codecsByVideoType.length - 1) {
            return false;
        }

        if (!this._limitedByCpuTimeout) {
            this._limitedByCpuTimeout = window.setTimeout(() => {
                this._limitedByCpuTimeout = undefined;
                const updatedStats = this._encodeTimeStats.get(trackId);
                const latestSourceStats: ISourceStats = updatedStats.get(updatedStats.size() - 1);

                // If the encoder is still limited by CPU, switch to a lower complexity codec.
                if (latestSourceStats.qualityLimitationReason === QualityLimitationReason.CPU
                    || encodeResolution <  Math.min(localTrack.maxEnabledResolution, localTrack.getCaptureResolution())) {
                        return this.codecController.changeCodecPreferenceOrder(localTrack, codec)
                }
            }, LIMITED_BY_CPU_TIMEOUT);
        }

        return false;
    }

    /**
     * Adjusts codec, lastN or receive resolution based on the send resolution (of the outbound streams) and limitation
     * reported by the browser in the WebRTC stats. Recovery is also attempted if the limitation goes away. No action
     * is taken if the adaptive mode has been disabled through config.js.
     *
     * @param {ISourceStats} sourceStats - The outbound-rtp stats for a local video track.
     * @returns {void}
     */
    _performQualityOptimizations(sourceStats: ISourceStats): void {
        // Do not attempt run time adjustments if the adaptive mode is disabled.
        if (!this._enableAdaptiveMode) {
            return;
        }

        const { encodeResolution, localTrack, qualityLimitationReason, tpc } = sourceStats;
        const trackId = localTrack.rtcId;

        if (encodeResolution === tpc.calculateExpectedSendResolution(localTrack)) {
            if (this._limitedByCpuTimeout) {
                window.clearTimeout(this._limitedByCpuTimeout);
                this._limitedByCpuTimeout = undefined;
            }

            if (qualityLimitationReason === QualityLimitationReason.NONE
                && this.receiveVideoController.isLastNLimitedByCpu()) {
                if (!this._lastNRampupTimeout && !this._isLastNRampupBlocked) {
                    // Ramp up the number of received videos if CPU limitation no longer exists. If the cpu
                    // limitation returns as a consequence, do not attempt to ramp up again, continue to
                    // increment the lastN value otherwise until it is equal to the channelLastN value.
                    this._lastNRampupTimeout = window.setTimeout(() => {
                        this._lastNRampupTimeout = undefined;
                        const updatedStats = this._encodeTimeStats.get(trackId);
                        const latestSourceStats: ISourceStats = updatedStats.get(updatedStats.size() - 1);

                        if (latestSourceStats.qualityLimitationReason === QualityLimitationReason.CPU) {
                            this._isLastNRampupBlocked = true;
                        } else {
                            this._lowerOrRaiseLastN(false /* raise */);
                        }
                    }, this._lastNRampupTime);
                }
            }

            return;
        }

        // Do nothing if the limitation reason is bandwidth since the browser will dynamically adapt the outbound
        // resolution based on available uplink bandwith. Otherwise,
        // 1. Switch the codec to the lowest complexity one incrementally.
        // 2. Switch to a lower lastN value, cutting the receive videos by half in every iteration until
        // MIN_LAST_N value is reached.
        // 3. Lower the receive resolution of individual streams up to 180p.
        if (qualityLimitationReason === QualityLimitationReason.CPU) {
            if (this._lastNRampupTimeout) {
                window.clearTimeout(this._lastNRampupTimeout);
                this._lastNRampupTimeout = undefined;
                this._isLastNRampupBlocked = true;
            }
            const codecSwitched = this._maybeSwitchVideoCodec(trackId);

            if (!codecSwitched && !this._limitedByCpuTimeout) {
                const lastNChanged = this._lowerOrRaiseLastN(true /* lower */);

                if (!lastNChanged) {
                    this.receiveVideoController.setReceiveResolutionLimitedByCpu(true);
                    this._maybeLowerReceiveResolution();
                }
            }
        }
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
            const trackId = track.rtcId;
            let existingStats = statsPerTrack.get(trackId);
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

                statsPerTrack.set(trackId, existingStats);
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
                timestamp,
                tpc
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

            this._performQualityOptimizations(sourceStats);
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
