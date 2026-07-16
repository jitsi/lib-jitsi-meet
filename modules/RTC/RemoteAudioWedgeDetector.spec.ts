import { MediaType } from '../../service/RTC/MediaType';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import EventEmitter from '../util/EventEmitter';

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
 * Builds the per-SSRC inbound audio packet-count map the detector consumes.
 *
 * @param {Array<{packetsReceived: number; ssrc: number;}>} entries - The per-SSRC packet counts.
 * @returns {Map<number, number>}
 */
function toMap(entries: Array<{ packetsReceived: number; ssrc: number; }>): Map<number, number> {
    const map = new Map<number, number>();

    entries.forEach(entry => map.set(entry.ssrc, entry.packetsReceived));

    return map;
}

describe('RemoteAudioWedgeDetector', () => {
    let tracks: any[];
    let pc: any;
    let onWedgeDetected: jasmine.Spy;
    let detector: RemoteAudioWedgeDetector;

    const TICK_MS = 1000;
    const WEDGE_TIMEOUT_MS = 3000;

    /**
     * Feeds one batch of inbound audio packet counts through the detector's evaluation, as the stats poll would.
     *
     * @param {Array<{packetsReceived: number; ssrc: number;}>} entries - The per-SSRC packet counts.
     * @returns {void}
     */
    function poll(entries: Array<{ packetsReceived: number; ssrc: number; }>): void {
        (detector as any)._evaluate(toMap(entries));
    }

    /**
     * Advances the mocked clock by one tick.
     *
     * @returns {void}
     */
    function tick(): void {
        jasmine.clock().tick(TICK_MS);
    }

    beforeEach(() => {
        jasmine.clock().install();
        jasmine.clock().mockDate(new Date(0));

        tracks = [];
        pc = {
            eventEmitter: new EventEmitter(),
            getRemoteTracks: (_endpointId: any, mediaType: MediaType) => {
                expect(mediaType).toBe(MediaType.AUDIO);

                return tracks;
            }
        };
        onWedgeDetected = jasmine.createSpy('onWedgeDetected');

        detector = new RemoteAudioWedgeDetector(pc, {
            onWedgeDetected,
            wedgeTimeoutMs: WEDGE_TIMEOUT_MS
        });
    });

    afterEach(() => {
        detector.stop();
        jasmine.clock().uninstall();
    });

    it('does not fire on the first eligible zero sample', () => {
        tracks = [ mockTrack(111, 'source-A') ];

        poll([ { packetsReceived: 0, ssrc: 111 } ]);
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('fires once the zero-RTP duration elapses while unmuted', () => {
        tracks = [ mockTrack(111, 'source-A') ];
        const entries = [ { packetsReceived: 0, ssrc: 111 } ];

        poll(entries); // t=0, streak starts
        tick();
        poll(entries); // t=1000
        tick();
        poll(entries); // t=2000
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        poll(entries); // t=3000, elapsed >= WEDGE_TIMEOUT_MS
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
        expect(onWedgeDetected.calls.mostRecent().args[0]).toBe(tracks[0]);
    });

    it('does not fire before the timeout elapses, even across many samples', () => {
        const detector2 = new RemoteAudioWedgeDetector(pc, {
            onWedgeDetected,
            wedgeTimeoutMs: 60000
        });

        tracks = [ mockTrack(111, 'source-A') ];

        for (let i = 0; i < 10; i++) {
            (detector2 as any)._evaluate(toMap([ { packetsReceived: 0, ssrc: 111 } ]));
            tick();
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
        detector2.stop();
    });

    it('requires at least two samples even when the timeout is tiny', () => {
        const detector2 = new RemoteAudioWedgeDetector(pc, {
            onWedgeDetected,
            wedgeTimeoutMs: 0
        });

        tracks = [ mockTrack(111, 'source-A') ];

        // A single sample cannot fire (only one sample) even though the elapsed time already satisfies the timeout.
        (detector2 as any)._evaluate(toMap([ { packetsReceived: 0, ssrc: 111 } ]));
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        (detector2 as any)._evaluate(toMap([ { packetsReceived: 0, ssrc: 111 } ]));
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
        detector2.stop();
    });

    it('does not fire when the source is receiving packets', () => {
        tracks = [ mockTrack(111, 'source-A') ];

        for (let i = 0; i < 5; i++) {
            poll([ { packetsReceived: 42, ssrc: 111 } ]);
            tick();
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('does not fire when the source is muted', () => {
        tracks = [ mockTrack(111, 'source-A', true /* muted */) ];

        for (let i = 0; i < 5; i++) {
            poll([ { packetsReceived: 0, ssrc: 111 } ]);
            tick();
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('does not fire for a source that received packets and later reports zero (cumulative is monotonic)', () => {
        tracks = [ mockTrack(111, 'source-A') ];

        poll([ { packetsReceived: 7, ssrc: 111 } ]); // healthy

        // A subsequent (hypothetical) zero reading must never re-arm a confirmed-healthy source.
        for (let i = 0; i < 5; i++) {
            tick();
            poll([ { packetsReceived: 0, ssrc: 111 } ]);
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('fires for a silent source even when another source is healthy', () => {
        tracks = [ mockTrack(111, 'source-A'), mockTrack(222, 'source-B') ];
        const entries = [ { packetsReceived: 7, ssrc: 111 }, { packetsReceived: 0, ssrc: 222 } ];

        poll(entries); // t=0
        tick();
        poll(entries); // t=1000
        tick();
        poll(entries); // t=2000
        tick();
        poll(entries); // t=3000, source-B fires
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
        expect(onWedgeDetected.calls.mostRecent().args[0]).toBe(tracks[1]);
    });

    it('resets the streak clock once the source starts receiving, even after earlier zero samples', () => {
        tracks = [ mockTrack(111, 'source-A') ];

        // Two zero samples accumulate, but the timeout has not elapsed.
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=0
        tick();
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=1000

        // Packets begin to flow; the source is demuxing correctly. Detection keys off the cumulative count, so once any
        // packet is seen the source stays healthy even if the count later plateaus (e.g. DTX/silence) - the earlier zero
        // samples must not carry over and trip the watchdog.
        tick();
        poll([ { packetsReceived: 5, ssrc: 111 } ]); // t=2000, streak reset
        tick();
        poll([ { packetsReceived: 5, ssrc: 111 } ]); // t=3000
        tick();
        poll([ { packetsReceived: 5, ssrc: 111 } ]); // t=4000
        tick();
        poll([ { packetsReceived: 5, ssrc: 111 } ]); // t=5000
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('does not re-fire for the same source during the cooldown window', () => {
        tracks = [ mockTrack(111, 'source-A') ];
        const entries = [ { packetsReceived: 0, ssrc: 111 } ];

        poll(entries); // t=0
        tick();
        poll(entries); // t=1000
        tick();
        poll(entries); // t=2000
        tick();
        poll(entries); // t=3000, fires
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);

        // The (still-wedged) source keeps reporting zero packets, but the watchdog stays quiet for the cooldown window
        // while the recycle renegotiation is assumed to be in flight.
        tick();
        poll(entries); // t=4000
        tick();
        poll(entries); // t=5000
        tick();
        poll(entries); // t=6000 (== fire time + cooldown), cooldown just elapsed; streak restarts here
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
    });

    it('clears bookkeeping for SSRCs that are no longer mapped', () => {
        tracks = [ mockTrack(111, 'source-A') ];

        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=0, streak starts
        tick();
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=1000

        // The source is remapped/removed before the timeout; its streak must not survive to wedge a later source that
        // reuses the SSRC.
        tick();
        tracks = [];
        poll([]); // t=2000

        tracks = [ mockTrack(111, 'source-A') ];
        tick();
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=3000, fresh streak starts here
        tick();
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=4000
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=5000, elapsed since fresh streak (t=3000) is 2000 < timeout
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=6000, elapsed since fresh streak is 3000 >= timeout
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
    });

    describe('stats event wiring', () => {
        it('evaluates on INBOUND_AUDIO_STATS for its own peerconnection', () => {
            tracks = [ mockTrack(111, 'source-A') ];
            detector.start();

            const entries = toMap([ { packetsReceived: 0, ssrc: 111 } ]);

            pc.eventEmitter.emit(RTCEvents.INBOUND_AUDIO_STATS, pc, entries); // t=0
            tick();
            pc.eventEmitter.emit(RTCEvents.INBOUND_AUDIO_STATS, pc, entries); // t=1000
            tick();
            pc.eventEmitter.emit(RTCEvents.INBOUND_AUDIO_STATS, pc, entries); // t=2000
            tick();
            pc.eventEmitter.emit(RTCEvents.INBOUND_AUDIO_STATS, pc, entries); // t=3000, fires
            expect(onWedgeDetected).toHaveBeenCalledTimes(1);
        });

        it('ignores INBOUND_AUDIO_STATS emitted for a different peerconnection', () => {
            tracks = [ mockTrack(111, 'source-A') ];
            detector.start();

            const otherPc = {};
            const entries = toMap([ { packetsReceived: 0, ssrc: 111 } ]);

            for (let i = 0; i < 5; i++) {
                pc.eventEmitter.emit(RTCEvents.INBOUND_AUDIO_STATS, otherPc, entries);
                tick();
            }
            expect(onWedgeDetected).not.toHaveBeenCalled();
        });

        it('stops evaluating after stop()', () => {
            tracks = [ mockTrack(111, 'source-A') ];
            detector.start();
            detector.stop();

            const entries = toMap([ { packetsReceived: 0, ssrc: 111 } ]);

            for (let i = 0; i < 5; i++) {
                pc.eventEmitter.emit(RTCEvents.INBOUND_AUDIO_STATS, pc, entries);
                tick();
            }
            expect(onWedgeDetected).not.toHaveBeenCalled();
        });
    });
});
