import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import { JitsiTrackEvents } from '../../JitsiTrackEvents';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import { VideoType } from '../../service/RTC/VideoType';
import RTCStats from '../RTCStats/RTCStats';
import browser from '../browser';
import Statistics from '../statistics/statistics';
import Listenable from '../util/Listenable';

import { TrackStreamingStatus, TrackStreamingStatusImpl } from './TrackStreamingStatus';

// JSDocs disabled for Mock classes to keep tests concise.
/* eslint-disable require-jsdoc */

class MockStatistics {
    listeners: Function[] = [];

    addConnectionStatsListener(listener: Function): void {
        this.listeners.push(listener);
    }

    removeConnectionStatsListener(listener: Function): void {
        const idx = this.listeners.indexOf(listener);

        if (idx !== -1) {
            this.listeners.splice(idx, 1);
        }
    }

    emitConnectionStats(tpc: any, data: any): void {
        for (const listener of this.listeners) {
            listener(tpc, data);
        }
    }
}

class MockTrack extends Listenable {
    private _sourceName: string;
    private _participantId: string;
    private _ssrc: number;
    private _muted: boolean = false;
    private _webRtcMuted: boolean = false;
    private _isVideoTrack: boolean = true;
    private _streamingStatus: TrackStreamingStatus = TrackStreamingStatus.ACTIVE;
    private _enteredForwardedSourcesTimestamp: number | null = null;

    constructor(sourceName: string, participantId: string, ssrc: number) {
        super();
        this._sourceName = sourceName;
        this._participantId = participantId;
        this._ssrc = ssrc;
    }

    getSourceName() { return this._sourceName; }
    getParticipantId() { return this._participantId; }
    getSsrc() { return this._ssrc; }
    isMuted() { return this._muted; }
    setMuted(v: boolean) { this._muted = v; }
    isWebRTCTrackMuted() { return this._webRtcMuted; }
    setWebRTCTrackMuted(v: boolean) { this._webRtcMuted = v; }
    isVideoTrack() { return this._isVideoTrack; }
    setIsVideoTrack(v: boolean) { this._isVideoTrack = v; }
    getVideoType() { return VideoType.CAMERA; }
    getTrackStreamingStatus() { return this._streamingStatus; }
    _setTrackStreamingStatus(s: TrackStreamingStatus) { this._streamingStatus = s; }
    _getEnteredForwardedSourcesTimestamp() { return this._enteredForwardedSourcesTimestamp; }
    _setEnteredForwardedSourcesTimestamp(ts: number) { this._enteredForwardedSourcesTimestamp = ts; }
    _clearEnteredForwardedSourcesTimestamp() { this._enteredForwardedSourcesTimestamp = null; }
}

class MockRTC extends Listenable {
    private _forwardedSources: Set<string> = new Set();

    constructor() { super(); }

    isInForwardedSources(sourceName: string) { return this._forwardedSources.has(sourceName); }
    addForwardedSource(s: string) { this._forwardedSources.add(s); }
    removeForwardedSource(s: string) { this._forwardedSources.delete(s); }
}

class MockConference extends Listenable {
    statistics: MockStatistics;
    private _p2pActive: boolean = false;
    private _lastN: number = -1;

    constructor() {
        super();
        this.statistics = new MockStatistics();
    }

    isP2PActive() { return this._p2pActive; }
    setP2PActive(v: boolean) { this._p2pActive = v; }
    getLastN() { return this._lastN; }
    setLastN(v: number) { this._lastN = v; }
}

/* eslint-enable require-jsdoc */

const SOURCE_NAME = 'test-source-v0';
const PARTICIPANT_ID = 'user1';
const SSRC = 12345;
const DEFAULT_RTC_MUTE_TIMEOUT = 10000;
const DEFAULT_P2P_RTC_MUTE_TIMEOUT = 2500;

/** Helper: build a TrackStreamingStatusImpl with defaults. */
function buildInstance(options: {
    p2pActive?: boolean;
    inForwardedSources?: boolean;
    isMuted?: boolean;
    isVideoTrack?: boolean;
    supportsVideoMuteOnConnInterrupted?: boolean;
} = {}): {
    impl: TrackStreamingStatusImpl;
    mockTrack: MockTrack;
    mockRtc: MockRTC;
    mockConference: MockConference;
} {
    const mockTrack = new MockTrack(SOURCE_NAME, PARTICIPANT_ID, SSRC);
    const mockRtc = new MockRTC();
    const mockConference = new MockConference();

    if (options.isVideoTrack === false) {
        mockTrack.setIsVideoTrack(false);
    }
    if (options.isMuted) {
        mockTrack.setMuted(true);
    }
    if (options.p2pActive) {
        mockConference.setP2PActive(true);
    }
    if (options.inForwardedSources !== false) {
        // Default: track is in forwarded sources
        mockRtc.addForwardedSource(SOURCE_NAME);
    }

    const supportsEvents = options.supportsVideoMuteOnConnInterrupted ?? false;

    spyOn(browser, 'supportsVideoMuteOnConnInterrupted').and.returnValue(supportsEvents);
    spyOn(RTCStats, 'sendStatsEntry');
    spyOn(Statistics, 'sendAnalytics');

    const impl = new TrackStreamingStatusImpl(
        mockRtc as any,
        mockConference as any,
        mockTrack as any,
        {
            outOfForwardedSourcesTimeout: 500,
            p2pRtcMuteTimeout: DEFAULT_P2P_RTC_MUTE_TIMEOUT,
            rtcMuteTimeout: DEFAULT_RTC_MUTE_TIMEOUT
        }
    );

    return { impl, mockTrack, mockRtc, mockConference };
}

// ─────────────────────────────────────────────────────────
// Static method tests
// ─────────────────────────────────────────────────────────

describe('TrackStreamingStatusImpl static methods', () => {
    describe('_getNewStateForJvbMode', () => {
        beforeEach(() => {
            spyOn(browser, 'supportsVideoMuteOnConnInterrupted').and.returnValue(false);
        });

        it('returns ACTIVE when video is muted, regardless of other flags', () => {
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(true, false, true, false))
                .toBe(TrackStreamingStatus.ACTIVE);
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(false, true, true, true))
                .toBe(TrackStreamingStatus.ACTIVE);
        });

        it('returns INACTIVE when !supportsEvents, !isVideoTrackFrozen, track not in forwarded sources', () => {
            // supportsVideoMuteOnConnInterrupted = false, isVideoTrackFrozen = false
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(false, false, false, false))
                .toBe(TrackStreamingStatus.INACTIVE);
        });

        it('returns ACTIVE when !supportsEvents, !isVideoTrackFrozen, track in forwarded sources', () => {
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(true, false, false, false))
                .toBe(TrackStreamingStatus.ACTIVE);
        });

        it('returns RESTORING when stats-frozen, in forwarded sources, not timed out', () => {
            // isVideoTrackFrozen=true triggers the freeze-detection branch even when supportsEvents=false
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(true, false, false, true))
                .toBe(TrackStreamingStatus.RESTORING);
        });

        it('returns INTERRUPTED when stats-frozen, in forwarded sources, timed out', () => {
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(true, true, false, true))
                .toBe(TrackStreamingStatus.INTERRUPTED);
        });

        it('returns INACTIVE when stats-frozen, not in forwarded sources', () => {
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(false, false, false, true))
                .toBe(TrackStreamingStatus.INACTIVE);
        });

        it('returns ACTIVE when supportsEvents and not frozen', () => {
            (browser.supportsVideoMuteOnConnInterrupted as jasmine.Spy).and.returnValue(true);
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(true, false, false, false))
                .toBe(TrackStreamingStatus.ACTIVE);
        });

        it('returns RESTORING when supportsEvents, frozen, in forwarded sources, not timed out', () => {
            (browser.supportsVideoMuteOnConnInterrupted as jasmine.Spy).and.returnValue(true);
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(true, false, false, true))
                .toBe(TrackStreamingStatus.RESTORING);
        });

        it('returns INTERRUPTED when supportsEvents, frozen, in forwarded sources, timed out', () => {
            (browser.supportsVideoMuteOnConnInterrupted as jasmine.Spy).and.returnValue(true);
            expect(TrackStreamingStatusImpl._getNewStateForJvbMode(true, true, false, true))
                .toBe(TrackStreamingStatus.INTERRUPTED);
        });
    });

    describe('_getNewStateForP2PMode', () => {
        beforeEach(() => {
            spyOn(browser, 'supportsVideoMuteOnConnInterrupted').and.returnValue(false);
        });

        it('returns ACTIVE when !supportsEvents and !isVideoTrackFrozen', () => {
            expect(TrackStreamingStatusImpl._getNewStateForP2PMode(false, false))
                .toBe(TrackStreamingStatus.ACTIVE);
        });

        it('returns INTERRUPTED when !supportsEvents but isVideoTrackFrozen=true (stats path)', () => {
            expect(TrackStreamingStatusImpl._getNewStateForP2PMode(false, true))
                .toBe(TrackStreamingStatus.INTERRUPTED);
        });

        it('returns ACTIVE when video is muted even if frozen', () => {
            (browser.supportsVideoMuteOnConnInterrupted as jasmine.Spy).and.returnValue(true);
            expect(TrackStreamingStatusImpl._getNewStateForP2PMode(true, true))
                .toBe(TrackStreamingStatus.ACTIVE);
        });

        it('returns ACTIVE when supportsEvents, not muted, not frozen', () => {
            (browser.supportsVideoMuteOnConnInterrupted as jasmine.Spy).and.returnValue(true);
            expect(TrackStreamingStatusImpl._getNewStateForP2PMode(false, false))
                .toBe(TrackStreamingStatus.ACTIVE);
        });

        it('returns INTERRUPTED when supportsEvents, not muted, frozen', () => {
            (browser.supportsVideoMuteOnConnInterrupted as jasmine.Spy).and.returnValue(true);
            expect(TrackStreamingStatusImpl._getNewStateForP2PMode(false, true))
                .toBe(TrackStreamingStatus.INTERRUPTED);
        });
    });
});

// ─────────────────────────────────────────────────────────
// init() / dispose() listener registration
// ─────────────────────────────────────────────────────────

describe('TrackStreamingStatusImpl init/dispose', () => {
    let impl: TrackStreamingStatusImpl;
    let mockTrack: MockTrack;
    let mockRtc: MockRTC;
    let mockConference: MockConference;

    describe('when supportsVideoMuteOnConnInterrupted = false (Chrome >= M144 / Firefox / Safari)', () => {
        describe('for a video track', () => {
            beforeEach(() => {
                ({ impl, mockTrack, mockRtc, mockConference } = buildInstance({
                    supportsVideoMuteOnConnInterrupted: false
                }));
                impl.init();
            });

            afterEach(() => {
                impl.dispose();
            });

            it('registers a CONNECTION_STATS listener on the statistics object', () => {
                expect(mockConference.statistics.listeners.length).toBe(1);
            });

            it('removes the CONNECTION_STATS listener on dispose', () => {
                impl.dispose();
                expect(mockConference.statistics.listeners.length).toBe(0);
            });

            it('does not register RTC mute/unmute listeners', () => {
                // If RTC mute listeners were registered, onTrackRtcMuted would affect state.
                // Trigger a fake RTC mute event — it should have no effect.
                const statusBefore = mockTrack.getTrackStreamingStatus();

                mockRtc.emit(RTCEvents.REMOTE_TRACK_MUTE, mockTrack as any);
                expect(mockTrack.getTrackStreamingStatus()).toBe(statusBefore);
            });
        });

        describe('for an audio track', () => {
            beforeEach(() => {
                ({ impl, mockTrack, mockRtc, mockConference } = buildInstance({
                    supportsVideoMuteOnConnInterrupted: false,
                    isVideoTrack: false
                }));
                impl.init();
            });

            afterEach(() => {
                impl.dispose();
            });

            it('does not register a CONNECTION_STATS listener for audio tracks', () => {
                expect(mockConference.statistics.listeners.length).toBe(0);
            });
        });
    });

    describe('when supportsVideoMuteOnConnInterrupted = true (Chrome < M144 / React Native)', () => {
        beforeEach(() => {
            ({ impl, mockTrack, mockRtc, mockConference } = buildInstance({
                supportsVideoMuteOnConnInterrupted: true
            }));
            impl.init();
        });

        afterEach(() => {
            impl.dispose();
        });

        it('does not register a CONNECTION_STATS listener', () => {
            expect(mockConference.statistics.listeners.length).toBe(0);
        });

        it('registers RTC mute/unmute listeners', () => {
            // Setting rtcMutedTimestamp to a value proves onTrackRtcMuted was wired.
            mockRtc.emit(RTCEvents.REMOTE_TRACK_MUTE, mockTrack as any);
            expect(impl.rtcMutedTimestamp).not.toBeNull();
        });
    });
});

// ─────────────────────────────────────────────────────────
// _handleFramesDecodedUpdate
// ─────────────────────────────────────────────────────────

describe('TrackStreamingStatusImpl._handleFramesDecodedUpdate', () => {
    let impl: TrackStreamingStatusImpl;
    let mockTrack: MockTrack;
    let mockConference: MockConference;

    beforeEach(() => {
        jasmine.clock().install();
        ({ impl, mockTrack, mockConference } = buildInstance({
            supportsVideoMuteOnConnInterrupted: false,
            inForwardedSources: true
        }));
        impl.init();
    });

    afterEach(() => {
        impl.dispose();
        jasmine.clock().uninstall();
    });

    it('ignores updates when data.framesDecoded is absent', () => {
        impl._handleFramesDecodedUpdate({});
        expect(impl._lastFramesDecoded).toBeNull();
    });

    it('ignores updates when data.framesDecoded is null', () => {
        impl._handleFramesDecodedUpdate({ framesDecoded: null });
        expect(impl._lastFramesDecoded).toBeNull();
        expect(impl._lastFramesDecodedAt).toBeNull();
    });

    it('seeds _lastFramesDecodedAt on the first poll where the SSRC is absent', () => {
        jasmine.clock().mockDate(new Date(5000));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[99999, 100]]) }); // different SSRC

        expect(impl._lastFramesDecoded).toBeNull(); // no count recorded
        expect(impl._lastFramesDecodedAt).toBe(5000); // stall timer started
    });

    it('does not overwrite _lastFramesDecodedAt on subsequent absent polls', () => {
        jasmine.clock().mockDate(new Date(5000));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map() }); // first absent poll

        jasmine.clock().mockDate(new Date(6000));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map() }); // second absent poll

        expect(impl._lastFramesDecodedAt).toBe(5000); // unchanged — first poll wins
    });

    it('declares frozen after timeout when SSRC never appears in stats', () => {
        spyOn(impl, 'figureOutStreamingStatus').and.callThrough();

        jasmine.clock().mockDate(new Date(0));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map() }); // seeds timer

        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map() }); // triggers freeze

        expect(impl._statsTrackFrozen).toBeTrue();
        expect(impl.figureOutStreamingStatus).toHaveBeenCalled();
    });

    it('clears frozen state when SSRC eventually appears and frames start flowing', () => {
        // Track was never-received: freeze after timeout
        jasmine.clock().mockDate(new Date(0));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map() });
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map() });
        expect(impl._statsTrackFrozen).toBeTrue();

        // SSRC finally appears with real frames
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 2000));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 150]]) });

        expect(impl._statsTrackFrozen).toBeFalse();
        expect(impl._lastFramesDecoded).toBe(150);
    });

    it('records framesDecoded = 0 at stream start (zero is not treated as absent)', () => {
        jasmine.clock().mockDate(new Date(1000));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 0]]) });
        expect(impl._lastFramesDecoded).toBe(0);
        expect(impl._lastFramesDecodedAt).toBe(1000);
    });

    it('records the first framesDecoded value and its timestamp', () => {
        jasmine.clock().mockDate(new Date(1000));
        const map = new Map([[SSRC, 50]]);

        impl._handleFramesDecodedUpdate({ framesDecoded: map });
        expect(impl._lastFramesDecoded).toBe(50);
        expect(impl._lastFramesDecodedAt).toBe(1000);
    });

    it('updates timestamp and count when frames advance', () => {
        jasmine.clock().mockDate(new Date(1000));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 50]]) });

        jasmine.clock().mockDate(new Date(2000));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });

        expect(impl._lastFramesDecoded).toBe(100);
        expect(impl._lastFramesDecodedAt).toBe(2000);
    });

    it('does not set _statsTrackFrozen when stall is within the timeout', () => {
        jasmine.clock().mockDate(new Date(0));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });

        // Advance time but stay within the 10s frozen timeout
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT - 1));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) }); // same count

        expect(impl._statsTrackFrozen).toBeFalse();
    });

    it('sets _statsTrackFrozen and calls figureOutStreamingStatus when stall exceeds timeout', () => {
        spyOn(impl, 'figureOutStreamingStatus').and.callThrough();

        jasmine.clock().mockDate(new Date(0));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });

        // Advance past frozen timeout
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });

        expect(impl._statsTrackFrozen).toBeTrue();
        expect(impl.figureOutStreamingStatus).toHaveBeenCalled();
    });

    it('does not set _statsTrackFrozen when track is signalling-muted', () => {
        mockTrack.setMuted(true);
        jasmine.clock().mockDate(new Date(0));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });

        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });

        expect(impl._statsTrackFrozen).toBeFalse();
    });

    it('does not fire freeze twice for the same stall period', () => {
        spyOn(impl, 'figureOutStreamingStatus').and.callThrough();

        jasmine.clock().mockDate(new Date(0));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });

        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });

        const callCount = (impl.figureOutStreamingStatus as jasmine.Spy).calls.count();

        // Another stale update — already frozen, should not call figureOutStreamingStatus again
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 2000));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });

        expect((impl.figureOutStreamingStatus as jasmine.Spy).calls.count()).toBe(callCount);
    });

    it('clears _statsTrackFrozen and calls figureOutStreamingStatus when frames resume', () => {
        spyOn(impl, 'figureOutStreamingStatus').and.callThrough();

        // Freeze the track
        jasmine.clock().mockDate(new Date(0));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 100]]) });
        expect(impl._statsTrackFrozen).toBeTrue();

        const callsBefore = (impl.figureOutStreamingStatus as jasmine.Spy).calls.count();

        // Frames resume
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 2000));
        impl._handleFramesDecodedUpdate({ framesDecoded: new Map([[SSRC, 200]]) });

        expect(impl._statsTrackFrozen).toBeFalse();
        expect((impl.figureOutStreamingStatus as jasmine.Spy).calls.count()).toBeGreaterThan(callsBefore);
    });
});

// ─────────────────────────────────────────────────────────
// isVideoTrackFrozen
// ─────────────────────────────────────────────────────────

describe('TrackStreamingStatusImpl.isVideoTrackFrozen', () => {
    afterEach(() => {
        jasmine.clock().uninstall();
    });

    it('returns true immediately when _statsTrackFrozen is set', () => {
        const { impl } = buildInstance({ supportsVideoMuteOnConnInterrupted: false });

        impl._statsTrackFrozen = true;
        expect(impl.isVideoTrackFrozen()).toBeTrue();
    });

    it('returns false when _statsTrackFrozen is false and browser does not support events', () => {
        const { impl } = buildInstance({ supportsVideoMuteOnConnInterrupted: false });

        expect(impl.isVideoTrackFrozen()).toBeFalse();
    });

    describe('when browser supports video mute on connection interrupted (legacy path)', () => {
        beforeEach(() => {
            jasmine.clock().install();
        });

        it('returns false when track is not WebRTC-muted', () => {
            const { impl, mockTrack } = buildInstance({ supportsVideoMuteOnConnInterrupted: true });

            mockTrack.setWebRTCTrackMuted(false);
            expect(impl.isVideoTrackFrozen()).toBeFalse();
        });

        it('returns false when track is muted but timeout has not elapsed', () => {
            const { impl, mockTrack } = buildInstance({ supportsVideoMuteOnConnInterrupted: true });

            jasmine.clock().mockDate(new Date(0));
            mockTrack.setWebRTCTrackMuted(true);
            impl.rtcMutedTimestamp = 0;

            jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT - 1));
            expect(impl.isVideoTrackFrozen()).toBeFalse();
        });

        it('returns true when track is muted and timeout has elapsed', () => {
            const { impl, mockTrack } = buildInstance({ supportsVideoMuteOnConnInterrupted: true });

            jasmine.clock().mockDate(new Date(0));
            mockTrack.setWebRTCTrackMuted(true);
            impl.rtcMutedTimestamp = 0;

            jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT));
            expect(impl.isVideoTrackFrozen()).toBeTrue();
        });
    });
});

// ─────────────────────────────────────────────────────────
// End-to-end status transitions — JVB mode
// ─────────────────────────────────────────────────────────

describe('TrackStreamingStatusImpl end-to-end — JVB mode', () => {
    let impl: TrackStreamingStatusImpl;
    let mockTrack: MockTrack;
    let mockRtc: MockRTC;
    let mockConference: MockConference;

    beforeEach(() => {
        jasmine.clock().install();
        ({ impl, mockTrack, mockRtc, mockConference } = buildInstance({
            supportsVideoMuteOnConnInterrupted: false,
            inForwardedSources: true
        }));
        impl.init();
        // Kick off initial status
        impl.figureOutStreamingStatus();
    });

    afterEach(() => {
        impl.dispose();
        jasmine.clock().uninstall();
    });

    it('starts ACTIVE when in forwarded sources and not frozen', () => {
        expect(mockTrack.getTrackStreamingStatus()).toBe(TrackStreamingStatus.ACTIVE);
    });

    it('transitions to RESTORING when stats detect a freeze (in forwarded sources, not timed out)', () => {
        // Establish baseline
        jasmine.clock().mockDate(new Date(0));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });

        // Stall beyond frozen timeout
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });

        expect(impl._statsTrackFrozen).toBeTrue();
        expect(mockTrack.getTrackStreamingStatus()).toBe(TrackStreamingStatus.RESTORING);
    });

    it('transitions to INACTIVE when frozen and not in forwarded sources', () => {
        mockRtc.removeForwardedSource(SOURCE_NAME);

        jasmine.clock().mockDate(new Date(0));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });

        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });

        expect(impl._statsTrackFrozen).toBeTrue();
        expect(mockTrack.getTrackStreamingStatus()).toBe(TrackStreamingStatus.INACTIVE);
    });

    it('transitions back to ACTIVE when frames resume after being frozen', () => {
        // Freeze
        jasmine.clock().mockDate(new Date(0));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });
        expect(impl._statsTrackFrozen).toBeTrue();

        // Resume
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 2000));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 200]]) });

        expect(impl._statsTrackFrozen).toBeFalse();
        expect(mockTrack.getTrackStreamingStatus()).toBe(TrackStreamingStatus.ACTIVE);
    });

    it('stays ACTIVE when video is muted, even if frames stop', () => {
        mockTrack.setMuted(true);
        impl.figureOutStreamingStatus();
        expect(mockTrack.getTrackStreamingStatus()).toBe(TrackStreamingStatus.ACTIVE);

        // Stats showing stale frames should not trigger freeze when muted
        jasmine.clock().mockDate(new Date(0));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });
        jasmine.clock().mockDate(new Date(DEFAULT_RTC_MUTE_TIMEOUT + 1));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });

        expect(impl._statsTrackFrozen).toBeFalse();
        expect(mockTrack.getTrackStreamingStatus()).toBe(TrackStreamingStatus.ACTIVE);
    });
});

// ─────────────────────────────────────────────────────────
// End-to-end status transitions — P2P mode
// ─────────────────────────────────────────────────────────

describe('TrackStreamingStatusImpl end-to-end — P2P mode', () => {
    let impl: TrackStreamingStatusImpl;
    let mockTrack: MockTrack;
    let mockConference: MockConference;

    beforeEach(() => {
        jasmine.clock().install();
        // In P2P mode there is no JVB, so the track is not in forwarded sources.
        // _getVideoFrozenTimeout() returns p2pRtcMuteTimeout when !inForwardedSources && isP2PActive.
        ({ impl, mockTrack, mockConference } = buildInstance({
            supportsVideoMuteOnConnInterrupted: false,
            p2pActive: true,
            inForwardedSources: false
        }));
        impl.init();
        impl.figureOutStreamingStatus();
    });

    afterEach(() => {
        impl.dispose();
        jasmine.clock().uninstall();
    });

    it('starts ACTIVE in P2P mode', () => {
        expect(mockTrack.getTrackStreamingStatus()).toBe(TrackStreamingStatus.ACTIVE);
    });

    it('transitions to INTERRUPTED when stats detect a freeze in P2P mode', () => {
        jasmine.clock().mockDate(new Date(0));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });

        // _getVideoFrozenTimeout() = p2pRtcMuteTimeout = 2500ms (not in forwarded sources, P2P active)
        jasmine.clock().mockDate(new Date(DEFAULT_P2P_RTC_MUTE_TIMEOUT + 1));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });

        expect(impl._statsTrackFrozen).toBeTrue();
        expect(mockTrack.getTrackStreamingStatus()).toBe(TrackStreamingStatus.INTERRUPTED);
    });

    it('transitions back to ACTIVE when frames resume in P2P mode', () => {
        // Freeze
        jasmine.clock().mockDate(new Date(0));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });
        jasmine.clock().mockDate(new Date(DEFAULT_P2P_RTC_MUTE_TIMEOUT + 1));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 100]]) });
        expect(impl._statsTrackFrozen).toBeTrue();

        // Resume
        jasmine.clock().mockDate(new Date(DEFAULT_P2P_RTC_MUTE_TIMEOUT + 2000));
        mockConference.statistics.emitConnectionStats(null, { framesDecoded: new Map([[SSRC, 200]]) });

        expect(impl._statsTrackFrozen).toBeFalse();
        expect(mockTrack.getTrackStreamingStatus()).toBe(TrackStreamingStatus.ACTIVE);
    });
});
