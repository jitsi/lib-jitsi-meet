import networkInfo, { default as NetworkInfo } from '../connectivity/NetworkInfo';
import { nextTick } from '../util/TestUtils';

import ResumeTask from './ResumeTask';

/**
 * A mock of the stream management plugin.
 */
class MockStreamManagement {
    /**
     * @return {string}
     */
    getResumeToken() {
        return '1234';
    }

    /**
     * @returns {void}
     */
    // eslint-disable-next-line no-empty-function,require-jsdoc
    resume() {

    }
}

/**
 * A minimal set of Strophe.Connection class required by the {@link ResumeTask}.
 */
class MockStropheConection {
    /**
     * A constructor.
     */
    constructor() {
        this.streamManagement = new MockStreamManagement();
        this.service = 'wss://something.com/xmpp-websocket';
    }
}

describe('ResumeTask', () => {
    let connection, resumeTask;

    beforeEach(() => {
        NetworkInfo.updateNetworkInfo({ isOnline: true });

        connection = new MockStropheConection();
        resumeTask = new ResumeTask(connection);

        jasmine.clock().install();
    });
    afterEach(() => {
        jasmine.clock().uninstall();

        // Need to unregister the listener added to the networkInfo global
        resumeTask.cancel();
    });
    describe('the retry task', () => {
        it('should be scheduled immediately if the internet is online', () => {
            const retrySpy = spyOn(connection.streamManagement, 'resume');

            resumeTask.schedule();

            expect(resumeTask.retryDelay).not.toBe(undefined);

            return nextTick(resumeTask.retryDelay + 10).then(() => {
                expect(retrySpy).toHaveBeenCalled();
            });
        });
        it('should be scheduled when the internet comes back online', () => {
            NetworkInfo.updateNetworkInfo({ isOnline: false });

            resumeTask.schedule();

            expect(resumeTask.retryDelay).toBe(undefined);

            NetworkInfo.updateNetworkInfo({ isOnline: true });

            expect(resumeTask.retryDelay).not.toBe(undefined);
        });
        it('should not execute first scheduled and then canceled', () => {
            const retrySpy = spyOn(connection.streamManagement, 'resume');

            resumeTask.schedule();

            const retryDelay = resumeTask.retryDelay;

            resumeTask.cancel();

            return nextTick(retryDelay + 10).then(() => {
                expect(retrySpy).not.toHaveBeenCalled();
            });
        });
        it('should be rescheduled if internet goes offline/online', () => {
            resumeTask.schedule();

            expect(resumeTask.retryDelay).not.toBe(undefined);

            NetworkInfo.updateNetworkInfo({ isOnline: false });

            expect(resumeTask.retryDelay).toBe(undefined);

            NetworkInfo.updateNetworkInfo({ isOnline: true });

            expect(resumeTask.retryDelay).not.toBe(undefined);
        });
    });
    describe('the retryDelay', () => {
        const between1and3seconds = delay => delay >= 1000 && delay <= 3000;
        const between3and9seconds = delay => delay >= 3000 && delay <= 9000;
        const between4500msAnd27seconds = delay => delay >= 4500 && delay <= 27000;

        it('should be between 1 - 3 seconds for the first attempt', () => {
            resumeTask.schedule();

            expect(between1and3seconds(resumeTask.retryDelay)).toBeTruthy();
        });
        it('should be between 3 - 9 seconds for the second attempt', () => {
            resumeTask.schedule();
            resumeTask.schedule();

            expect(between3and9seconds(resumeTask.retryDelay)).toBeTruthy(`retryDelay=${resumeTask.retryDelay}`);
        });
        it('should be between 4.5 - 27 seconds for the third attempt', () => {
            resumeTask.schedule();
            resumeTask.schedule();
            resumeTask.schedule();

            expect(between4500msAnd27seconds(resumeTask.retryDelay)).toBeTruthy();

            // It should remain within the last range after the 3rd retry
            resumeTask.schedule();
            expect(between4500msAnd27seconds(resumeTask.retryDelay)).toBeTruthy();
        });
        it('should not increase when internet goes offline/online', () => {
            resumeTask.schedule();

            networkInfo.updateNetworkInfo({ isOnline: false });
            networkInfo.updateNetworkInfo({ isOnline: true });
            networkInfo.updateNetworkInfo({ isOnline: false });
            networkInfo.updateNetworkInfo({ isOnline: true });

            expect(between1and3seconds(resumeTask.retryDelay)).toBeTruthy();
        });
    });
});
