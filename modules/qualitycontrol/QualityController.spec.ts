import { AnalyticsEvents } from '../../service/statistics/AnalyticsEvents';
import { VideoType } from '../../service/RTC/VideoType';
import RTCStats from '../RTCStats/RTCStats';
import { RTCStatsEvents } from '../RTCStats/RTCStatsEvents';
import Statistics from '../statistics/statistics';
import { MockPeerConnection, MockRTC } from '../RTC/MockClasses';
import { nextTick } from '../util/TestUtils';

import { MockConference, MockLocalTrack } from './MockClasses';
import { FixedSizeArray, NOT_DECODING_THRESHOLD_CYCLES, QualityController } from './QualityController';

describe('QualityController', () => {
    let qualityController;
    let conference;
    let data;
    let localTrack;
    let options;
    let rtc;
    let sourceStats;
    let tpc;
    let updatedStats;

    beforeEach(() => {
        rtc = new MockRTC();
        conference = new MockConference(rtc);
        tpc = new MockPeerConnection('test-id', false, false);
    });

    describe('When adaptive mode is enabled', () => {
        beforeEach(() => {
            options = {
                enableAdaptiveMode: true,
                jvb: {
                    preferenceOrder: [ 'VP9', 'VP8', 'H264' ],
                    screenshareCodec: 'VP9'
                },
                lastNRampupTime: 60000,
                p2p: {}
            };
            localTrack = new MockLocalTrack('1', 720, VideoType.CAMERA);
            qualityController = new QualityController(conference, options);
            sourceStats = {
                avgEncodeTime: 12,
                codec: 'VP8',
                encodeResolution: 360,
                qualityLimitationReason: 'cpu',
                localTrack,
                timestamp: 1,
                tpc
            };

            qualityController._encodeTimeStats = new Map();
            data = new FixedSizeArray(10);
            data.add(sourceStats);
            qualityController._encodeTimeStats.set(localTrack.rtcId, data);
            jasmine.clock().install();
            spyOn(qualityController.receiveVideoController, 'setLastN');
        });

        afterEach(() => {
            jasmine.clock().uninstall();
        });

        it('and the client encounters cpu limitation', async () => {
            // Start with 10 sources being received.
            rtc.forwardedSources = [ 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10' ];
            qualityController.receiveVideoController._lastN = 25;
            qualityController._performQualityOptimizations(sourceStats);

            // When a cpu limitation is reported for the first time with the lowest complexity codec, the number of
            // received videos will be halved.
            expect(qualityController.receiveVideoController.setLastN).toHaveBeenCalledWith(5);
            qualityController.receiveVideoController._lastN = 5;

            rtc.forwardedSources = [ 'v1', 'v2', 'v3', 'v4', 'v5' ];

            // If the stats continue to show a cpu limitation, the lastN value will be further dropped.
            qualityController._performQualityOptimizations(sourceStats);
            expect(qualityController.receiveVideoController.setLastN).toHaveBeenCalledWith(3);
            rtc.forwardedSources = [ 'v1', 'v2', 'v3' ];
            qualityController.receiveVideoController._lastN = 3;

            // If the stats indicate that the cpu limitation ceases to exist, the lastN value will be incremented by 1
            // if the stats continue to look good for the next 60 secs.
            updatedStats = {
                avgEncodeTime: 8,
                codec: 'VP8',
                encodeResolution: 720,
                qualityLimitationReason: 'none',
                localTrack,
                timestamp: 2,
                tpc
            };
            data = qualityController._encodeTimeStats.get(localTrack.rtcId);
            data.add(updatedStats);
            qualityController._performQualityOptimizations(updatedStats);

            // Wait for atleast 60 secs and check if lastN value was incremented.
            await nextTick(61000);
            expect(qualityController.receiveVideoController.setLastN).toHaveBeenCalledWith(4);
            rtc.forwardedSources = [ 'v1', 'v2', 'v3', 'v4' ];
            qualityController.receiveVideoController._lastN = 4;

            // Stats continue to indicate that there is no cpu limitation.
            updatedStats = {
                avgEncodeTime: 8,
                codec: 'VP8',
                encodeResolution: 720,
                qualityLimitationReason: 'none',
                localTrack,
                timestamp: 3,
                tpc
            };
            data = qualityController._encodeTimeStats.get(localTrack.rtcId);
            data.add(updatedStats);
            qualityController._performQualityOptimizations(updatedStats);

            await nextTick(30000);

            // However, cpu limitation is reported 30 secs after the lastN is bumped to 4 which indicates that it
            // is a direct consequence of the lastN value going up. Therefore, client will not make any more attempts
            // to raise the lastN value even if the cpu limitation is gone.
            updatedStats = {
                avgEncodeTime: 12,
                codec: 'VP8',
                encodeResolution: 360,
                qualityLimitationReason: 'cpu',
                localTrack,
                timestamp: 4,
                tpc
            };

            data = qualityController._encodeTimeStats.get(localTrack.rtcId);
            data.add(updatedStats);
            qualityController._performQualityOptimizations(updatedStats);

            // Check that further ramp ups are blocked and lastN value is dropped to 3.
            expect(qualityController._isLastNRampupBlocked).toBeTrue();
            expect(qualityController.receiveVideoController.setLastN).toHaveBeenCalledWith(3);
            rtc.forwardedSources = [ 'v1', 'v2', 'v3' ];
            qualityController.receiveVideoController._lastN = 3;

            // Even if the limitation is removed one more time, check if the client continues to operate at the current
            // lastN value.
            updatedStats = {
                avgEncodeTime: 8,
                codec: 'VP8',
                encodeResolution: 720,
                qualityLimitationReason: 'none',
                localTrack,
                timestamp: 5,
                tpc
            };

            data = qualityController._encodeTimeStats.get(localTrack.rtcId);
            data.add(updatedStats);
            qualityController._performQualityOptimizations(updatedStats);

            await nextTick(61000);
            expect(qualityController.receiveVideoController.setLastN).toHaveBeenCalledWith(3);
        });
    });

    describe('When adaptive mode is disabled', () => {
        beforeEach(() => {
            options = {
                enableAdaptiveMode: false,
                jvb: {},
                lastNRampupTime: 60000,
                p2p: {}
            };
            localTrack = new MockLocalTrack('1', 720, VideoType.CAMERA);
            qualityController = new QualityController(conference, options);
            sourceStats = {
                avgEncodeTime: 12,
                codec: 'VP8',
                encodeResolution: 360,
                qualityLimitationReason: 'cpu',
                localTrack,
                timestamp: 1,
                tpc
            };

            qualityController._encodeTimeStats = new Map();
            data = new FixedSizeArray(10);
            data.add(sourceStats);
            qualityController._encodeTimeStats.set(localTrack.rtcId, data);
            jasmine.clock().install();
            spyOn(qualityController.receiveVideoController, 'setLastN');
        });

        afterEach(() => {
            jasmine.clock().uninstall();
        });

        it('and the client encounters cpu limitation with lowest complexity codec', async () => {
            // Start with 10 sources being received.
            rtc.forwardedSources = [ 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10' ];
            qualityController.receiveVideoController._lastN = 25;
            qualityController._performQualityOptimizations(sourceStats);

            expect(qualityController.receiveVideoController.setLastN).toHaveBeenCalledTimes(0);
        });
    });

    describe('_processInboundVideoStats', () => {
        let rtcStatsSpy;
        let analyticsSpy;

        const THRESHOLD = NOT_DECODING_THRESHOLD_CYCLES;

        const BAD_SSRC = 1001;
        const BAD_SSRC_2 = 2001;
        const PARTICIPANT_1 = 'participant-1';
        const PARTICIPANT_2 = 'participant-2';

        const makeBadStats = (ssrc, participantId) =>
            new Map([ [ ssrc, { bitrateDownload: 500, fps: 0, participantId } ] ]);

        /** Drives {@code n} consecutive bad-state cycles for a single SSRC through the controller. */
        const runBadCycles = (n: number, stats) => {
            for (let i = 0; i < n; i++) {
                qualityController._processInboundVideoStats(tpc, stats);
            }
        };

        beforeEach(() => {
            options = {
                enableAdaptiveMode: true,
                jvb: {},
                lastNRampupTime: 60000,
                p2p: {}
            };
            qualityController = new QualityController(conference, options);

            // Wire up the active session so _processInboundVideoStats doesn't early-return.
            conference.jvbJingleSession = { peerconnection: tpc } as any;

            rtcStatsSpy = spyOn(RTCStats, 'sendStatsEntry');
            analyticsSpy = spyOn(Statistics, 'sendAnalytics');
        });

        it('does not fire any event when the TPC does not match the active session', () => {
            const otherTpc = new MockPeerConnection('other-id', false, false);

            qualityController._processInboundVideoStats(otherTpc, makeBadStats(BAD_SSRC, PARTICIPANT_1));

            expect(rtcStatsSpy).not.toHaveBeenCalled();
            expect(analyticsSpy).not.toHaveBeenCalled();
        });

        it('does not fire event after 1 bad cycle', () => {
            runBadCycles(1, makeBadStats(BAD_SSRC, PARTICIPANT_1));

            expect(rtcStatsSpy).not.toHaveBeenCalled();
            expect(analyticsSpy).not.toHaveBeenCalled();
        });

        it(`does not fire event after ${THRESHOLD - 1} consecutive bad cycles (one below threshold)`, () => {
            runBadCycles(THRESHOLD - 1, makeBadStats(BAD_SSRC, PARTICIPANT_1));

            expect(rtcStatsSpy).not.toHaveBeenCalled();
            expect(analyticsSpy).not.toHaveBeenCalled();
        });

        it(`fires stopped=true for both RTCStats and analytics after exactly ${THRESHOLD} consecutive bad cycles`, () => {
            const stats = makeBadStats(BAD_SSRC, PARTICIPANT_1);

            runBadCycles(THRESHOLD, stats);

            const expectedData = { participantId: PARTICIPANT_1, ssrc: BAD_SSRC, stopped: true };

            expect(rtcStatsSpy).toHaveBeenCalledOnceWith(
                RTCStatsEvents.REMOTE_VIDEO_DECODING_EVENT, null, expectedData);
            expect(analyticsSpy).toHaveBeenCalledOnceWith(
                AnalyticsEvents.REMOTE_VIDEO_DECODING, expectedData);
        });

        it('does not fire a second stopped=true event while the issue remains active', () => {
            const stats = makeBadStats(BAD_SSRC, PARTICIPANT_1);

            // Trigger onset.
            runBadCycles(THRESHOLD, stats);

            rtcStatsSpy.calls.reset();
            analyticsSpy.calls.reset();

            // Additional bad cycles — issue is already active.
            runBadCycles(2, stats);

            expect(rtcStatsSpy).not.toHaveBeenCalled();
            expect(analyticsSpy).not.toHaveBeenCalled();
        });

        it('fires stopped=false when the SSRC disappears from stats after the issue was active', () => {
            const stats = makeBadStats(BAD_SSRC, PARTICIPANT_1);

            // Trigger onset.
            runBadCycles(THRESHOLD, stats);

            rtcStatsSpy.calls.reset();
            analyticsSpy.calls.reset();

            // SSRC is no longer in the bad state (fps recovered or bytes stopped).
            qualityController._processInboundVideoStats(tpc, new Map());

            const expectedData = { participantId: PARTICIPANT_1, ssrc: BAD_SSRC, stopped: false };

            expect(rtcStatsSpy).toHaveBeenCalledOnceWith(
                RTCStatsEvents.REMOTE_VIDEO_DECODING_EVENT, null, expectedData);
            expect(analyticsSpy).toHaveBeenCalledOnceWith(
                AnalyticsEvents.REMOTE_VIDEO_DECODING, expectedData);
        });

        it('does not fire stopped=false when the SSRC disappears before the issue was declared active', () => {
            // THRESHOLD - 1 bad cycles — just below the threshold.
            runBadCycles(THRESHOLD - 1, makeBadStats(BAD_SSRC, PARTICIPANT_1));

            // SSRC disappears without ever reaching the threshold.
            qualityController._processInboundVideoStats(tpc, new Map());

            expect(rtcStatsSpy).not.toHaveBeenCalled();
            expect(analyticsSpy).not.toHaveBeenCalled();
        });

        it(`resets the counter after one good cycle and requires ${THRESHOLD} more bad cycles to fire again`, () => {
            const stats = makeBadStats(BAD_SSRC, PARTICIPANT_1);

            // THRESHOLD - 1 bad cycles (just below the threshold).
            runBadCycles(THRESHOLD - 1, stats);

            // 1 good cycle resets the counter (SSRC absent from incoming stats).
            qualityController._processInboundVideoStats(tpc, new Map());

            // THRESHOLD - 1 more bad cycles — still not enough after the reset.
            runBadCycles(THRESHOLD - 1, stats);

            expect(rtcStatsSpy).not.toHaveBeenCalled();

            // The final bad cycle that reaches the threshold after the reset.
            qualityController._processInboundVideoStats(tpc, stats);

            expect(rtcStatsSpy).toHaveBeenCalledOnceWith(
                RTCStatsEvents.REMOTE_VIDEO_DECODING_EVENT, null,
                { participantId: PARTICIPANT_1, ssrc: BAD_SSRC, stopped: true });
        });

        it('re-fires stopped=true if the issue resolves and then recurs', () => {
            const stats = makeBadStats(BAD_SSRC, PARTICIPANT_1);

            // First onset.
            runBadCycles(THRESHOLD, stats);

            // Resolution.
            qualityController._processInboundVideoStats(tpc, new Map());

            rtcStatsSpy.calls.reset();
            analyticsSpy.calls.reset();

            // Second onset.
            runBadCycles(THRESHOLD, stats);

            expect(rtcStatsSpy).toHaveBeenCalledOnceWith(
                RTCStatsEvents.REMOTE_VIDEO_DECODING_EVENT, null,
                { participantId: PARTICIPANT_1, ssrc: BAD_SSRC, stopped: true });
        });

        it('tracks multiple SSRCs independently and resolves each separately', () => {
            const twoSsrcs = new Map([
                [ BAD_SSRC, { bitrateDownload: 500, fps: 0, participantId: PARTICIPANT_1 } ],
                [ BAD_SSRC_2, { bitrateDownload: 300, fps: 0, participantId: PARTICIPANT_2 } ]
            ]);

            // THRESHOLD bad cycles for both SSRCs.
            runBadCycles(THRESHOLD, twoSsrcs);

            // Both SSRCs should have fired stopped=true.
            expect(rtcStatsSpy).toHaveBeenCalledTimes(2);
            expect(rtcStatsSpy).toHaveBeenCalledWith(
                RTCStatsEvents.REMOTE_VIDEO_DECODING_EVENT, null,
                { participantId: PARTICIPANT_1, ssrc: BAD_SSRC, stopped: true });
            expect(rtcStatsSpy).toHaveBeenCalledWith(
                RTCStatsEvents.REMOTE_VIDEO_DECODING_EVENT, null,
                { participantId: PARTICIPANT_2, ssrc: BAD_SSRC_2, stopped: true });

            rtcStatsSpy.calls.reset();
            analyticsSpy.calls.reset();

            // Only SSRC_1 remains bad; SSRC_2 has recovered.
            qualityController._processInboundVideoStats(tpc, makeBadStats(BAD_SSRC, PARTICIPANT_1));

            // Only SSRC_2 should fire stopped=false; SSRC_1 should produce no new event.
            expect(rtcStatsSpy).toHaveBeenCalledOnceWith(
                RTCStatsEvents.REMOTE_VIDEO_DECODING_EVENT, null,
                { participantId: PARTICIPANT_2, ssrc: BAD_SSRC_2, stopped: false });
        });

        it('fires stopped=false when all bad SSRCs recover simultaneously (all-clear cycle)', () => {
            const twoSsrcs = new Map([
                [ BAD_SSRC, { bitrateDownload: 500, fps: 0, participantId: PARTICIPANT_1 } ],
                [ BAD_SSRC_2, { bitrateDownload: 300, fps: 0, participantId: PARTICIPANT_2 } ]
            ]);

            // Reach the threshold for both SSRCs.
            runBadCycles(THRESHOLD, twoSsrcs);

            rtcStatsSpy.calls.reset();
            analyticsSpy.calls.reset();

            // Both SSRCs recover in the same cycle — RTPStatsCollector emits an empty map (all-clear).
            qualityController._processInboundVideoStats(tpc, new Map());

            // Both resolution events must fire.
            expect(rtcStatsSpy).toHaveBeenCalledTimes(2);
            expect(rtcStatsSpy).toHaveBeenCalledWith(
                RTCStatsEvents.REMOTE_VIDEO_DECODING_EVENT, null,
                { participantId: PARTICIPANT_1, ssrc: BAD_SSRC, stopped: false });
            expect(rtcStatsSpy).toHaveBeenCalledWith(
                RTCStatsEvents.REMOTE_VIDEO_DECODING_EVENT, null,
                { participantId: PARTICIPANT_2, ssrc: BAD_SSRC_2, stopped: false });

            // Tracker must be empty after the all-clear.
            expect(qualityController._notDecodingVideoTracker.size).toBe(0);
        });

        it('clears the tracker map on dispose without firing resolution events', () => {
            // Reach the threshold so the issue is marked active before dispose.
            const stats = makeBadStats(BAD_SSRC, PARTICIPANT_1);

            runBadCycles(THRESHOLD, stats);

            expect(qualityController._notDecodingVideoTracker.size).toBe(1);

            rtcStatsSpy.calls.reset();
            analyticsSpy.calls.reset();

            qualityController.dispose();

            expect(qualityController._notDecodingVideoTracker.size).toBe(0);

            // dispose() should not fire any resolution events.
            expect(rtcStatsSpy).not.toHaveBeenCalled();
            expect(analyticsSpy).not.toHaveBeenCalled();
        });
    });
});
