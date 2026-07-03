import { MediaType } from '../../service/RTC/MediaType';

import RemoteAudioWedgeDetector from './RemoteAudioWedgeDetector';

/**
 * Builds a minimal mock of a remote audio track.
 *
 * @param {number} ssrc - The track SSRC.
 * @param {string} source - The source name.
 * @param {boolean} muted - Whether the track is muted.
 * @returns {object}
 */
function mockTrack(ssrc: number, source: string, muted = false): any {
    return {
        getParticipantId: () => 'endpoint-1',
        getSourceName: () => source,
        getSsrc: () => ssrc,
        isMuted: () => muted
    };
}

/**
 * Builds a mock getStats() report (a Map keyed by report id) for the given inbound-rtp audio packet counts.
 *
 * @param {Array<{packetsReceived: number; ssrc: number;}>} entries - The per-SSRC inbound-rtp entries.
 * @returns {Map<string, object>}
 */
function mockStats(entries: Array<{ packetsReceived: number; ssrc: number; }>): Map<string, any> {
    const report = new Map();

    entries.forEach((entry, idx) => {
        report.set(`inbound-rtp-${idx}`, {
            kind: 'audio',
            packetsReceived: entry.packetsReceived,
            ssrc: entry.ssrc,
            type: 'inbound-rtp'
        });
    });

    return report;
}

describe('RemoteAudioWedgeDetector', () => {
    let tracks: any[];
    let statsEntries: Array<{ packetsReceived: number; ssrc: number; }>;
    let pc: any;
    let onWedgeDetected: jasmine.Spy;
    let detector: RemoteAudioWedgeDetector;

    const POLL_INTERVAL_MS = 1000;
    const WEDGE_TIMEOUT_MS = 3000;

    /**
     * Runs a single detection poll.
     *
     * @returns {Promise<void>}
     */
    function poll(): Promise<void> {
        return (detector as any)._check();
    }

    /**
     * Advances the mocked clock by one poll interval.
     *
     * @returns {void}
     */
    function tick(): void {
        jasmine.clock().tick(POLL_INTERVAL_MS);
    }

    beforeEach(() => {
        jasmine.clock().install();
        jasmine.clock().mockDate(new Date(0));

        tracks = [];
        statsEntries = [];
        pc = {
            getRemoteTracks: (_endpointId: any, mediaType: MediaType) => {
                expect(mediaType).toBe(MediaType.AUDIO);

                return tracks;
            },
            getStats: jasmine.createSpy('getStats').and.callFake(() => Promise.resolve(mockStats(statsEntries)))
        };
        onWedgeDetected = jasmine.createSpy('onWedgeDetected');

        detector = new RemoteAudioWedgeDetector(pc, {
            onWedgeDetected,
            pollIntervalMs: POLL_INTERVAL_MS,
            wedgeTimeoutMs: WEDGE_TIMEOUT_MS
        });
    });

    afterEach(() => {
        detector.stop();
        jasmine.clock().uninstall();
    });

    it('does not call getStats() when there are no remote audio sources', async () => {
        tracks = [];

        await poll();
        expect(pc.getStats).not.toHaveBeenCalled();
    });

    it('does not call getStats() when every remote audio source is muted', async () => {
        tracks = [ mockTrack(111, 'source-A', true /* muted */), mockTrack(222, 'source-B', true /* muted */) ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 }, { packetsReceived: 0, ssrc: 222 } ];

        await poll();
        expect(pc.getStats).not.toHaveBeenCalled();
    });

    it('calls getStats() when at least one remote audio source is unmuted', async () => {
        tracks = [ mockTrack(111, 'source-A', true /* muted */), mockTrack(222, 'source-B') ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 }, { packetsReceived: 0, ssrc: 222 } ];

        await poll();
        expect(pc.getStats).toHaveBeenCalled();
    });

    it('stops calling getStats() once every source has received a packet', async () => {
        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 7, ssrc: 111 } ];

        await poll(); // confirms the source healthy
        expect(pc.getStats).toHaveBeenCalledTimes(1);

        tick();
        await poll(); // source is confirmed healthy -> no candidates -> getStats skipped
        tick();
        await poll();
        expect(pc.getStats).toHaveBeenCalledTimes(1);
    });

    it('keeps polling while one source is silent even though another is healthy', async () => {
        tracks = [ mockTrack(111, 'source-A'), mockTrack(222, 'source-B') ];
        statsEntries = [ { packetsReceived: 7, ssrc: 111 }, { packetsReceived: 0, ssrc: 222 } ];

        await poll();
        tick();
        await poll();
        expect(pc.getStats).toHaveBeenCalledTimes(2);
    });

    it('resumes polling when a new source appears after all were healthy', async () => {
        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 7, ssrc: 111 } ];

        await poll(); // source-A confirmed healthy
        tick();
        await poll(); // skipped
        expect(pc.getStats).toHaveBeenCalledTimes(1);

        // A new participant joins; its source has not been confirmed yet.
        tracks = [ mockTrack(111, 'source-A'), mockTrack(222, 'source-B') ];
        statsEntries = [ { packetsReceived: 7, ssrc: 111 }, { packetsReceived: 0, ssrc: 222 } ];
        tick();
        await poll();
        expect(pc.getStats).toHaveBeenCalledTimes(2);
    });

    it('does not fire for a source that received packets and later reports zero (cumulative is monotonic)', async () => {
        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 7, ssrc: 111 } ];

        await poll(); // healthy

        // A subsequent (hypothetical) zero reading must never re-arm a confirmed-healthy source.
        for (let i = 0; i < 5; i++) {
            tick();
            statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];
            await poll(); // eslint-disable-line no-await-in-loop
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('does not fire on the first eligible zero poll', async () => {
        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];

        await poll();
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('fires once the zero-RTP duration elapses while unmuted', async () => {
        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];

        // Polls while the timeout has not yet elapsed.
        await poll(); // t=0, streak starts
        tick();
        await poll(); // t=1000
        tick();
        await poll(); // t=2000
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        await poll(); // t=3000, elapsed >= WEDGE_TIMEOUT_MS
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
        expect(onWedgeDetected.calls.mostRecent().args[0]).toBe(tracks[0]);
    });

    it('does not fire before the timeout elapses, even across many polls', async () => {
        const detector2 = new RemoteAudioWedgeDetector(pc, {
            onWedgeDetected,
            pollIntervalMs: POLL_INTERVAL_MS,
            wedgeTimeoutMs: 60000
        });

        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];

        for (let i = 0; i < 10; i++) {
            await (detector2 as any)._check(); // eslint-disable-line no-await-in-loop
            tick();
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
        detector2.stop();
    });

    it('requires at least two samples even when the timeout is tiny', async () => {
        const detector2 = new RemoteAudioWedgeDetector(pc, {
            onWedgeDetected,
            pollIntervalMs: POLL_INTERVAL_MS,
            wedgeTimeoutMs: 0
        });

        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];

        // A single poll cannot fire (only one sample) even though the elapsed time already satisfies the timeout.
        await (detector2 as any)._check();
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        await (detector2 as any)._check();
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
        detector2.stop();
    });

    it('does not fire when the source is receiving packets', async () => {
        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 42, ssrc: 111 } ];

        for (let i = 0; i < 5; i++) {
            await poll(); // eslint-disable-line no-await-in-loop
            tick();
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('does not fire when the source is muted', async () => {
        tracks = [ mockTrack(111, 'source-A', true /* muted */) ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];

        for (let i = 0; i < 5; i++) {
            await poll(); // eslint-disable-line no-await-in-loop
            tick();
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('resets the streak clock once the source starts receiving, even after earlier zero polls', async () => {
        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];

        // Two zero polls accumulate, but the timeout has not elapsed.
        await poll(); // t=0
        tick();
        await poll(); // t=1000

        // Packets begin to flow; the source is demuxing correctly. Detection keys off the cumulative count, so once
        // any packet is seen the source stays healthy even if the count later plateaus (e.g. DTX/silence) - the earlier
        // zero polls must not carry over and trip the watchdog.
        tick();
        statsEntries = [ { packetsReceived: 5, ssrc: 111 } ];
        await poll(); // t=2000, streak reset
        tick();
        statsEntries = [ { packetsReceived: 5, ssrc: 111 } ];
        await poll(); // t=3000
        tick();
        await poll(); // t=4000
        tick();
        await poll(); // t=5000
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('does not re-fire for the same source during the cooldown window', async () => {
        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];

        await poll(); // t=0
        tick();
        await poll(); // t=1000
        tick();
        await poll(); // t=2000
        tick();
        await poll(); // t=3000, fires
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);

        // The (still-wedged) source keeps reporting zero packets, but the watchdog stays quiet for the cooldown
        // window while the recycle renegotiation is assumed to be in flight.
        tick();
        await poll(); // t=4000
        tick();
        await poll(); // t=5000
        tick();
        await poll(); // t=6000 (== fire time + cooldown), cooldown just elapsed; streak restarts here
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
    });

    it('clears bookkeeping for SSRCs that are no longer mapped', async () => {
        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];

        await poll(); // t=0, streak starts
        tick();
        await poll(); // t=1000

        // The source is remapped/removed before the timeout; its streak must not survive to wedge a later source that
        // reuses the SSRC.
        tick();
        tracks = [];
        statsEntries = [];
        await poll(); // t=2000

        tracks = [ mockTrack(111, 'source-A') ];
        statsEntries = [ { packetsReceived: 0, ssrc: 111 } ];
        tick();
        await poll(); // t=3000, fresh streak starts here
        tick();
        await poll(); // t=4000
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        await poll(); // t=5000, elapsed since fresh streak (t=3000) is 2000 < timeout
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        await poll(); // t=6000, elapsed since fresh streak is 3000 >= timeout
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
    });
});
