/* global */

import Listenable from '../util/Listenable';
import IceFailedHandling from './IceFailedHandling';
import networkInfo from './NetworkInfo';
import { nextTick } from '../util/TestUtils';

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
        networkInfo.updateNetworkInfo({ isOnline: true });
        mockConference = new MockConference();
        iceFailedHandling = new IceFailedHandling(mockConference);
        mockConference.eventEmitter = {
            // eslint-disable-next-line no-empty-function
            emit: () => { }
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
        it('emits ICE failed with 15 seconds delay', () => {
            iceFailedHandling.start();
            jasmine.clock().tick(10000);
            expect(emitEventSpy).not.toHaveBeenCalled();

            jasmine.clock().tick(5100);
            expect(emitEventSpy).toHaveBeenCalled();
        });
        it('starts counting the time after the internet comes back online', () => {
            iceFailedHandling.start();
            jasmine.clock().tick(3000);

            networkInfo.updateNetworkInfo({ isOnline: false });
            jasmine.clock().tick(16000);
            expect(emitEventSpy).not.toHaveBeenCalled();

            networkInfo.updateNetworkInfo({ isOnline: true });
            jasmine.clock().tick(16000);
            expect(emitEventSpy).toHaveBeenCalled();
        });
        it('cancel method cancels the ICE failed event', () => {
            iceFailedHandling.start();
            jasmine.clock().tick(10000);
            expect(emitEventSpy).not.toHaveBeenCalled();

            iceFailedHandling.cancel();
            jasmine.clock().tick(5100);
            expect(emitEventSpy).not.toHaveBeenCalled();
        });
    });
    describe('when ICE restart are enabled', () => {
        let sendIceFailedSpy;

        beforeEach(() => {
            mockConference.options.config.enableIceRestart = true;
            mockConference.xmpp = {
                isPingSupported: () => true,
                ping: () => Promise.resolve()
            };
            mockConference.jvbJingleSession = {
                getIceConnectionState: () => 'failed',
                // eslint-disable-next-line no-empty-function
                sendIceFailedNotification: () => { }
            };
            sendIceFailedSpy = spyOn(mockConference.jvbJingleSession, 'sendIceFailedNotification');
        });
        it('send ICE failed notification to Jicofo', () => {
            iceFailedHandling.start();

            // first it send ping which is async - need next tick
            return nextTick().then(() => {
                jasmine.clock().tick(3000);
                expect(sendIceFailedSpy).toHaveBeenCalled();
            });
        });
        it('not send ICE failed notification to Jicofo if canceled', () => {
            iceFailedHandling.start();

            // first it send ping which is async - need next tick
            return nextTick().then(() => {
                jasmine.clock().tick(1000);
                expect(sendIceFailedSpy).not.toHaveBeenCalled();
                iceFailedHandling.cancel();
                jasmine.clock().tick(3000);
                expect(sendIceFailedSpy).not.toHaveBeenCalled();
            });
        });
    });
});
