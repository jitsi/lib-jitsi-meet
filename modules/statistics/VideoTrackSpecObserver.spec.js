import { nextTick } from '../util/TestUtils';

import {
    REASON_FPS_CHANGED, REASON_NO_STATS,
    REASON_RES_CHANGED,
    VideoTrackSpecObserver
} from './VideoTrackSpecObserver';


// Disable JSDoc for Mock classes
/* eslint-disable require-jsdoc */
class MockStatsReport {
    constructor({ framesReceived, frameHeight, frameWidth }) {
        this.report = {
            framesReceived,
            frameWidth,
            frameHeight
        };
    }

    forEach(callback) {
        callback({
            type: 'track',
            ...this.report,
            timestamp: Date.now()
        });
    }
}
/* eslint-enable require-jsdoc */

describe('VideoTrackSpecObserver', () => {
    const STATS_INTERVAL = 1000;

    let specChangedSpy;
    let specObserver;
    let statsReport;

    beforeEach(() => {
        jasmine.clock().install();
        jasmine.clock().mockDate();

        const jitsiRemoteTrack = {
            tpc: {
                peerconnection: {
                    getStats: () => Promise.resolve(statsReport)
                }
            },
            getTrack: () => {
                return { };
            }
        };
        const specChangedListener = {
            // eslint-disable-next-line no-empty-function
            onTrackSpecChanged: () => { }
        };

        specChangedSpy = spyOn(specChangedListener, 'onTrackSpecChanged');
        specObserver = new VideoTrackSpecObserver({
            intervalMs: STATS_INTERVAL,
            jitsiRemoteTrack,
            onTrackSpecChanged: reason => specChangedListener.onTrackSpecChanged(reason)
        });
    });
    afterEach(() => {
        jasmine.clock().uninstall();
    });
    describe('onTrackSpecChanged', () => {
        it('is called REASON_FPS_CHANGED when fps changes', () => {
            specObserver.start();

            statsReport = new MockStatsReport({
                framesReceived: 0,
                frameWidth: 100,
                frameHeight: 100
            });

            return nextTick(STATS_INTERVAL).then(() => {
                statsReport.report.framesReceived += (STATS_INTERVAL / 1000) * 15;

                return nextTick(STATS_INTERVAL);
            })
                .then(() => {
                    statsReport.report.framesReceived += (STATS_INTERVAL / 1000) * 30;

                    return nextTick(STATS_INTERVAL);
                })
                .then(() => {
                    expect(specChangedSpy).toHaveBeenCalledWith(REASON_FPS_CHANGED);
                });
        });
        it('is not called on small fps change', () => {
            specObserver.start();

            statsReport = new MockStatsReport({
                framesReceived: 0,
                frameWidth: 100,
                frameHeight: 100
            });

            return nextTick(STATS_INTERVAL).then(() => {
                statsReport.report.framesReceived += (STATS_INTERVAL / 1000) * 30;

                return nextTick(STATS_INTERVAL);
            })
                .then(() => {
                    statsReport.report.framesReceived += (STATS_INTERVAL / 1000) * 27;

                    return nextTick(STATS_INTERVAL);
                })
                .then(() => {
                    expect(specChangedSpy).not.toHaveBeenCalled();
                });
        });
        it('is called with REASON_RES_CHANGED if resolution changes', () => {
            specObserver.start();

            statsReport = new MockStatsReport({
                framesReceived: 0,
                frameWidth: 100,
                frameHeight: 100
            });

            return nextTick(STATS_INTERVAL)
                .then(() => {
                    statsReport.report.framesReceived += (STATS_INTERVAL / 1000) * 15;

                    return nextTick(STATS_INTERVAL);
                })
                .then(() => {
                    statsReport.report.framesReceived += (STATS_INTERVAL / 1000) * 15;
                    statsReport.report.frameWidth += 10;

                    return nextTick(STATS_INTERVAL);
                })
                .then(() => {
                    expect(specChangedSpy).toHaveBeenCalledWith(REASON_RES_CHANGED);
                });
        });
        it('is called with REASON_NO_STATS peerconnection stops reporting stats', () => {
            specObserver.start();

            statsReport = new MockStatsReport({
                framesReceived: 0,
                frameWidth: 100,
                frameHeight: 100
            });

            return nextTick(STATS_INTERVAL)
                .then(() => {
                    statsReport.report.framesReceived += (STATS_INTERVAL / 1000) * 15;

                    return nextTick(STATS_INTERVAL);
                })
                .then(() => {
                    statsReport.report = undefined;

                    return nextTick(STATS_INTERVAL);
                })
                .then(() => {
                    expect(specChangedSpy).toHaveBeenCalledWith(REASON_NO_STATS);
                });
        });
    });
});
