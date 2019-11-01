import { EventEmitter } from 'events';
import { VAD_SCORE_PUBLISHED, VAD_TALK_WHILE_MUTED } from './DetectionEvents';
import { getLogger } from 'jitsi-meet-logger';
import TrackVADEmitter from '../detection/TrackVADEmitter';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

const logger = getLogger(__filename);

/**
 * The value which we use to say, every sound over this threshold
 * is talking on the mic.
 * @type {number}
 */
const VAD_DETECT_THRESHOLD = 0.7;

/**
 * Detect user trying to speek while is locally muted and fires an event.
 */
export default class VADTalkMutedDetection extends EventEmitter {
    /**
     * Creates TalkMutedDetection
     * @param conference the JitsiConference instance that created us.
     * @param callback the callback to call when detected that the local user is
     * talking while her microphone is muted.
     * @constructor
     */
    constructor(conference, vadProcessor) {
        super();
        logger.info('[ADBG] Created VADTalkMutedDetection.');

        /**
         * The indicator which determines whether <tt>callback</tt> has been
         * invoked for the current local audio track of <tt>conference</tt> so
         * that it is invoked once only.
         *
         * @private
         */
        this._eventFired = false;

        this._vadProcessor = vadProcessor;

        this._vadEmitter = null;

        this._processing = false;

        this._scoreArray = [];

        conference.on(JitsiConferenceEvents.TRACK_MUTE_CHANGED, this._trackMuteChanged.bind(this));
        conference.on(JitsiConferenceEvents.TRACK_ADDED, this._trackAdded.bind(this));

        // TODO do we need to handle the case where tracks are removed, make sure this cleans up properly so
        // we don't have any leeks i.e. stale JitsiLocalTracks
    }

    /* eslint-disable max-params */
    /**
     * Receives audio level events for all send and receive streams.
     *
     * @param {TraceablePeerConnection} pc - WebRTC PeerConnection object of the
     * @param {number} ssrc - The synchronization source identifier (SSRC) of
     * the endpoint/participant/stream being reported.
     * @param {number} audioLevel - The audio level of <tt>ssrc</tt>.
     * @param {boolean} isLocal - <tt>true</tt> if <tt>ssrc</tt> represents a
     * local/send stream or <tt>false</tt> for a remote/receive stream.
     */
    _processVADScore(vadScore) {
        // We are interested in the local audio stream only and if event is not
        // sent yet.
        if (this._eventFired) {
            return;
        }

        if (this.audioTrack.isMuted()) {
            if (vadScore.score > 0.8 && !this._processing) {
                this._processing = true;

                this._processTimeout = setTimeout(() => {
                    let scoreSum = 0;

                    for (const score of this._scoreArray) {
                        scoreSum += score;
                    }

                    const avgScore = scoreSum / this._scoreArray.length;

                    if (avgScore > VAD_DETECT_THRESHOLD) {
                        this.emit(VAD_TALK_WHILE_MUTED, '');
                        this._eventFired = true;
                        console.log('[ADBG] Triggered array size: ', this._scoreArray, '. AVG: ', avgScore);
                    } else {
                        console.log('[ADBG] Not triggered array size: ', this._scoreArray, '. AVG: ', avgScore);
                    }

                    this._scoreArray = [];
                    this._processing = false;
                }, 1500);
            }

            if (this._processing) {
                this._scoreArray.push(vadScore.score);
            }
        }
    }
    /* eslint-enable max-params */

    /**
     * Determines whether a specific {@link JitsiTrack} represents a local audio
     * track.
     *
     * @param {JitsiTrack} track - The <tt>JitsiTrack</tt> to be checked whether
     * it represents a local audio track.
     * @private
     * @return {boolean} - <tt>true</tt> if the specified <tt>track</tt>
     * represents a local audio track; otherwise, <tt>false</tt>.
     */
    _isLocalAudioTrack(track) {
        return track.isAudioTrack() && track.isLocal();
    }

    /**
     * Notifies this <tt>TalkMutedDetection</tt> that a {@link JitsiTrack} was
     * added to the associated {@link JitsiConference}. Looks for the local
     * audio track only.
     *
     * @param {JitsiTrack} track - The added <tt>JitsiTrack</tt>.
     * @private
     */
    _trackAdded(track) {
        if (this._isLocalAudioTrack(track)) {
            logger.info('[ADBG] Audio track added.');
            this.audioTrack = track;
            this._vadProcessor().then(vadProcessor => {
                TrackVADEmitter.create(track.getDeviceId(), 4096, vadProcessor).then(vadEmitter => {
                    if (this._vadEmitter) {
                        this._vadEmitter.destroy();
                    }

                    this._vadEmitter = vadEmitter;
                    this._vadEmitter.on(VAD_SCORE_PUBLISHED, this._processVADScore.bind(this));
                    this._eventFired = false;
                    this._processing = false;
                    clearTimeout(this._processTimeout);
                });
            });
        }
    }

    /**
     * Notifies this <tt>TalkMutedDetection</tt> that the mute state of a
     * {@link JitsiTrack} has changed. Looks for the local audio track only.
     *
     * @param {JitsiTrack} track - The <tt>JitsiTrack</tt> whose mute state has
     * changed.
     * @private
     */
    _trackMuteChanged(track) {
        if (this._isLocalAudioTrack(track) && track.isMuted()) {
            logger.info('[ADBG] Audio track muted.');
            this._eventFired = false;
            clearTimeout(this._processTimeout);
        }
    }
}
