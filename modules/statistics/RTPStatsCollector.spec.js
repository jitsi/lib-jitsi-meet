import RTCEvents from '../../service/RTC/RTCEvents';
import { ReceiverAudioSubscription } from '../../service/RTC/ReceiverAudioSubscription';
import * as StatisticsEvents from '../../service/statistics/Events';
import browser from '../browser';
import EventEmitter from '../util/EventEmitter';

import RTPStatsCollector from './RTPStatsCollector';

describe('RTPStatsCollector - Dominant Speaker Integration', () => {
    let statsCollector;
    let mockPeerConnection;
    let mockEventEmitter;
    const audioLevelsInterval = 100;
    const statsInterval = 1000;
    const SSRC1 = 12345;
    const SSRC2 = 67890;
    const SSRC3 = 11111;

    beforeEach(() => {
        jasmine.clock().install();

        mockEventEmitter = new EventEmitter();
        spyOn(mockEventEmitter, 'emit').and.callThrough();

        mockPeerConnection = {
            getAudioLevels: jasmine.createSpy('getAudioLevels').and.returnValue({}),
            getStats: jasmine.createSpy('getStats').and.returnValue(Promise.resolve(new Map())),
            getTrackBySSRC: jasmine.createSpy('getTrackBySSRC').and.returnValue(null)
        };

        spyOn(browser, 'supportsReceiverStats').and.returnValue(true);

        statsCollector = new RTPStatsCollector(
            mockPeerConnection,
            audioLevelsInterval,
            statsInterval,
            mockEventEmitter,
            true // Enable dominant speaker feature
        );

        // Set up some speakers
        statsCollector.setSpeakerList([ 'user1', 'user2', 'user3' ]);

        // Clear any default audio levels to start fresh
        clearAudioLevels();

        // Enable dominant speaker functionality by triggering audio subscription mode change
        enableDominantSpeaker();
    });

    /**
     * Helper function to enable dominant speaker functionality
     */
    function enableDominantSpeaker() {
        // Trigger the AUDIO_SUBSCRIPTION_MODE_CHANGED event with non-ALL mode
        mockEventEmitter.emit(RTCEvents.AUDIO_SUBSCRIPTION_MODE_CHANGED, ReceiverAudioSubscription.EXCLUDE);
    }

    /**
     * Helper function to disable dominant speaker functionality
     */
    function disableDominantSpeaker() {
        // Trigger the AUDIO_SUBSCRIPTION_MODE_CHANGED event with ALL mode
        mockEventEmitter.emit(RTCEvents.AUDIO_SUBSCRIPTION_MODE_CHANGED, ReceiverAudioSubscription.ALL);
    }

    /**
     * Helper function to set fresh audio levels for the current test
     */
    function setAudioLevels(audioLevelsMap) {
        mockPeerConnection.getAudioLevels.and.returnValue(audioLevelsMap);
    }

    /**
     * Helper function to clear audio levels (useful for isolation)
     */
    function clearAudioLevels() {
        mockPeerConnection.getAudioLevels.and.returnValue({});
    }

    afterEach(() => {
        if (statsCollector) {
            statsCollector.stop();
        }

        // Clear the DSI state between tests
        if (statsCollector && statsCollector.dominantSpeakerIdentification) {
            statsCollector.dominantSpeakerIdentification.speakers.clear();
            statsCollector.dominantSpeakerIdentification.currentDominantSpeaker = null;
            statsCollector.dominantSpeakerIdentification.lastDecisionTime = 0;

            // Clear previous speakers array
            statsCollector.previousSpeakers = [];
        }
        statsCollector = null;

        // Reset the mock's return value to avoid state leakage
        if (mockPeerConnection && mockPeerConnection.getAudioLevels) {
            mockPeerConnection.getAudioLevels.and.returnValue({});
        }

        // Reset event emitter spies
        if (mockEventEmitter && mockEventEmitter.emit) {
            mockEventEmitter.emit.calls.reset();
        }
        jasmine.clock().uninstall();
    });

    describe('constructor', () => {
        it('initializes with dominant speaker identification instance', () => {
            expect(statsCollector.dominantSpeakerIdentification).toBeDefined();
            expect(typeof statsCollector.dominantSpeakerIdentification.processAudioLevel).toBe('function');
            expect(typeof statsCollector.dominantSpeakerIdentification.getDominantSpeaker).toBe('function');
        });

        it('initializes with dominantSpeakerEnabled flag based on constructor parameter', () => {
            const enabledCollector = new RTPStatsCollector(
                mockPeerConnection,
                audioLevelsInterval,
                statsInterval,
                mockEventEmitter,
                true
            );

            // Trigger subscription mode change to enable
            mockEventEmitter.emit(RTCEvents.AUDIO_SUBSCRIPTION_MODE_CHANGED, ReceiverAudioSubscription.INCLUDE);
            expect(enabledCollector.dominantSpeakerEnabled).toBe(true);

            const disabledCollector = new RTPStatsCollector(
                mockPeerConnection,
                audioLevelsInterval,
                statsInterval,
                mockEventEmitter,
                false
            );

            // Even with non-ALL mode, it should remain disabled when constructor param is false
            mockEventEmitter.emit(RTCEvents.AUDIO_SUBSCRIPTION_MODE_CHANGED, ReceiverAudioSubscription.INCLUDE);
            expect(disabledCollector.dominantSpeakerEnabled).toBe(false);
        });
    });

    describe('getCurrentDominantSpeaker', () => {
        it('returns current dominant speaker from DSI', () => {
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(SSRC1);

            const result = statsCollector.getCurrentDominantSpeaker();

            expect(result).toBe(SSRC1);
            expect(statsCollector.dominantSpeakerIdentification.getDominantSpeaker).toHaveBeenCalled();
        });

        it('returns null when no dominant speaker', () => {
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            const result = statsCollector.getCurrentDominantSpeaker();

            expect(result).toBe(null);
        });
    });

    describe('getSpeakerStats', () => {
        it('returns speaker statistics from DSI', () => {
            const mockStats = { [SSRC1]: { immediateActivity: 1.5 } };

            spyOn(statsCollector.dominantSpeakerIdentification, 'getSpeakerStats').and.returnValue(mockStats);

            const result = statsCollector.getSpeakerStats();

            expect(result).toBe(mockStats);
            expect(statsCollector.dominantSpeakerIdentification.getSpeakerStats).toHaveBeenCalled();
        });
    });

    describe('dominant speaker feature enabling/disabling', () => {
        beforeEach(() => {
            mockPeerConnection.getAudioLevels.and.returnValue({
                [SSRC1]: 0.4
            });
        });

        it('processes DSI when enabled via constructor and subscription mode', () => {
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            // Should be enabled from setup
            expect(statsCollector.dominantSpeakerEnabled).toBe(true);

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalled();
        });

        it('disables DSI when audio subscription mode is ALL', () => {
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            // Disable by setting ALL mode
            disableDominantSpeaker();
            expect(statsCollector.dominantSpeakerEnabled).toBe(false);

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).not.toHaveBeenCalled();
        });

        it('can be re-enabled by changing subscription mode from ALL to non-ALL', () => {
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            // First disable
            disableDominantSpeaker();
            expect(statsCollector.dominantSpeakerEnabled).toBe(false);

            // Then re-enable
            enableDominantSpeaker();
            expect(statsCollector.dominantSpeakerEnabled).toBe(true);

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalled();
        });

        it('remains disabled if constructor parameter is false regardless of subscription mode', () => {
            const disabledCollector = new RTPStatsCollector(
                mockPeerConnection,
                audioLevelsInterval,
                statsInterval,
                mockEventEmitter,
                false // Disabled in constructor
            );

            spyOn(disabledCollector.dominantSpeakerIdentification, 'processAudioLevel');

            // Try to enable via subscription mode
            mockEventEmitter.emit(RTCEvents.AUDIO_SUBSCRIPTION_MODE_CHANGED, ReceiverAudioSubscription.INCLUDE);
            expect(disabledCollector.dominantSpeakerEnabled).toBe(false);

            disabledCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(disabledCollector.dominantSpeakerIdentification.processAudioLevel).not.toHaveBeenCalled();

            disabledCollector.stop();
        });
    });

    describe('audio levels processing with DSI', () => {
        beforeEach(() => {
            // Mock audio levels from peer connection
            mockPeerConnection.getAudioLevels.and.returnValue({
                [SSRC1]: 0.2, // Will be scaled to 0.5
                [SSRC2]: 0.4, // Will be scaled to 1.0
                [SSRC3]: 0.8 // Will be scaled to 2.0
            });
        });

        it('processes audio levels through DSI when starting audio level stats', () => {
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledWith(SSRC1, 0.5);
            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledWith(SSRC2, 1.0);
            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledWith(SSRC3, 2.0);
        });

        it('emits AUDIO_LEVEL events with scaled values', () => {
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                StatisticsEvents.AUDIO_LEVEL,
                mockPeerConnection,
                SSRC1,
                0.5,
                false
            );
            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                StatisticsEvents.AUDIO_LEVEL,
                mockPeerConnection,
                SSRC2,
                1.0,
                false
            );
            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                StatisticsEvents.AUDIO_LEVEL,
                mockPeerConnection,
                SSRC3,
                2.0,
                false
            );
        });

        it('does not process audio levels when startAudioLevelStats is false', () => {
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');

            statsCollector.start(false);
            jasmine.clock().tick(audioLevelsInterval);

            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).not.toHaveBeenCalled();
            expect(mockPeerConnection.getAudioLevels).not.toHaveBeenCalled();
        });

        it('does not process audio levels when browser does not support receiver stats', () => {
            browser.supportsReceiverStats.and.returnValue(false);
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).not.toHaveBeenCalled();
        });

        it('still emits AUDIO_LEVEL events when dominant speaker is disabled', () => {
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');

            // Disable dominant speaker functionality
            disableDominantSpeaker();

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            // Should not process through DSI
            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).not.toHaveBeenCalled();

            // But should still emit AUDIO_LEVEL events
            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                StatisticsEvents.AUDIO_LEVEL,
                mockPeerConnection,
                SSRC1,
                0.5,
                false
            );
        });
    });

    describe('dominant speaker change detection', () => {
        it('emits DOMINANT_SPEAKER_CHANGED when speaker changes', () => {
            // Clear any previous state and set specific audio levels for this test
            clearAudioLevels();
            setAudioLevels({
                [SSRC1]: 0.8,
                [SSRC2]: 0.2,
                [SSRC3]: 0.5
            });

            // Set the initial state: no current dominant speaker
            statsCollector.dominantSpeakerIdentification.currentDominantSpeaker = null;

            // Mock getDominantSpeaker to return SSRC1 (simulating a change from null to SSRC1)
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(SSRC1);

            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel').and.callFake((ssrc, level) => {
                console.log(`processAudioLevel called with ssrc=${ssrc}, level=${level}`);
            });

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            // Verify that getDominantSpeaker was called
            expect(statsCollector.dominantSpeakerIdentification.getDominantSpeaker).toHaveBeenCalled();

            // The key test: verify the DOMINANT_SPEAKER_CHANGED event was emitted
            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                StatisticsEvents.DOMINANT_SPEAKER_CHANGED,
                mockPeerConnection,
                SSRC1,
                jasmine.any(Array)
            );
        });

        it('does not emit event when dominant speaker remains the same', () => {
            // Set specific audio levels for this test
            setAudioLevels({
                [SSRC1]: 0.6,
                [SSRC2]: 0.1
            });

            // Set initial state: SSRC1 is already dominant
            statsCollector.dominantSpeakerIdentification.currentDominantSpeaker = SSRC1;

            // Mock to return the same speaker (no change)
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(SSRC1);
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel').and.callFake((ssrc, level) => {
                console.log(`processAudioLevel called with ssrc=${ssrc}, level=${level} (same speaker test)`);
            });

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            // Verify getDominantSpeaker was called
            expect(statsCollector.dominantSpeakerIdentification.getDominantSpeaker).toHaveBeenCalled();

            // Should NOT emit DOMINANT_SPEAKER_CHANGED since currentDominantSpeaker (SSRC1) === returned value (SSRC1)
            expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
                StatisticsEvents.DOMINANT_SPEAKER_CHANGED,
                jasmine.any(Object),
                jasmine.any(Object),
                jasmine.any(Object)
            );
        });

        it('handles transition from one speaker to another across multiple intervals', () => {
            // Initial state: SSRC1 is dominant
            setAudioLevels({
                [SSRC1]: 0.8,
                [SSRC2]: 0.2
            });

            statsCollector.dominantSpeakerIdentification.currentDominantSpeaker = SSRC1;

            // Mock to return SSRC2 (simulating transition from SSRC1 to SSRC2)
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(SSRC2);
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                StatisticsEvents.DOMINANT_SPEAKER_CHANGED,
                mockPeerConnection,
                SSRC2,
                jasmine.any(Array)
            );
        });

        it('handles transition from speaker to no dominant speaker (null)', () => {
            // Set audio levels (could be low levels)
            setAudioLevels({
                [SSRC1]: 0.1, // Very low activity
                [SSRC2]: 0.05 // Very low activity
            });

            // Initial state: SSRC1 was dominant
            statsCollector.dominantSpeakerIdentification.currentDominantSpeaker = SSRC1;

            // Mock to return null (no dominant speaker due to low activity)
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);
            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                StatisticsEvents.DOMINANT_SPEAKER_CHANGED,
                mockPeerConnection,
                null, // New dominant speaker is null
                jasmine.any(Array)
            );
        });
    });

    describe('integration with existing functionality', () => {
        it('continues to emit regular AUDIO_LEVEL events alongside DSI processing', () => {
            mockPeerConnection.getAudioLevels.and.returnValue({
                [SSRC1]: 0.4
            });

            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            // Should emit both AUDIO_LEVEL and process through DSI
            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                StatisticsEvents.AUDIO_LEVEL,
                mockPeerConnection,
                SSRC1,
                1.0, // 0.4 * 2.5
                false
            );
            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledWith(SSRC1, 1.0);
        });

        it('handles empty audio levels gracefully', () => {
            mockPeerConnection.getAudioLevels.and.returnValue({});

            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            expect(() => {
                statsCollector.start(true);
                jasmine.clock().tick(audioLevelsInterval);
            }).not.toThrow();

            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).not.toHaveBeenCalled();
        });

        it('processes multiple intervals correctly', () => {
            mockPeerConnection.getAudioLevels.and.returnValue({
                [SSRC1]: 0.2,
                [SSRC2]: 0.6
            });

            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            statsCollector.start(true);

            // First interval
            jasmine.clock().tick(audioLevelsInterval);
            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledTimes(2);

            // Second interval
            jasmine.clock().tick(audioLevelsInterval);
            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledTimes(4);

            // Third interval
            jasmine.clock().tick(audioLevelsInterval);
            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledTimes(6);
        });

        it('stops processing when stopped', () => {
            mockPeerConnection.getAudioLevels.and.returnValue({
                [SSRC1]: 0.5
            });

            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');

            statsCollector.start(true);
            jasmine.clock().tick(audioLevelsInterval);

            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledTimes(1);

            statsCollector.stop();
            jasmine.clock().tick(audioLevelsInterval * 2);

            // Should not process any more after stop
            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledTimes(1);
        });
    });

    describe('error handling', () => {
        it('handles invalid SSRC values', () => {
            mockPeerConnection.getAudioLevels.and.returnValue({
                '': 0.3,
                'invalid': 0.5,
                'null': 0.1
            });

            spyOn(statsCollector.dominantSpeakerIdentification, 'processAudioLevel');
            spyOn(statsCollector.dominantSpeakerIdentification, 'getDominantSpeaker').and.returnValue(null);

            expect(() => {
                statsCollector.start(true);
                jasmine.clock().tick(audioLevelsInterval);
            }).not.toThrow();

            // Should still process the values (parseInt will handle conversion)
            expect(statsCollector.dominantSpeakerIdentification.processAudioLevel).toHaveBeenCalledTimes(3);
        });
    });
});
