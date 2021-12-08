import FeatureFlags from '../flags/FeatureFlags';
import Listenable from '../util/Listenable';

import { ReceiveVideoController } from './ReceiveVideoController';

// JSDocs disabled for Mock classes to avoid duplication - check on the original classes for info.
/* eslint-disable require-jsdoc */
/**
 * Mock conference for the purpose of this test file.
 */
class MockConference extends Listenable {
    /**
     * A constructor...
     */
    constructor() {
        super();
        this.options = {
            config: {}
        };

        this.activeMediaSession = undefined;
        this.mediaSessions = [];
    }

    _getMediaSessions() {
        return this.mediaSessions;
    }
}

/**
 * Mock {@link RTC} - add things as needed, but only things useful for all tests.
 */
export class MockRTC extends Listenable {
    /**
     * constructor
     */
    /* eslint-disable no-useless-constructor */
    constructor() {
        super();
    }

    // eslint-disable-next-line no-empty-function
    setNewReceiverVideoConstraints() {

    }
}

/* eslint-enable require-jsdoc */
describe('ReceiveVideoController', () => {
    let conference;
    let rtc;
    let receiveVideoController;

    beforeEach(() => {
        conference = new MockConference();
        rtc = new MockRTC();
        receiveVideoController = new ReceiveVideoController(conference, rtc);
    });

    describe('when isSourceNameSignalingEnabled is enabled', () => {
        beforeEach(() => {
            spyOn(FeatureFlags, 'isSourceNameSignalingEnabled').and.returnValue(true);
        });

        it('should call setNewReceiverVideoConstraints with the source names format.', () => {
            const rtcSpy = spyOn(rtc, 'setNewReceiverVideoConstraints');
            const constraints = {
                prioritizedSources: [ 'A_camera_1', 'B_screen_2', 'C_camera_1' ],
                selectedSources: [ 'A_camera_1' ]
            };

            receiveVideoController.setReceiverConstraints(constraints);
            expect(rtcSpy).toHaveBeenCalledWith(constraints);
        });

        it('should not allow the endpoints format.', () => {
            const constraints = {
                onStageEndpoints: [ 'A', 'B', 'C' ],
                selectedEndpoints: [ 'A' ]
            };

            try {
                receiveVideoController.setReceiverConstraints(constraints);
                fail();
            } catch (error) {
                expect(error).toEqual(new Error(
                    '"onStageEndpoints" and "selectedEndpoints" are not supported when sourceNameSignaling is enabled.'
                ));
            }
        });
    });

    describe('when isSourceNameSignalingEnabled is disabled', () => {
        beforeEach(() => {
            spyOn(FeatureFlags, 'isSourceNameSignalingEnabled').and.returnValue(false);
        });

        it('should call setNewReceiverVideoConstraints with the endpoints format.', () => {
            const rtcSpy = spyOn(rtc, 'setNewReceiverVideoConstraints');
            const constraints = {
                onStageEndpoints: [ 'A', 'B', 'C' ],
                selectedEndpoints: [ 'A' ]
            };

            receiveVideoController.setReceiverConstraints(constraints);
            expect(rtcSpy).toHaveBeenCalledWith(constraints);
        });

        it('should not allow the source names format.', () => {
            const constraints = {
                prioritizedSources: [ 'A_camera_1', 'B_screen_2', 'C_camera_1' ],
                selectedSources: [ 'A_camera_1' ]
            };

            try {
                receiveVideoController.setReceiverConstraints(constraints);
                fail();
            } catch (error) {
                expect(error).toEqual(new Error(
                    '"prioritizedSources" and "selectedSources" are not supported when sourceNameSignaling is disabled.'
                ));
            }
        });
    });
});
