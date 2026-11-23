import { getLogger } from '@jitsi/logger';

import { JitsiTrackEvents } from '../../JitsiTrackEvents';
import { MediaType } from '../../service/RTC/MediaType';
import { RTCEvents } from '../../service/RTC/RTCEvents';

import JitsiRemoteTrack from './JitsiRemoteTrack';
import TraceablePeerConnection from './TraceablePeerConnection';

const logger = getLogger('rtc:RemoteAudioWedgeDetector');

/**
 * The default duration (in milliseconds) of unmuted time that a mapped remote audio source must accumulate at zero
 * inbound RTP before it is considered wedged.
 */
const DEFAULT_WEDGE_TIMEOUT_MS = 15000;

/**
 * The minimum number of eligible (mapped + unmuted) zero-RTP samples required in a streak before a source can be
 * declared wedged, regardless of how short the configured timeout is. This debounces transient stats artifacts - most
 * notably the inbound-rtp report being momentarily absent (treated as zero) during renegotiation/track churn - so a
 * single bad sample cannot trigger a recovery.
 */
const MIN_SAMPLES = 2;

/**
 * The maximum number of recoveries to trigger for a receive slot (a rewritten SSRC). Recycling the source is only a fix
 * for the wedge; if the slot still receives nothing after this many attempts it is not wedged (the sender is silent, or
 * the bridge is not forwarding it), and further recycles are pure renegotiation churn.
 */
const MAX_RECOVERY_ATTEMPTS = 2;

interface IEligibleZeroState {

    /**
     * The unmuted time, in milliseconds, accumulated by the current streak up to the last mute. The time of the
     * unmuted period that is still open is not included, see {@link unmutedSince}.
     */
    elapsed: number;

    /**
     * The number of zero-RTP samples observed in the current streak.
     */
    samples: number;

    /**
     * The timestamp (Date.now()) at which the current streak started: the time the track was added, or the first
     * sample.
     */
    since: number;

    /**
     * The timestamp (Date.now()) at which the unmuted period that is still open started, or undefined while the source
     * is muted.
     */
    unmutedSince?: number;
}

interface IRecoveryState {

    /**
     * The number of recoveries triggered for the slot so far.
     */
    attempts: number;

    /**
     * The timestamp (Date.now()) until which detection is suppressed for the slot, so the watchdog does not re-fire
     * while a recycle renegotiation is in flight.
     */
    cooldownUntil: number;
}

export interface IRemoteAudioWedgeDetectorOptions {

    /**
     * Callback invoked with the wedged remote audio track when the watchdog fires. The consumer is expected to recover
     * the source (e.g. by recycling it via source-remove/source-add).
     */
    onWedgeDetected: (track: JitsiRemoteTrack) => void;

    /**
     * The duration (in milliseconds) of unmuted time that a source must accumulate at zero inbound RTP before it is
     * considered wedged. Defaults to {@link DEFAULT_WEDGE_TIMEOUT_MS}.
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
 * A source must accumulate {@code wedgeTimeoutMs} of unmuted time at zero RTP before it fires. Eligibility - unlike the
 * cumulative packet count - is not monotonic (a participant can mute and unmute). A mute only pauses the streak, and
 * the time accumulated so far is kept. If a mute reset the streak, a sender whose mute state changes more often than
 * the detection window would be recovered only when several stats polls in a row found it unmuted, which can take
 * minutes, although the receive slot stays wedged for as long as the peerconnection lives. The unmuted time is added
 * up from the mute changes of the track ({@link JitsiTrackEvents.TRACK_MUTE_CHANGED}), so it is exact. It is counted
 * from the time the track is added to the peerconnection ({@link RTCEvents.REMOTE_TRACK_ADDED}), or from the first
 * sample for a track that existed before the detector was started. At each sample the mute state of the streak is
 * compared with the mute state of the track and corrected, in case a mute change was not delivered. The packet counts
 * are only available at each stats poll, so the detector fires at a poll: with the default 10 s poll interval and 15 s
 * timeout, a source fires 15 to 25 s after its track is added at the earliest, and a session shorter than that cannot
 * be recovered. The streak is dropped when the source is unmapped, when a sample shows that it has received a packet,
 * and when media transfer is suspended. A {@link MIN_SAMPLES} floor debounces transient stats artifacts.
 *
 * Evaluation is skipped entirely while media transfer is suspended on the peerconnection. A JVB session is kept alive
 * but suspended for the duration of an active P2P session, and a suspended session receives no RTP at all by design, so
 * every remote audio source on it would otherwise look permanently wedged.
 *
 * Recoveries are capped at {@link MAX_RECOVERY_ATTEMPTS} per receive slot, i.e. per rewritten SSRC - the identity a
 * recovery preserves, since recycling the source hands it a new m-line and msid. Zero inbound RTP is not exclusive to
 * the wedge - a bridge that discards silence forwards nothing at all for a sender that is digitally silent from the
 * start of its stream - and recycling cannot fix a slot that is receiving nothing because nothing is being sent to it.
 * The cap bounds that case to a couple of renegotiations instead of one every detection window for the rest of the
 * call.
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
     * The remote audio tracks whose mute changes the detector listens to. These are the tracks that were mapped at the
     * last evaluation.
     */
    private _watchedTracks: Set<JitsiRemoteTrack>;

    /**
     * The set of SSRCs that have been observed receiving at least one RTP packet. Such a source is demuxing correctly
     * and cannot be wedged (the wedge is "never received anything", and the cumulative packet count is monotonic), so
     * it is excluded from evaluation for the rest of the peerconnection's lifetime.
     *
     * Entries are never dropped, not even when the SSRC stops being mapped. Under SSRC rewriting a rewritten SSRC gets
     * exactly one receive m-line for the lifetime of the peerconnection: {@link TraceablePeerConnection.addRemoteSsrc}
     * only reports an SSRC as new once, so a source-add (which creates the m-line) happens once per SSRC and every
     * later appearance of that SSRC in a source map is an in-place remap onto the same m-line, transceiver and track.
     * A remap therefore inherits an m-line that is already demuxing that SSRC correctly and cannot be wedged, whichever
     * source now occupies it.
     */
    private _healthyBySsrc: Set<number>;

    /**
     * Maps a receive slot (rewritten SSRC) to the state of the recoveries triggered for it: the cooldown that keeps the
     * watchdog quiet while a recycle renegotiation is in flight and the re-added source (same SSRC, fresh m-line/track)
     * starts receiving, and the attempt count that stops it recycling a slot that recycling cannot fix.
     *
     * Keyed on the SSRC rather than on the source name or the m-line. The m-line cannot carry the count because a
     * recovery replaces it (source-remove then source-add mints a fresh msid), so a per-m-line budget would reset on
     * every attempt and never converge. The SSRC is what a recovery preserves, and it also keeps an exhausted budget
     * with the slot when the bridge remaps it to a different source, whose receive path is just as dead.
     */
    private _recoveryStateBySsrc: Map<number, IRecoveryState>;

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
        this._watchedTracks = new Set();
        this._healthyBySsrc = new Set();
        this._recoveryStateBySsrc = new Map();
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
     * Handles a mute change of a watched remote audio track. Closes or opens the unmuted period of the streak of the
     * track's receive slot, so that the unmuted time of the streak is exact between two stats polls.
     *
     * @param {JitsiRemoteTrack} track - The track whose mute state has changed.
     * @returns {void}
     */
    private _onTrackMuteChanged = (track: JitsiRemoteTrack): void => {
        const ssrc = track.getSsrc();
        const state = typeof ssrc === 'number' ? this._eligibleZeroBySsrc.get(ssrc) : undefined;

        if (!state) {
            return;
        }

        const now = Date.now();

        if (track.isMuted()) {
            if (typeof state.unmutedSince === 'number') {
                state.elapsed += now - state.unmutedSince;
                state.unmutedSince = undefined;
            }
        } else if (typeof state.unmutedSince !== 'number') {
            state.unmutedSince = now;
        }
    };

    /**
     * Handles a remote track that was added to a peerconnection. Starts the streak of an audio track of the monitored
     * peerconnection and listens to its mute changes, so that the unmuted time is counted from now and not from the
     * next stats poll. The next evaluation drops the streak if the source is not eligible.
     *
     * @param {JitsiRemoteTrack} track - The added track.
     * @param {TraceablePeerConnection} pc - The peerconnection the track was added to.
     * @returns {void}
     */
    private _onRemoteTrackAdded = (track: JitsiRemoteTrack, pc: TraceablePeerConnection): void => {
        if (pc !== this._pc || track.getType() !== MediaType.AUDIO) {
            return;
        }

        const ssrc = track.getSsrc();

        if (typeof ssrc !== 'number') {
            return;
        }

        if (!this._watchedTracks.has(track)) {
            track.on(JitsiTrackEvents.TRACK_MUTE_CHANGED, this._onTrackMuteChanged);
            this._watchedTracks.add(track);
        }

        if (!this._eligibleZeroBySsrc.has(ssrc)) {
            const now = Date.now();

            this._eligibleZeroBySsrc.set(ssrc, {
                elapsed: 0,
                samples: 0,
                since: now,
                unmutedSince: track.isMuted() ? undefined : now
            });
        }
    };

    /**
     * Listens to the mute changes of the given tracks, and stops listening to those of every other track.
     *
     * @param {Set<JitsiRemoteTrack>} tracks - The tracks to watch.
     * @returns {void}
     */
    private _watchTracks(tracks: Set<JitsiRemoteTrack>): void {
        for (const track of this._watchedTracks) {
            if (!tracks.has(track)) {
                track.off(JitsiTrackEvents.TRACK_MUTE_CHANGED, this._onTrackMuteChanged);
                this._watchedTracks.delete(track);
            }
        }

        for (const track of tracks) {
            if (!this._watchedTracks.has(track)) {
                track.on(JitsiTrackEvents.TRACK_MUTE_CHANGED, this._onTrackMuteChanged);
                this._watchedTracks.add(track);
            }
        }
    }

    /**
     * Evaluates every mapped remote audio source against the given inbound packet counts for the wedge signature.
     *
     * @param {Map<number, number>} packetsBySsrc - Cumulative packetsReceived per inbound audio SSRC.
     * @returns {void}
     */
    private _evaluate(packetsBySsrc: Map<number, number>): void {
        const now = Date.now();

        // Media transfer is suspended for the whole of an active P2P session, during which the session receives no RTP
        // by design. Drop the streaks so the detection window starts over when it resumes rather than counting the
        // suspended period against the sources.
        if (!this._pc.audioTransferActive) {
            this._eligibleZeroBySsrc.clear();

            return;
        }

        // A source is only evaluated if it is mapped, not in a post-recovery cooldown, not out of recovery attempts,
        // and has not yet been confirmed healthy (received a packet). A muted source is evaluated too: its streak is
        // paused, and it fires when the unmuted time that the streak has accumulated reaches the timeout.
        const candidates: Array<{ ssrc: number; track: JitsiRemoteTrack; }> = [];
        const mappedTracks = new Set<JitsiRemoteTrack>();

        for (const track of this._pc.getRemoteTracks(undefined, MediaType.AUDIO)) {
            const ssrc = track.getSsrc();

            if (typeof ssrc !== 'number') {
                continue; // eslint-disable-line no-continue
            }

            mappedTracks.add(track);

            if (this._healthyBySsrc.has(ssrc)) {
                continue; // eslint-disable-line no-continue
            }

            const recovery = this._recoveryStateBySsrc.get(ssrc);

            if (recovery && (recovery.attempts >= MAX_RECOVERY_ATTEMPTS || now < recovery.cooldownUntil)) {
                continue; // eslint-disable-line no-continue
            }

            candidates.push({
                ssrc,
                track
            });
        }

        this._watchTracks(mappedTracks);

        // Drop the streak of an SSRC that is no longer a candidate (unmapped, cooling down, or out of recovery
        // attempts). A muted source keeps its streak.
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
                // Start of the streak of a track that was not seen when it was added. The unmuted time is counted from
                // this sample, or from the next unmute if the source is muted now.
                this._eligibleZeroBySsrc.set(ssrc, {
                    elapsed: 0,
                    samples: 1,
                    since: now,
                    unmutedSince: track.isMuted() ? undefined : now
                });

                continue; // eslint-disable-line no-continue
            }

            state.samples++;

            // Correct the streak if a mute change of the track was not delivered. The time of the change is not known,
            // so an unmuted period that a mute has ended is not counted, and one that has started is counted from now.
            if (track.isMuted()) {
                state.unmutedSince = undefined;
            } else if (typeof state.unmutedSince !== 'number') {
                state.unmutedSince = now;
            }

            const unmutedMs = state.elapsed + (typeof state.unmutedSince === 'number' ? now - state.unmutedSince : 0);

            if (state.samples >= MIN_SAMPLES && unmutedMs >= this._wedgeTimeoutMs) {
                const sourceName = track.getSourceName();
                const attempts = (this._recoveryStateBySsrc.get(ssrc)?.attempts ?? 0) + 1;

                logger.warn(`Detected wedged remote audio source ${sourceName} (ssrc=${ssrc}, owner=`
                    + `${track.getParticipantId()}): zero inbound RTP for ${unmutedMs}ms of unmuted time while `
                    + `mapped (${state.samples} samples over ${now - state.since}ms). Triggering recovery (attempt `
                    + `${attempts} of ${MAX_RECOVERY_ATTEMPTS}).`);
                this._eligibleZeroBySsrc.delete(ssrc);

                // Suppress further detection for this source while the recycle renegotiation completes. Until then the
                // source is still wedged (so it would immediately re-fire), and once recovery re-adds it (same SSRC,
                // fresh m-line/track) the new receiver reads zero for a moment before media flows. Keying the state
                // off the SSRC, which the re-add preserves, covers the remove/re-add transition.
                this._recoveryStateBySsrc.set(ssrc, {
                    attempts,
                    cooldownUntil: now + this._wedgeTimeoutMs
                });

                if (attempts >= MAX_RECOVERY_ATTEMPTS) {
                    logger.warn(`Remote audio source ${sourceName} (ssrc=${ssrc}) has been recycled `
                        + `${attempts} times without receiving any RTP; it is not recoverable by recycling. No `
                        + 'further recovery will be attempted for this receive slot.');
                }

                this._onWedgeDetected(track);
            }
        }
    }

    /**
     * Starts the watchdog by subscribing to the {@link StatsCollector}'s inbound audio stats and to the remote tracks
     * that are added. Subsequent calls are no-ops while it is already running.
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
        this._pc.eventEmitter.addListener(RTCEvents.REMOTE_TRACK_ADDED, this._onRemoteTrackAdded);
    }

    /**
     * Stops the watchdog and clears its bookkeeping. Safe to call when not started.
     *
     * @returns {void}
     */
    stop(): void {
        if (this._started) {
            this._pc.eventEmitter.removeListener(RTCEvents.INBOUND_AUDIO_STATS, this._onInboundAudioStats);
            this._pc.eventEmitter.removeListener(RTCEvents.REMOTE_TRACK_ADDED, this._onRemoteTrackAdded);
            this._started = false;
        }
        this._watchTracks(new Set());
        this._eligibleZeroBySsrc.clear();
        this._healthyBySsrc.clear();
        this._recoveryStateBySsrc.clear();
    }
}
