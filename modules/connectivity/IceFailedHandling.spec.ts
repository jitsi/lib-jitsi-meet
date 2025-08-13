import { IMockConferenceOptions } from '../qualitycontrol/ReceiveVideoController.spec';
import Listenable from '../util/Listenable';
import { nextTick } from '../util/TestUtils';

import IceFailedHandling from './IceFailedHandling';

/**
 * Mock conference for the purpose of this test.
 */
class MockConference extends Listenable {
    options: IMockConferenceOptions;
    
    /**
     * A constructor...
     */
    constructor() {
        super();
        this.options = {
            config: { }
        };
    }

    /**
     * Mock function.
     */
    _stopJvbSession() {} // eslint-disable-line no-empty-function
}

describe('IceFailedHandling', () => {
    let mockConference;
    let iceFailedHandling;
    let emitEventSpy;

    beforeEach(() => {
        jasmine.clock().install();
        mockConference = new MockConference();
        iceFailedHandling = new IceFailedHandling(mockConference);
        mockConference.eventEmitter = {
            // eslint-disable-next-line no-empty-function
            emit: () => { }
        };
        mockConference.room = {};
        mockConference.xmpp = {
            ping: () => Promise.resolve()
        };
        emitEventSpy = spyOn(mockConference.eventEmitter, 'emit');
    });

    afterEach(() => {
        jasmine.clock().uninstall();
    });

    describe('if Jingle session restarts are supported', () => {
        let sendSessionTerminateSpy;

        beforeEach(() => {
            mockConference.room = {};
            mockConference.jvbJingleSession = {
                getIceConnectionState: () => 'failed',
                // eslint-disable-next-line no-empty-function
                terminate: () => { }
            };
            sendSessionTerminateSpy = spyOn(mockConference, '_stopJvbSession');
        });
        it('send "session-terminate" with the request restart attribute', () => {
            iceFailedHandling.start();

            return nextTick() // tick for ping
                .then(() => nextTick(2500)) // tick for ice timeout
                .then(() => {
                    expect(sendSessionTerminateSpy).toHaveBeenCalledWith(
                        {
                            reason: 'connectivity-error',
                            reasonDescription: 'ICE FAILED',
                            requestRestart: true,
                            sendSessionTerminate: true
                        });
                });
        });
        it('cancel method cancels the call to terminate session', () => {
            iceFailedHandling.start();

            return nextTick(1000) // tick for ping
                .then(() => {
                    expect(sendSessionTerminateSpy).not.toHaveBeenCalled();
                    iceFailedHandling.cancel();

                    return nextTick(2500); // tick for ice timeout
                })
                .then(() => {
                    expect(sendSessionTerminateSpy).not.toHaveBeenCalled();
                });
        });
    });
});
