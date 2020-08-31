
export const REASON_FPS_CHANGED = 'fps-changed';

export const REASON_NO_STATS = 'no-stats';

export const REASON_RES_CHANGED = 'res-changed';

export class VideoTrackSpecObserver {
    /**
     *
     * @param {JitsiRemoteTrack} jitsiRemoteTrack - FIXME.
     * @param {number} [intervalMs=3000] - FIXME.
     * @param {Function} onTrackSpecChanged - FIXME.
     */
    constructor({ jitsiRemoteTrack, intervalMs = 3000, onTrackSpecChanged }) {
        this._jitsiRemoteTrack = jitsiRemoteTrack;
        this._intervalMs = intervalMs;
        this._statsReport = undefined;
        this._trackSpec = undefined;
        this._onTrackSpecChanged = onTrackSpecChanged;
    }

    start() {
        if (this._statsInterval) {
            throw new Error('VideoTrackSpecObserver is running already');
        }
        this._statsInterval = setInterval(() => this._checkTrackSpecChanged(), this._intervalMs);
    }

    _checkTrackSpecChanged() {
        this._getTrackSpecFromStats()
            .then(newTrackSpec => {
                let resetReason;

                if (this._trackSpec && newTrackSpec) {
                    const {
                        fps,
                        width,
                        height
                    } = this._trackSpec;
                    const {
                        fps: newFps,
                        width: newWidth,
                        height: newHeight
                    } = newTrackSpec;

                    if (width !== newWidth || height !== newHeight) {
                        resetReason = REASON_RES_CHANGED;
                    }

                    if (fps !== newFps && newFps > 0) {
                        const diffRatio = Math.abs(newFps - fps) / fps;

                        if (diffRatio > 0.3) {
                            resetReason = REASON_FPS_CHANGED;
                        }
                    }
                }

                if (resetReason || (this._trackSpec && !newTrackSpec)) {
                    this._onTrackSpecChanged && this._onTrackSpecChanged(resetReason || REASON_NO_STATS);
                }

                this._trackSpec = newTrackSpec;
            },
            error => {
                console.error(`_getPCStatsForTrack error: ${error && error.message}`);
            });
    }

    getStats() {
        return this._trackSpec;
    }

    _getTrackSpecFromStats() {
        const { tpc } = this._jitsiRemoteTrack;
        const mediaStreamTrack = this._jitsiRemoteTrack.getTrack();

        // FIXME check with presenter mode or when video muted?
        return tpc.peerconnection.getStats(mediaStreamTrack)
            .then(trackStatsReport => {
                let stats;

                trackStatsReport.forEach(statsReport => {
                    if (statsReport.type !== 'track') {

                        return;
                    }

                    if (this._statsReport) {
                        const {
                            timestamp: prevTimestamp,
                            framesReceived: prevFramesReceived
                        } = this._statsReport;
                        const {
                            timestamp,
                            framesReceived,
                            frameWidth,
                            frameHeight
                        } = statsReport;
                        const timeSeconds = (timestamp - prevTimestamp) / 1000;

                        const fps = timeSeconds > 0
                            ? Math.ceil((framesReceived - prevFramesReceived) / timeSeconds)
                            : undefined;

                        if (fps && frameWidth && frameHeight) {
                            stats = {
                                fps,
                                height: frameHeight,
                                width: frameWidth
                            };
                        }
                    }

                    this._statsReport = statsReport;
                });

                return stats;
            });
    }

    stop() {
        clearInterval(this._statsInterval);
        this._trackSpec = undefined;
        this._onTrackSpecChanged = undefined;
    }
}
