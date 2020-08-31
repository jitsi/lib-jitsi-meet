/* global __filename */

import { getLogger } from 'jitsi-meet-logger';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import RTCEvents from '../../service/RTC/RTCEvents';
import { RunningAverage } from '../util/MathUtil';

import { VFS } from './VFS';
import { VideoTrackSpecObserver } from './VideoTrackSpecObserver';

const logger = getLogger(__filename);

/**
 * The key used by the VFSTracker to store reference in the HTML <video> tag instance that renders the video to be able
 * to tell if the callback has been invalidated when a track was detached.
 *
 * @type {symbol}
 */
export const VFS_KEY = Symbol('VFS_KEY');

/**
 * The Video Fluidity Stats tracker. Selects one remote video track to be tracked for the stats purpose. It will either
 * be the dominant speaker's track or the most recently added track if the local participant is the dominant speaker.
 * The stats are exposed with {@link getLongRunningStats} method which contain long running averages for the stats
 * calculated through the conference duration.
 */
export class VFSTracker {

    /**
     * Tells if {@code VFSTracker} is supported by the current browser.
     * @return {boolean}
     */
    static isSupported() {
        return typeof HTMLVideoElement !== 'undefined'
            && typeof HTMLVideoElement.prototype.requestVideoFrameCallback !== 'undefined';
    }

    /**
     * Initializes for given conference.
     *
     * @param {JitsiConference} conference
     */
    constructor(conference) {
        const { rtc } = conference;

        this._conference = conference;
        this._trackAttachedListener = this._remoteTrackAttached.bind(this);
        this._trackDetachedListener = this._remoteTrackDetached.bind(this);

        // This module listens to conference layer track events as it cares about the tracks that are displayed in
        // the UI in contrary to RTC track events which contain both p2p/jvb tracks regardless of the p2p or jvb mode.
        conference.addEventListener(
            JitsiConferenceEvents.TRACK_ADDED,
            track => {
                if (!track.isLocal() && track.isVideoTrack()) {
                    track.addEventListener(JitsiTrackEvents._TRACK_ATTACHED, this._trackAttachedListener);
                    track.addEventListener(JitsiTrackEvents._TRACK_DETACHED, this._trackDetachedListener);
                }
            });

        conference.addEventListener(
            JitsiConferenceEvents.TRACK_REMOVED,
            track => {
                if (!track.isLocal() && track.isVideoTrack()) {
                    track.removeEventListener(JitsiTrackEvents._TRACK_ATTACHED, this._trackAttachedListener);
                    track.removeEventListener(JitsiTrackEvents._TRACK_DETACHED, this._trackDetachedListener);
                    this._remoteTrackRemoved(track);
                }
            });

        rtc.addEventListener(
            RTCEvents.DOMINANT_SPEAKER_CHANGED,
            id => this._dominantSpeakerChanged(id));
        this._remoteTracks = [];
        this._watchedTrack = null;
        this._cbCounter = 0;

        this._statsChangeCounter = 0;

        this._longRunningStats = {
            avgFrameInterval: new RunningAverage(),
            absAvgFrameIntDevPerc: new RunningAverage(),
            avgFps: new RunningAverage(),
            fpsRatio: new RunningAverage(),
            timeStatsReported: 0,
            lastReport: undefined
        };
    }

    get watchedContainer() {
        const containers = this._watchedTrack ? this._watchedTrack.containers : [];
        let selected = containers[0];

        selected && containers.forEach(c => {
            if (c.offsetWidth + c.offsetHeight > selected.offsetWidth + selected.offsetHeight) {
                selected = c;
            }
        });

        return selected;
    }

    get watchedTrack() {
        return this._watchedTrack;
    }

    _selectTrack() {
        const dominantSpeakerTrack
            = this._remoteTracks.find(t => t.getParticipantId() === this._conference.lastDominantSpeaker);

        if (dominantSpeakerTrack) {
            return dominantSpeakerTrack;
        }

        return this._remoteTracks[this._remoteTracks.length - 1];
    }

    _maybeSwitchTracks() {
        const newTrack = this._selectTrack();

        if (this._watchedTrack === newTrack) {
            return false;
        }

        if (this._watchedTrack) {
            for (const c of this._watchedTrack.containers) {
                c[VFS_KEY] = undefined;
            }
        }

        this._trackStatsObserver && this._trackStatsObserver.stop();
        this._trackStatsObserver = undefined;

        this._watchedTrack = newTrack;

        if (this._watchedTrack) {
            for (const c of this._watchedTrack.containers) {
                this._attachVFSTracker(c);
            }
            this._trackStatsObserver = new VideoTrackSpecObserver({
                jitsiRemoteTrack: this._watchedTrack,
                onTrackSpecChanged: resetReason => {
                    this._statsChangeCounter += 1;
                    logger.debug(`${this} onTrackSpecChanged: ${resetReason}`);
                }
            });
            this._trackStatsObserver.start();
        }

        return true;
    }

    _reportLongRunningStats({ fpsRatio, avgFrameInterval, avgFps, absAvgDev, absAvgDevPerc}) {
        if (!fpsRatio || !avgFrameInterval || !avgFps || !absAvgDev) {
            this._longRunningStats.lastReport = undefined;

            return;
        } else if (!this._longRunningStats.lastReport) {
            this._longRunningStats.lastReport = Date.now();

            return;
        }

        const reportedIntervalSec = (Date.now() - this._longRunningStats.lastReport) / 1000;

        this._longRunningStats.lastReport = Date.now();

        this._longRunningStats.avgFrameInterval.addNext(avgFrameInterval);
        this._longRunningStats.absAvgFrameIntDevPerc.addNext(absAvgDevPerc);
        this._longRunningStats.avgFps.addNext(avgFps);
        this._longRunningStats.fpsRatio.addNext(fpsRatio);
        this._longRunningStats.timeStatsReported += reportedIntervalSec;

        logger.debug(`${this} ${JSON.stringify(this.getLongRunningStats())}`);
    }

    getLongRunningStats() {
        return {
            avgFrameInterval: this._longRunningStats.avgFrameInterval.getAverage().toFixed(2),
            avgFps: this._longRunningStats.avgFps.getAverage().toFixed(2),
            absAvgFrameIntDevPerc: this._longRunningStats.absAvgFrameIntDevPerc.getAverage().toFixed(2),
            fpsRatio: this._longRunningStats.fpsRatio.getAverage().toFixed(2),
            timeStatsReported: this._longRunningStats.timeStatsReported.toFixed(2)
        };
    }

    _dominantSpeakerChanged() {
        this._maybeSwitchTracks();
    }

    _remoteTrackAttached(track, container) {
        logger.debug(`${this} remote track attached: ${track} ${container.id}`);

        if (this._remoteTracks.indexOf(track) === -1) {
            this._remoteTracks.push(track);
            this._maybeSwitchTracks();
        } else if (this._watchedTrack === track) {
            this._attachVFSTracker(container);
        }
    }

    _remoteTrackDetached(track, container) {
        logger.debug(`${this} track detached: ${track} ${container.id}`);
        container[VFS_KEY] = undefined;
    }

    _remoteTrackRemoved(track) {
        this._remoteTracks.splice(this._remoteTracks.indexOf(track), 1);

        if (this._watchedTrack === track) {
            this._maybeSwitchTracks();
        }
    }

    _attachVFSTracker(container) {
        if (!container.requestVideoFrameCallback) {
            logger.error(`${this} there's no requestVideoFrameCallback on the container`);

            return;
        }

        const vfs = new VFS(100);
        let localStatsChangeCounter = this._statsChangeCounter;
        let reportCounter = 0;

        this._cbCounter += 1;
        const cbNum = this._cbCounter;

        logger.debug(`${this} attaching VFS tracker ${cbNum} to: ${container.id}`);

        container[VFS_KEY] = vfs;

        const frameInfoCallback = () => {
            if (container[VFS_KEY] !== vfs) {
                if (container[VFS_KEY]) {
                    logger.debug(`${this} callback ${cbNum} overwritten - detached`);
                } else {
                    logger.debug(`${this} callback ${cbNum} cancelled - detached`);
                }

                return;
            }

            if (localStatsChangeCounter !== this._statsChangeCounter) {
                localStatsChangeCounter = this._statsChangeCounter;
                vfs.reset();
                logger.debug(`${this} reset ${cbNum}`);

                if (container === this.watchedContainer) {
                    // Reset the lastReport timestamp
                    this._reportLongRunningStats({});
                }
            }

            if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                vfs.onFrameRendered();

                reportCounter += 1;

                if (reportCounter % vfs.n === 0 && this.watchedContainer === container) {
                    const trackSpec = this._trackStatsObserver && this._trackStatsObserver.getStats();
                    const targetFps = trackSpec && trackSpec.fps;
                    const stats = vfs.calcStats();
                    const avgFps = stats && stats.avgFps;
                    const fpsRatio = targetFps > 0 && avgFps >= 0 ? stats.avgFps / targetFps : undefined;

                    this._reportLongRunningStats({
                        fpsRatio,
                        ...stats
                    });

                    reportCounter = 0;
                }
            }

            container.requestVideoFrameCallback(frameInfoCallback);
        };

        container.requestVideoFrameCallback(frameInfoCallback);
    }

    /**
     * @returns {string}
     */
    toString() {
        return `VFS[endpoint: ${this._watchedTrack && this._watchedTrack.getParticipantId()}]`;
    }
}
