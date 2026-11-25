import FeatureFlags from '../flags/FeatureFlags';
import Listenable from '../util/Listenable';
import JingleSessionPC from '../xmpp/JingleSessionPC';

import ReceiveVideoController from './ReceiveVideoController';

/**
 * Mock conference options interface for testing.
 */
export interface IMockConferenceOptions {
    config: {
        [key: string]: any;
    };
}

// JSDocs disabled for Mock classes to avoid duplication - check on the original classes for info.
/* eslint-disable require-jsdoc */
/**
 * Mock conference for the purpose of this test file.
 */
class MockConference extends Listenable {

    options: IMockConferenceOptions;
    activeMediaSession: JingleSessionPC | undefined;
    mediaSessions: JingleSessionPC[];

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

    getMediaSessions(): JingleSessionPC[] {
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
    setReceiverVideoConstraints() {
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
        conference.rtc = rtc;
        receiveVideoController = new ReceiveVideoController(conference);
    });

    describe('when sourceNameSignaling is enabled', () => {
        beforeEach(() => {
            FeatureFlags.init({ });
        });

        it('should call setReceiverVideoConstraints with the source names format.', () => {
            const rtcSpy = spyOn(rtc, 'setReceiverVideoConstraints');
            const constraints = {
                onStageSources: [ 'A_camera_1', 'B_screen_2', 'C_camera_1' ],
                selectedSources: [ 'A_camera_1' ]
            };

            receiveVideoController.setReceiverConstraints(constraints);
            expect(rtcSpy).toHaveBeenCalledWith({
                ...constraints,
                lastN: -1
            });
        });
    });

    describe('with a p2p session', () => {
        let p2pSession;
        const constraints = (lastN?: number) => ({
            constraints: { 'A-v0': { maxHeight: 180 } },
            defaultConstraints: { maxHeight: 0 },
            lastN,
            onStageSources: [ 'A-v0' ],
            selectedSources: []
        });

        beforeEach(() => {
            p2pSession = {
                isP2P: true,
                // eslint-disable-next-line no-empty-function
                setReceiverVideoConstraint() {}
            };
            conference.mediaSessions = [ p2pSession ];
        });

        it('does not resend unchanged constraints that leave lastN out', () => {
            const p2pSpy = spyOn(p2pSession, 'setReceiverVideoConstraint');
            const rtcSpy = spyOn(rtc, 'setReceiverVideoConstraints');

            receiveVideoController.setReceiverConstraints(constraints());
            receiveVideoController.setReceiverConstraints(constraints());
            receiveVideoController.setReceiverConstraints(constraints());

            expect(p2pSpy).toHaveBeenCalledTimes(1);
            expect(p2pSpy).toHaveBeenCalledWith(new Map([ [ 'A-v0', 180 ] ]));
            expect(rtcSpy).toHaveBeenCalledTimes(1);
            expect(rtcSpy.calls.mostRecent().args[0].lastN).toBe(-1);
        });

        it('sends the constraints again when they change', () => {
            const p2pSpy = spyOn(p2pSession, 'setReceiverVideoConstraint');

            receiveVideoController.setReceiverConstraints(constraints(25));
            receiveVideoController.setReceiverConstraints(constraints(25));
            receiveVideoController.setReceiverConstraints(constraints(10));

            expect(p2pSpy).toHaveBeenCalledTimes(2);
            expect(receiveVideoController.getLastN()).toBe(10);
        });

        it('does not modify the constraints passed in', () => {
            const passed = constraints();

            receiveVideoController.setReceiverConstraints(passed);

            expect(passed.lastN).toBeUndefined();
            expect(passed).toEqual(constraints());
        });
    });
});
