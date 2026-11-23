import { JitsiTrackEvents } from '../../JitsiTrackEvents';
import { MediaType } from '../../service/RTC/MediaType';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import EventEmitter from '../util/EventEmitter';

import RemoteAudioWedgeDetector from './RemoteAudioWedgeDetector';

/**
 * Builds a minimal mock of a remote audio track. The mock emits the mute change to its listeners, as
 * {@link JitsiRemoteTrack.setMute} does.
 *
 * @param {number} ssrc - The track SSRC.
 * @param {string} source - The source name.
 * @param {boolean} muted - Whether the track is muted.
 * @returns {object}
 */
function mockTrack(ssrc: number, source: string, muted = false): any {
    const listeners = new Set<(track: any) => void>();
    let isMuted = muted;
    const track = {
        getParticipantId: () => 'endpoint-1',
        getSourceName: () => source,
        getSsrc: () => ssrc,
        isMuted: () => isMuted,
        listenerCount: () => listeners.size,
        off: (eventId: string, listener: (track: any) => void) => {
            expect(eventId).toBe(JitsiTrackEvents.TRACK_MUTE_CHANGED);
            listeners.delete(listener);
        },
        on: (eventId: string, listener: (track: any) => void) => {
            expect(eventId).toBe(JitsiTrackEvents.TRACK_MUTE_CHANGED);
            listeners.add(listener);
        },
        setMute: (value: boolean) => {
            if (isMuted !== value) {
                isMuted = value;
                listeners.forEach(listener => listener(track));
            }
        }
    };

    return track;
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
            audioTransferActive: true,
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

    it('adds up the unmuted time of a source that is muted at every sample but the first', () => {
        const track = mockTrack(111, 'source-A');
        const entries = [ { packetsReceived: 0, ssrc: 111 } ];

        tracks = [ track ];
        poll(entries); // t=0, streak starts

        // The source is unmuted for the first 600 ms of every second, and muted when it is sampled.
        for (let i = 0; i < 4; i++) {
            track.setMute(false);
            jasmine.clock().tick(600);
            track.setMute(true);
            jasmine.clock().tick(400);
            poll(entries); // t=1000 to t=4000, 600 ms to 2400 ms unmuted
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();

        track.setMute(false);
        jasmine.clock().tick(600);
        track.setMute(true);
        jasmine.clock().tick(400);
        poll(entries); // t=5000, 3000 ms unmuted >= WEDGE_TIMEOUT_MS
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
        expect(onWedgeDetected.calls.mostRecent().args[0]).toBe(track);
    });

    it('does not count the time a source is muted', () => {
        const track = mockTrack(111, 'source-A');
        const entries = [ { packetsReceived: 0, ssrc: 111 } ];

        tracks = [ track ];
        poll(entries); // t=0, streak starts
        tick();
        poll(entries); // t=1000, 1000 ms unmuted

        track.setMute(true);
        for (let i = 0; i < 10; i++) {
            tick();
            poll(entries); // t=2000 to t=11000, muted
        }

        track.setMute(false);
        tick();
        poll(entries); // t=12000, 2000 ms unmuted
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        poll(entries); // t=13000, 3000 ms unmuted >= WEDGE_TIMEOUT_MS
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
    });

    it('starts the streak of a source that is muted at its first sample', () => {
        const track = mockTrack(111, 'source-A', true /* muted */);
        const entries = [ { packetsReceived: 0, ssrc: 111 } ];

        tracks = [ track ];
        poll(entries); // t=0, streak starts, muted
        jasmine.clock().tick(500);
        track.setMute(false); // t=500
        jasmine.clock().tick(500);
        poll(entries); // t=1000, 500 ms unmuted
        tick();
        poll(entries); // t=2000
        tick();
        poll(entries); // t=3000, 2500 ms unmuted
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        poll(entries); // t=4000, 3500 ms unmuted >= WEDGE_TIMEOUT_MS
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
    });

    it('fires for a mostly muted source at the default timeout and stats interval', () => {
        const detector2 = new RemoteAudioWedgeDetector(pc, { onWedgeDetected });
        const track = mockTrack(111, 'source-A', true /* muted */);
        const evaluate = () => (detector2 as any)._evaluate(toMap([ { packetsReceived: 0, ssrc: 111 } ]));

        tracks = [ track ];
        evaluate(); // t=0, streak starts, muted

        // The source is unmuted for 4 s of every 10 s, and muted at every sample.
        for (let i = 0; i < 3; i++) {
            jasmine.clock().tick(3000);
            track.setMute(false);
            jasmine.clock().tick(4000);
            track.setMute(true);
            jasmine.clock().tick(3000);
            evaluate(); // t=10000 to t=30000, 4000 ms to 12000 ms unmuted
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();

        jasmine.clock().tick(3000);
        track.setMute(false);
        jasmine.clock().tick(4000);
        track.setMute(true);
        jasmine.clock().tick(3000);
        evaluate(); // t=40000, 16000 ms unmuted >= 15000 ms
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
        detector2.stop();
    });

    it('stops recovering a source whose mute state keeps changing', () => {
        const track = mockTrack(111, 'source-A');

        tracks = [ track ];

        for (let i = 0; i < 200; i++) {
            track.setMute(i % 2 === 1);
            poll([ { packetsReceived: 0, ssrc: 111 } ]);
            tick();
        }
        expect(onWedgeDetected).toHaveBeenCalledTimes(2);
    });

    it('drops the streak of a source that is unmapped while it is muted', () => {
        const track = mockTrack(111, 'source-A');
        const entries = [ { packetsReceived: 0, ssrc: 111 } ];

        tracks = [ track ];
        poll(entries); // t=0, streak starts
        tick();
        poll(entries); // t=1000
        tick();
        poll(entries); // t=2000, 2000 ms unmuted

        track.setMute(true);
        tick();
        poll(entries); // t=3000, muted

        tracks = [];
        tick();
        poll([]); // t=4000, unmapped, the paused streak is dropped

        track.setMute(false);
        tracks = [ track ];
        tick();
        poll(entries); // t=5000, fresh streak starts here
        tick();
        poll(entries); // t=6000
        tick();
        poll(entries); // t=7000, 2000 ms unmuted
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        poll(entries); // t=8000, 3000 ms unmuted >= WEDGE_TIMEOUT_MS
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
    });

    it('drops the streak of a muted source when media transfer is suspended', () => {
        const track = mockTrack(111, 'source-A');
        const entries = [ { packetsReceived: 0, ssrc: 111 } ];

        tracks = [ track ];
        poll(entries); // t=0, streak starts
        tick();
        poll(entries); // t=1000
        tick();
        poll(entries); // t=2000, 2000 ms unmuted

        track.setMute(true);
        tick();
        poll(entries); // t=3000, muted

        pc.audioTransferActive = false;
        tick();
        poll(entries); // t=4000, suspended, the paused streak is dropped

        pc.audioTransferActive = true;
        track.setMute(false);
        tick();
        poll(entries); // t=5000, fresh streak starts here
        tick();
        poll(entries); // t=6000
        tick();
        poll(entries); // t=7000, 2000 ms unmuted
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        poll(entries); // t=8000, 3000 ms unmuted >= WEDGE_TIMEOUT_MS
        expect(onWedgeDetected).toHaveBeenCalledTimes(1);
    });

    it('does not fire for a paused streak when the source has received packets', () => {
        const track = mockTrack(111, 'source-A');

        tracks = [ track ];
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=0, streak starts
        tick();
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=1000
        tick();
        poll([ { packetsReceived: 0, ssrc: 111 } ]); // t=2000, 2000 ms unmuted

        // The packets are seen while the source is muted. The source is healthy, and the paused streak must not fire
        // when the source is unmuted again.
        track.setMute(true);
        tick();
        poll([ { packetsReceived: 5, ssrc: 111 } ]); // t=3000, muted

        track.setMute(false);
        tick();
        poll([ { packetsReceived: 5, ssrc: 111 } ]); // t=4000
        tick();
        poll([ { packetsReceived: 5, ssrc: 111 } ]); // t=5000
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('listens to the mute changes of mapped tracks only, and of none after stop()', () => {
        const trackA = mockTrack(111, 'source-A');
        const trackB = mockTrack(222, 'source-B');

        tracks = [ trackA, trackB ];
        poll([]);
        poll([]);
        expect(trackA.listenerCount()).toBe(1);
        expect(trackB.listenerCount()).toBe(1);

        tracks = [ trackB ];
        poll([]);
        expect(trackA.listenerCount()).toBe(0);
        expect(trackB.listenerCount()).toBe(1);

        detector.stop();
        expect(trackB.listenerCount()).toBe(0);
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

    it('stops recovering a source that recycling does not fix', () => {
        tracks = [ mockTrack(111, 'source-A') ];
        const entries = [ { packetsReceived: 0, ssrc: 111 } ];

        // The source never receives anything however often it is recycled - it is not wedged, nothing is being sent to
        // it - so recoveries must stop rather than churning a renegotiation every detection window for the whole call.
        for (let i = 0; i < 100; i++) {
            poll(entries);
            tick();
        }
        expect(onWedgeDetected).toHaveBeenCalledTimes(2);
    });

    it('gives a source a fresh recovery budget when it moves to a new receive slot', () => {
        tracks = [ mockTrack(111, 'source-A') ];

        for (let i = 0; i < 100; i++) {
            poll([ { packetsReceived: 0, ssrc: 111 } ]);
            tick();
        }
        expect(onWedgeDetected).toHaveBeenCalledTimes(2);

        // A new SSRC for the same source name means a source-add created a new receive m-line for it, which is a fresh
        // wedge opportunity rather than a continuation of the slot that was already recycled to no effect.
        tracks = [ mockTrack(222, 'source-A') ];
        for (let i = 0; i < 100; i++) {
            poll([ { packetsReceived: 0, ssrc: 222 } ]);
            tick();
        }
        expect(onWedgeDetected).toHaveBeenCalledTimes(4);
    });

    it('keeps an exhausted recovery budget with the slot when it is remapped to another source', () => {
        tracks = [ mockTrack(111, 'source-A') ];

        for (let i = 0; i < 100; i++) {
            poll([ { packetsReceived: 0, ssrc: 111 } ]);
            tick();
        }
        expect(onWedgeDetected).toHaveBeenCalledTimes(2);

        // The bridge remapped the slot to a different source. The m-line is the same one that recycling already failed
        // to revive, so the new occupant must not earn a fresh budget on it.
        tracks = [ mockTrack(111, 'source-B') ];
        for (let i = 0; i < 100; i++) {
            poll([ { packetsReceived: 0, ssrc: 111 } ]);
            tick();
        }
        expect(onWedgeDetected).toHaveBeenCalledTimes(2);
    });

    it('keeps a source that has received packets exempt after it is unmapped and remapped', () => {
        tracks = [ mockTrack(111, 'source-A') ];

        poll([ { packetsReceived: 7, ssrc: 111 } ]); // healthy: the m-line demuxes this SSRC correctly

        // Under SSRC rewriting a rewritten SSRC keeps its receive m-line for the lifetime of the peerconnection, so a
        // later source remapped onto the same SSRC inherits an m-line that is known to demux it and cannot be wedged -
        // even while it reports zero packets (the new owner may simply be silent).
        tick();
        tracks = [];
        poll([]);

        tracks = [ mockTrack(111, 'source-B') ];
        for (let i = 0; i < 10; i++) {
            tick();
            poll([ { packetsReceived: 0, ssrc: 111 } ]);
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('does not fire while media transfer is suspended on the peerconnection', () => {
        tracks = [ mockTrack(111, 'source-A') ];
        pc.audioTransferActive = false;

        // A JVB session is suspended for the duration of an active P2P session and receives no RTP at all while it is,
        // so its remote audio sources report zero packets indefinitely without being wedged.
        for (let i = 0; i < 20; i++) {
            poll([ { packetsReceived: 0, ssrc: 111 } ]);
            tick();
        }
        expect(onWedgeDetected).not.toHaveBeenCalled();
    });

    it('restarts the detection window when media transfer resumes', () => {
        tracks = [ mockTrack(111, 'source-A') ];
        const entries = [ { packetsReceived: 0, ssrc: 111 } ];

        pc.audioTransferActive = false;
        for (let i = 0; i < 5; i++) {
            poll(entries); // t=0..4000, suspended
            tick();
        }

        // The suspended period must not count towards the timeout: the first samples after resuming start a fresh
        // streak rather than firing immediately on an elapsed-looking window.
        pc.audioTransferActive = true;
        poll(entries); // t=5000, fresh streak starts here
        tick();
        poll(entries); // t=6000
        tick();
        poll(entries); // t=7000
        expect(onWedgeDetected).not.toHaveBeenCalled();

        tick();
        poll(entries); // t=8000, elapsed since the fresh streak is 3000 >= timeout
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
