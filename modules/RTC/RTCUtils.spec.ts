import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import RTCStats from '../RTCStats/RTCStats';
import { RTCStatsEvents } from '../RTCStats/RTCStatsEvents';

import RTCUtils from './RTCUtils';

describe('RTCUtils', () => {
    describe('reloadMediaElement', () => {
        const stream = {} as MediaStream;
        const aborted = new DOMException('aborted', 'AbortError');

        function element(paused: boolean) {
            return {
                id: 'remoteAudio_remote-audio-1',
                paused,
                play: jasmine.createSpy('play').and.returnValue(Promise.resolve()),
                srcObject: stream
            } as unknown as HTMLMediaElement;
        }

        it('reassigns the stream and resumes playback', () => {
            const el = element(false);
            const assigned: Array<MediaStream | null> = [];

            Object.defineProperty(el, 'srcObject', {
                get: () => assigned.length ? assigned[assigned.length - 1] : stream,
                set: value => assigned.push(value)
            });

            RTCUtils.reloadMediaElement(el, stream, aborted);

            expect(assigned).toEqual([ null, stream ]);
            expect(el.play).toHaveBeenCalled();
        });

        it('does not start playback of a paused element', () => {
            const el = element(true);

            RTCUtils.reloadMediaElement(el, stream, aborted);

            expect(el.srcObject).toBe(stream);
            expect(el.play).not.toHaveBeenCalled();
        });

        it('leaves an element that was given another stream alone', () => {
            const el = element(false);
            const other = {} as MediaStream;

            el.srcObject = other;
            RTCUtils.reloadMediaElement(el, stream, aborted);

            expect(el.srcObject).toBe(other);
            expect(el.play).not.toHaveBeenCalled();
        });

        it('leaves an element alone when setSinkId rejected before switching', () => {
            const el = element(false);

            RTCUtils.reloadMediaElement(el, stream, new DOMException('gone', 'NotFoundError'));

            expect(el.play).not.toHaveBeenCalled();
        });
    });

    describe('audio output', () => {
        const stream = { getAudioTracks: () => [ {} ] } as unknown as MediaStream;
        let sinkError: Error | undefined;

        function element() {
            return {
                id: 'remoteAudio_remote-audio-1',
                paused: true,
                setSinkId: jasmine.createSpy('setSinkId')
                    .and.callFake(() => sinkError ? Promise.reject(sinkError) : Promise.resolve()),
                srcObject: null
            } as unknown as HTMLMediaElement;
        }

        beforeEach(() => {
            sinkError = undefined;
            spyOn(RTCUtils, 'isDeviceChangeAvailable').and.returnValue(true);
            spyOn(HTMLMediaElement.prototype, 'setSinkId').and.returnValue(Promise.resolve());
        });

        afterEach(async () => {
            await RTCUtils.setAudioOutputDevice('default');
            (RTCUtils as any)._updateKnownDevices([]);
        });

        it('does not switch a new element to the default output', async () => {
            const el = element();

            await RTCUtils.attachMediaStream(el, stream);

            expect(el.srcObject).toBe(stream);
            expect(el.setSinkId).not.toHaveBeenCalled();
        });

        it('applies a selected output and rejects after reloading the element when it fails', async () => {
            await RTCUtils.setAudioOutputDevice('speaker-2');

            const el = element();

            await RTCUtils.attachMediaStream(el, stream);
            expect(el.setSinkId).toHaveBeenCalledWith('speaker-2');

            sinkError = new DOMException('aborted', 'AbortError');
            const failing = element();
            const reload = spyOn(RTCUtils, 'reloadMediaElement');

            await expectAsync(RTCUtils.attachMediaStream(failing, stream)).toBeRejectedWith(sinkError);
            expect(reload).toHaveBeenCalledWith(failing, stream, sinkError);
        });

        it('moves a reused element that is on another output back to the default', async () => {
            const el = Object.assign(element(), { sinkId: 'speaker-2' });

            await RTCUtils.attachMediaStream(el, stream);

            expect(el.setSinkId).toHaveBeenCalledWith('');
        });

        it('passes the default output as \'\' even where a device is enumerated as \'default\'', () => {
            (RTCUtils as any)._updateKnownDevices([ { deviceId: 'default', kind: 'audiooutput' } ]);

            expect(RTCUtils.toSinkId('default')).toBe('');
            expect(RTCUtils.toSinkId('')).toBe('');
            expect(RTCUtils.toSinkId('speaker-2')).toBe('speaker-2');
        });
    });

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
