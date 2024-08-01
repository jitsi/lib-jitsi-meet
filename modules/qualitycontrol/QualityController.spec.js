import { MockPeerConnection, MockRTC } from '../RTC/MockClasses';
import { nextTick } from '../util/TestUtils';

import { MockConference, MockLocalTrack } from './MockClasses';
import { FixedSizeArray, QualityController } from './QualityController';

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
        tpc = new MockPeerConnection();
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
            localTrack = new MockLocalTrack('1', 720, 'camera');
            qualityController = new QualityController(conference, options, true);
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
            localTrack = new MockLocalTrack('1', 720, 'camera');
            qualityController = new QualityController(conference, options, true);
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
});
