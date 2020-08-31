import { callNTimes, callWithDelay } from '../util/TestUtils';

import { VFS } from './VFS';

describe('VFS', () => {
    beforeAll(() => {
        jasmine.clock().install();
        jasmine.clock().mockDate();
    });
    afterAll(() => {
        jasmine.clock().uninstall();
    });
    describe('calcStats', () => {
        it('returns avg=100,absAvgDev=0 for 10 intervals of 100ms', () => {
            const n = 10;
            const vfs = new VFS(n);
            const callbackAfter100ms = () => callWithDelay(() => vfs.onFrameRendered(), 100);

            return callNTimes(callbackAfter100ms, 10).then(() => {
                const stats = vfs.calcStats();

                expect(stats.avgFrameInterval).toBe(100);
                expect(stats.absAvgDev).toBe(0);
            });
        });
        it('returns correct values for the example set of data', () => {
            const delays = [ 90, 110, 90, 110, 90, 110, 90, 110, 90, 110 ];
            const vfs = new VFS(delays.length);
            let i = -1;

            const growingDelayCallback = () => {
                i += 1;

                return callWithDelay(() => vfs.onFrameRendered(), delays[i]);
            };

            return callNTimes(growingDelayCallback, delays.length).then(() => {
                const stats = vfs.calcStats();

                expect(Math.floor(stats.avgFrameInterval)).toBe(101);
                expect(stats.absAvgDev).toBe(9);
            });
        });
    });

    // This is used to detect when the application is hidden/ and the rendered callbacks are not fired.
    it('the stats are reset if the interval exceeds 1 second', () => {
        const vfs = new VFS(10);
        const callbackAfter100ms = () => callWithDelay(() => vfs.onFrameRendered(), 100);

        return callNTimes(callbackAfter100ms, 9)
            .then(() => callWithDelay(() => vfs.onFrameRendered(), 2000))
            .then(() => {
                expect(vfs.calcStats()).toBe(undefined);
            });
    });
    describe('the sample counter', () => {
        let vfs;
        const n = 10;

        beforeEach(() => {
            vfs = new VFS(n);
        });
        it('should make the VFS return undefined if less than N samples', () => {
            vfs.onFrameRendered();

            expect(vfs.calcStats()).toBe(undefined);

            callNTimes(() => vfs.onFrameRendered(), n - 1);

            expect(vfs.calcStats()).not.toBe(undefined);
        });
        it('should be set to 0 when reset', () => {
            callNTimes(() => vfs.onFrameRendered(), n / 2);

            expect(vfs.calcStats()).toBe(undefined);

            vfs.reset();

            callNTimes(() => vfs.onFrameRendered(), n / 2);

            expect(vfs.calcStats()).toBe(undefined);

            callNTimes(() => vfs.onFrameRendered(), n / 2);

            expect(vfs.calcStats()).not.toBe(undefined);
        });
    });
});
