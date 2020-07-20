/* global */

import Listenable from '../util/Listenable';
import { nextTick } from '../util/TestUtils';

import IceFailedHandling from './IceFailedHandling';

/**
 * Mock conference for the purpose of this test.
 */
class MockConference extends Listenable {
    /**
     * A constructor...
     */
    constructor() {
        super();
        this.options = {
            config: { }
        };
    }
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
        mockConference.room = {
            supportsRestartByTerminate: () => false
        };
        mockConference.xmpp = {
            ping: () => Promise.resolve()
        };
        emitEventSpy = spyOn(mockConference.eventEmitter, 'emit');
    });

    afterEach(() => {
        jasmine.clock().uninstall();
    });

    describe('when ICE restarts are disabled', () => {
        beforeEach(() => {
            mockConference.options.config.enableIceRestart = false;
        });
        it('emits ICE failed with 2 seconds delay after XMPP ping comes through', () => {
            iceFailedHandling.start();

            return nextTick() // tick for ping
                .then(() => {
                    expect(emitEventSpy).not.toHaveBeenCalled();

                    return nextTick(2500); // tick for the 2 sec ice timeout
                })
                .then(() => {
                    expect(emitEventSpy).toHaveBeenCalled();
                });
        });
        it('cancel method cancels the ICE failed event', () => {
            iceFailedHandling.start();

            return nextTick(1000) // tick for ping
                .then(() => {
                    expect(emitEventSpy).not.toHaveBeenCalled();
                    iceFailedHandling.cancel();

                    return nextTick(2500); // tick for ice timeout
                })
                .then(() => {
                    expect(emitEventSpy).not.toHaveBeenCalled();
                });
        });
    });
    describe('when ICE restart are enabled', () => {
        let sendIceFailedSpy;

        beforeEach(() => {
            mockConference.options.config.enableIceRestart = true;
            mockConference.jvbJingleSession = {
                getIceConnectionState: () => 'failed',
                // eslint-disable-next-line no-empty-function
                sendIceFailedNotification: () => { }
            };
            sendIceFailedSpy = spyOn(mockConference.jvbJingleSession, 'sendIceFailedNotification');
        });
        it('send ICE failed notification to Jicofo', () => {
            iceFailedHandling.start();

            return nextTick() // tick for ping
                .then(() => nextTick(2500)) // tick for ice timeout
                .then(() => {
                    expect(sendIceFailedSpy).toHaveBeenCalled();
                });
        });
        it('not send ICE failed notification to Jicofo if canceled', () => {
            iceFailedHandling.start();

            // first it send ping which is async - need next tick
            return nextTick(1000)
                .then(() => {
                    expect(sendIceFailedSpy).not.toHaveBeenCalled();
                    iceFailedHandling.cancel();

                    return nextTick(3000); // tick for ice timeout
                })
                .then(() => {
                    expect(sendIceFailedSpy).not.toHaveBeenCalled();
                });
        });
    });
    describe('if Jingle session restarts are supported', () => {
        let sendSessionTerminateSpy;

        beforeEach(() => {
            mockConference.options.config.enableIceRestart = undefined;
            mockConference.room = {
                supportsRestartByTerminate: () => true
            };
            mockConference.jvbJingleSession = {
                getIceConnectionState: () => 'failed',
                // eslint-disable-next-line no-empty-function
                terminate: () => { }
            };
            sendSessionTerminateSpy = spyOn(mockConference.jvbJingleSession, 'terminate');
        });
        it('send "session-terminate" with the request restart attribute', () => {
            iceFailedHandling.start();

            return nextTick() // tick for ping
                .then(() => nextTick(2500)) // tick for ice timeout
                .then(() => {
                    expect(sendSessionTerminateSpy).toHaveBeenCalledWith(
                        jasmine.any(Function),
                        jasmine.any(Function), {
                            reason: 'connectivity-error',
                            reasonDescription: 'ICE FAILED',
                            requestRestart: true,
                            sendSessionTerminate: true
                        });
                });
        });
    });
});
