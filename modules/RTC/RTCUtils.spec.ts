import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import RTCStats from '../RTCStats/RTCStats';
import { RTCStatsEvents } from '../RTCStats/RTCStatsEvents';

import RTCUtils from './RTCUtils';

describe('RTCUtils', () => {
    describe('_getUserMedia', () => {
        let rtcStatsSpy: jasmine.Spy;
        let getUserMediaSpy: jasmine.Spy;

        beforeEach(() => {
            rtcStatsSpy = spyOn(RTCStats, 'sendStatsEntry');

            if (!navigator.mediaDevices) {
                (navigator as any).mediaDevices = {};
            }
            if (!navigator.mediaDevices.getUserMedia) {
                (navigator.mediaDevices as any).getUserMedia = () => Promise.resolve();
            }
            getUserMediaSpy = spyOn(navigator.mediaDevices, 'getUserMedia');
        });

        it('emits GET_USER_MEDIA_ERROR_EVENT when getUserMedia rejects', async () => {
            const error = Object.assign(new Error('Permission denied by user'), {
                name: 'NotAllowedError'
            });

            getUserMediaSpy.and.returnValue(Promise.reject(error));

            await expectAsync((RTCUtils as any)._getUserMedia([ 'audio', 'video' ], {})).toBeRejected();

            expect(rtcStatsSpy).toHaveBeenCalledWith(
                RTCStatsEvents.GET_USER_MEDIA_ERROR_EVENT,
                null,
                {
                    constraint: undefined,
                    devices: [ 'audio', 'video' ],
                    message: 'Permission denied by user',
                    name: 'NotAllowedError'
                });
        });

        it('includes the failed constraint name when getUserMedia rejects with OverconstrainedError', async () => {
            const error = Object.assign(new Error('Cannot satisfy constraints'), {
                constraint: 'width',
                name: 'OverconstrainedError'
            });

            getUserMediaSpy.and.returnValue(Promise.reject(error));

            await expectAsync((RTCUtils as any)._getUserMedia([ 'video' ], {})).toBeRejected();

            expect(rtcStatsSpy).toHaveBeenCalledWith(
                RTCStatsEvents.GET_USER_MEDIA_ERROR_EVENT,
                null,
                {
                    constraint: 'width',
                    devices: [ 'video' ],
                    message: 'Cannot satisfy constraints',
                    name: 'OverconstrainedError'
                });
        });

        it('emits GET_USER_MEDIA_ERROR_EVENT when the gUM call times out', async () => {
            jasmine.clock().install();

            // The native getUserMedia never resolves so the timeout fires.
            getUserMediaSpy.and.returnValue(new Promise(() => { /* never resolves */ }));

            const gumPromise = (RTCUtils as any)._getUserMedia([ 'audio' ], {}, 100);

            jasmine.clock().tick(150);

            await expectAsync(gumPromise).toBeRejected();

            expect(rtcStatsSpy).toHaveBeenCalledWith(
                RTCStatsEvents.GET_USER_MEDIA_ERROR_EVENT,
                null,
                jasmine.objectContaining({
                    devices: [ 'audio' ],
                    name: JitsiTrackErrors.TIMEOUT
                }));

            jasmine.clock().uninstall();
        });

        it('emits the error event only once when timeout fires before gUM rejects', async () => {
            jasmine.clock().install();

            let rejectGum: ((reason: unknown) => void) | undefined;

            getUserMediaSpy.and.returnValue(new Promise((_resolve, reject) => {
                rejectGum = reject;
            }));

            const gumPromise = (RTCUtils as any)._getUserMedia([ 'audio' ], {}, 100);

            // Trigger the timeout — emits once.
            jasmine.clock().tick(150);
            await expectAsync(gumPromise).toBeRejected();

            expect(rtcStatsSpy).toHaveBeenCalledTimes(1);

            // Now have the underlying gUM reject after the fact — must not emit a second event.
            rejectGum?.(Object.assign(new Error('Late rejection'), { name: 'NotAllowedError' }));
            await Promise.resolve();
            await Promise.resolve();

            expect(rtcStatsSpy).toHaveBeenCalledTimes(1);

            jasmine.clock().uninstall();
        });

        it('does not emit GET_USER_MEDIA_ERROR_EVENT when getUserMedia succeeds', async () => {
            const fakeStream = {
                getAudioTracks: () => [],
                getVideoTracks: () => []
            };

            getUserMediaSpy.and.returnValue(Promise.resolve(fakeStream));

            await (RTCUtils as any)._getUserMedia([ 'audio' ], {});

            expect(rtcStatsSpy).not.toHaveBeenCalledWith(
                RTCStatsEvents.GET_USER_MEDIA_ERROR_EVENT,
                jasmine.anything(),
                jasmine.anything());
        });
    });
});
