import { getLogger } from '@jitsi/logger';

import { MediaType } from '../../service/RTC/MediaType';
import { RTCEvents } from '../../service/RTC/RTCEvents';

import JitsiRemoteTrack from './JitsiRemoteTrack';
import TraceablePeerConnection from './TraceablePeerConnection';

const logger = getLogger('rtc:RemoteAudioWedgeDetector');

/**
 * The default duration (in milliseconds) for which a mapped, unmuted remote audio source must receive zero inbound RTP
 * before it is considered wedged.
 */
const DEFAULT_WEDGE_TIMEOUT_MS = 15000;

/**
 * The minimum number of consecutive eligible (mapped + unmuted) zero-RTP samples required before a source can be
 * declared wedged, regardless of how short the configured timeout is. This debounces transient stats artifacts - most
 * notably the inbound-rtp report being momentarily absent (treated as zero) during renegotiation/track churn - so a
 * single bad sample cannot trigger a recovery.
 */
const MIN_SAMPLES = 2;

interface IEligibleZeroState {

    /**
     * The number of consecutive eligible zero-RTP samples observed in the current streak.
     */
    samples: number;

    /**
     * The timestamp (Date.now()) of the first eligible zero-RTP sample in the current streak.
     */
    since: number;
}

export interface IRemoteAudioWedgeDetectorOptions {

    /**
     * Callback invoked with the wedged remote audio track when the watchdog fires. The consumer is expected to recover
     * the source (e.g. by recycling it via source-remove/source-add).
     */
    onWedgeDetected: (track: JitsiRemoteTrack) => void;

    /**
     * The duration (in milliseconds) for which a source must receive zero inbound RTP before it is considered wedged.
     * Defaults to {@link DEFAULT_WEDGE_TIMEOUT_MS}.
     */
    wedgeTimeoutMs?: number;
}

/**
 * Watchdog that detects the Chrome/WebRTC audio-demux wedge against a JVB peerconnection that uses SSRC rewriting.
 *
 * When the bridge starts forwarding a rewritten remote audio SSRC before the client's Jingle renegotiation signals it,
 * Chrome can latch an unsignaled receive stream on the wrong audio m-section and then silently fail to bind the
 * signaled sink, leaving the app with a receiver that never receives a packet. The user-visible symptom is a remote
 * participant that is permanently silent while {@code getStats()} reports zero inbound RTP for the SSRC even though RTP
 * is arriving on the wire.
 *
 * This detector is purely a recovery mechanism: it does not depend on any Chrome internals. Rather than running its own
 * stats poll, it piggybacks on the {@link StatsCollector} that already polls the peerconnection every stats cycle: it
 * consumes the per-SSRC inbound audio packet counts emitted as {@link RTCEvents.INBOUND_AUDIO_STATS} and flags any
 * remote audio source that is mapped (a {@link JitsiRemoteTrack} exists) and unmuted (per signaling) yet has received
 * no RTP packets at all for the detection window. The wedge is recoverable from JS because recycling the source
 * (source-remove then source-add) deletes the zombie receive stream and a subsequent re-add binds cleanly.
 *
 * Detection keys off the cumulative {@code packetsReceived} being zero (i.e. "literally nothing inbound", which is the
 * confirmed signature of the wedge) rather than off a per-poll delta. A delta-based "no growth" check would produce
 * false positives for a genuinely unmuted-but-silent participant, since audio can stop emitting packets during silence
 * (DTX/comfort noise). A source that has ever received a packet is therefore considered healthy and is excluded from
 * further evaluation.
 *
 * A source must stay continuously eligible (mapped + unmuted) and at zero RTP for {@code wedgeTimeoutMs} of wall-clock
 * time before it fires. Eligibility - unlike the cumulative packet count - is not monotonic (a participant can mute and
 * unmute), so the streak is reset whenever the source becomes muted, unmapped, or receives any packet; this is what the
 * repeated samples verify. A {@link MIN_SAMPLES} floor debounces transient stats artifacts.
 */
export default class RemoteAudioWedgeDetector {
    private _pc: TraceablePeerConnection;
    private _onWedgeDetected: (track: JitsiRemoteTrack) => void;
    private _wedgeTimeoutMs: number;
    private _started: boolean;

    /**
     * Maps an SSRC to the state of its current streak of eligible (mapped + unmuted) zero-RTP samples.
     */
    private _eligibleZeroBySsrc: Map<number, IEligibleZeroState>;

    /**
     * The set of SSRCs that have been observed receiving at least one RTP packet. Such a source is demuxing correctly
     * and cannot be wedged (the wedge is "never received anything", and the cumulative packet count is monotonic), so
     * it is excluded from evaluation for the rest of its lifetime.
     */
    private _healthyBySsrc: Set<number>;

    /**
     * Maps a source name to the timestamp (Date.now()) until which detection is suppressed for that source. Used as a
     * cooldown after a recovery is triggered so the watchdog does not re-fire while the recycle renegotiation is in
     * flight and the re-added source (same SSRC, fresh m-line/track) starts receiving.
     */
    private _cooldownUntilBySource: Map<string, number>;

    /**
     * Creates a new {@code RemoteAudioWedgeDetector}. The detector is inert until {@link start} is called.
     *
     * @param {TraceablePeerConnection} pc - The peerconnection to monitor.
     * @param {IRemoteAudioWedgeDetectorOptions} options - The detector options.
     */
    constructor(pc: TraceablePeerConnection, options: IRemoteAudioWedgeDetectorOptions) {
        this._pc = pc;
        this._onWedgeDetected = options.onWedgeDetected;
        this._wedgeTimeoutMs = options.wedgeTimeoutMs ?? DEFAULT_WEDGE_TIMEOUT_MS;
        this._started = false;
        this._eligibleZeroBySsrc = new Map();
        this._healthyBySsrc = new Set();
        this._cooldownUntilBySource = new Map();
    }

    /**
     * Handles a batch of inbound audio packet counts from the {@link StatsCollector}'s stats poll. Ignores reports for
     * other peerconnections (the stats event is emitted on the shared RTC event bus).
     *
     * @param {TraceablePeerConnection} pc - The peerconnection the stats belong to.
     * @param {Map<number, number>} packetsBySsrc - Cumulative packetsReceived per inbound audio SSRC.
     * @returns {void}
     */
    private _onInboundAudioStats = (pc: TraceablePeerConnection, packetsBySsrc: Map<number, number>): void => {
        if (pc !== this._pc) {
            return;
        }

        try {
            this._evaluate(packetsBySsrc);
        } catch (error) {
            logger.warn('Error while evaluating remote audio sources for the wedge', error);
        }
    };

    /**
     * Evaluates every mapped, unmuted remote audio source against the given inbound packet counts for the wedge
     * signature.
     *
     * @param {Map<number, number>} packetsBySsrc - Cumulative packetsReceived per inbound audio SSRC.
     * @returns {void}
     */
    private _evaluate(packetsBySsrc: Map<number, number>): void {
        const now = Date.now();

        // A source can only be wedged if it is mapped, unmuted, not in a post-recovery cooldown, and has not yet been
        // confirmed healthy (received a packet).
        const mappedSsrcs = new Set<number>();
        const candidates: Array<{ ssrc: number; track: JitsiRemoteTrack; }> = [];

        for (const track of this._pc.getRemoteTracks(undefined, MediaType.AUDIO)) {
            const ssrc = track.getSsrc();

            if (typeof ssrc !== 'number') {
                continue; // eslint-disable-line no-continue
            }
            mappedSsrcs.add(ssrc);

            if (this._healthyBySsrc.has(ssrc) || track.isMuted()) {
                continue; // eslint-disable-line no-continue
            }

            const cooldownUntil = this._cooldownUntilBySource.get(track.getSourceName());

            if (cooldownUntil !== undefined) {
                if (now < cooldownUntil) {
                    continue; // eslint-disable-line no-continue
                }
                this._cooldownUntilBySource.delete(track.getSourceName());
            }

            candidates.push({
                ssrc,
                track
            });
        }

        // Drop the confirmed-healthy mark for any SSRC that is no longer mapped (the source was removed/remapped), so a
        // future source reusing the SSRC is re-evaluated from scratch.
        for (const ssrc of this._healthyBySsrc) {
            if (!mappedSsrcs.has(ssrc)) {
                this._healthyBySsrc.delete(ssrc);
            }
        }

        // Drop streak bookkeeping for any SSRC that is no longer a candidate (unmapped, muted, cooling down, or now
        // healthy). This is what resets the streak for a source that became ineligible mid-window.
        const candidateSsrcs = new Set(candidates.map(candidate => candidate.ssrc));

        for (const ssrc of this._eligibleZeroBySsrc.keys()) {
            if (!candidateSsrcs.has(ssrc)) {
                this._eligibleZeroBySsrc.delete(ssrc);
            }
        }

        for (const { ssrc, track } of candidates) {
            // A source that has received any RTP is demuxing correctly. Mark it healthy so it is never evaluated again
            // (the cumulative count is monotonic, so it cannot regress to zero) and reset any streak.
            if ((packetsBySsrc.get(ssrc) ?? 0) > 0) {
                this._healthyBySsrc.add(ssrc);
                this._eligibleZeroBySsrc.delete(ssrc);

                continue; // eslint-disable-line no-continue
            }

            const state = this._eligibleZeroBySsrc.get(ssrc);

            if (!state) {
                // Start of a streak: record when the source first went silent so the elapsed duration can be measured
                // against wall-clock time on subsequent samples.
                this._eligibleZeroBySsrc.set(ssrc, {
                    samples: 1,
                    since: now
                });

                continue; // eslint-disable-line no-continue
            }

            state.samples++;

            if (state.samples >= MIN_SAMPLES && now - state.since >= this._wedgeTimeoutMs) {
                logger.warn(`Detected wedged remote audio source ${track.getSourceName()} (ssrc=${ssrc}, owner=`
                    + `${track.getParticipantId()}): zero inbound RTP for ${now - state.since}ms `
                    + 'while continuously mapped and unmuted. Triggering recovery.');
                this._eligibleZeroBySsrc.delete(ssrc);

                // Suppress further detection for this source while the recycle renegotiation completes. Until then the
                // source is still wedged (so it would immediately re-fire), and once recovery re-adds it (same SSRC,
                // fresh m-line/track) the new receiver reads zero for a moment before media flows. Keying the cooldown
                // off the stable source name covers the remove/re-add transition.
                this._cooldownUntilBySource.set(track.getSourceName(), now + this._wedgeTimeoutMs);
                this._onWedgeDetected(track);
            }
        }
    }

    /**
     * Starts the watchdog by subscribing to the {@link StatsCollector}'s inbound audio stats. Subsequent calls are
     * no-ops while it is already running.
     *
     * @returns {void}
     */
    start(): void {
        if (this._started) {
            return;
        }
        this._started = true;
        logger.debug(`Starting remote audio wedge detector (wedgeTimeout=${this._wedgeTimeoutMs}ms), driven by the `
            + 'stats collector inbound audio stats');
        this._pc.eventEmitter.addListener(RTCEvents.INBOUND_AUDIO_STATS, this._onInboundAudioStats);
    }

    /**
     * Stops the watchdog and clears its bookkeeping. Safe to call when not started.
     *
     * @returns {void}
     */
    stop(): void {
        if (this._started) {
            this._pc.eventEmitter.removeListener(RTCEvents.INBOUND_AUDIO_STATS, this._onInboundAudioStats);
            this._started = false;
        }
        this._eligibleZeroBySsrc.clear();
        this._healthyBySsrc.clear();
        this._cooldownUntilBySource.clear();
    }
}
