import * as JitsiTrackErrors from '../../JitsiTrackErrors';
import { MediaPermissionState, PermissionDenialReason } from '../../service/RTC/MediaPermission';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import RTCStats from '../RTCStats/RTCStats';
import { RTCStatsEvents } from '../RTCStats/RTCStatsEvents';
import browser from '../browser';

import audioOutputManager from './AudioOutputManager';
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

    describe('with the audio output manager', () => {
        beforeEach(() => {
            spyOnProperty(audioOutputManager, 'enabled').and.returnValue(true);
            spyOn(RTCUtils, 'isDeviceChangeAvailable').and.returnValue(true);
        });

        it('leaves the audio output to the manager', async () => {
            const el = {} as HTMLMediaElement;
            const stream = {} as MediaStream;
            const track = {};
            const attach = spyOn(audioOutputManager, 'attach').and.returnValue(Promise.resolve());
            const setDevice = spyOn(audioOutputManager, 'setDevice').and.returnValue(Promise.resolve([]));

            spyOn(audioOutputManager, 'getDevice').and.returnValue('speaker-2');

            await RTCUtils.attachMediaStream(el, stream, track);
            expect(el.srcObject).toBe(stream);
            expect(attach).toHaveBeenCalledOnceWith(el, stream, track);

            expect(await RTCUtils.setAudioOutputDevice('speaker-2')).toEqual([]);
            expect(setDevice).toHaveBeenCalledOnceWith('speaker-2');
            expect(RTCUtils.getAudioOutputDevice()).toBe('speaker-2');
        });

        it('passes device list changes to the manager only while the audio output can be changed', () => {
            const onDeviceListChanged = spyOn(audioOutputManager, 'onDeviceListChanged');
            const devices = [ { deviceId: 'speaker-2', kind: 'audiooutput' } ] as MediaDeviceInfo[];

            (RTCUtils as any)._onDeviceListChangedForAudioOutput(devices);
            expect(onDeviceListChanged).toHaveBeenCalledOnceWith(devices);

            (RTCUtils.isDeviceChangeAvailable as jasmine.Spy).and.returnValue(false);
            (RTCUtils as any)._onDeviceListChangedForAudioOutput(devices);
            expect(onDeviceListChanged).toHaveBeenCalledTimes(1);
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

        afterEach(() => {
            jasmine.clock().uninstall();
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
        });

        it('stops the tracks of a stream that getUserMedia returns after the timeout fired', async () => {
            jasmine.clock().install();

            let resolveGum: ((stream: unknown) => void) | undefined;
            const track = jasmine.createSpyObj('MediaStreamTrack', [ 'stop' ]);
            const lateStream = {
                getAudioTracks: () => [ track ],
                getTracks: () => [ track ],
                getVideoTracks: () => []
            };

            getUserMediaSpy.and.returnValue(new Promise(resolve => {
                resolveGum = resolve;
            }));

            const gumPromise = (RTCUtils as any)._getUserMedia([ 'audio' ], {}, 100);

            jasmine.clock().tick(150);
            await expectAsync(gumPromise).toBeRejected();

            resolveGum?.(lateStream);
            await Promise.resolve();
            await Promise.resolve();

            expect(track.stop).toHaveBeenCalledTimes(1);
        });

        it('does not stop the tracks of a stream that getUserMedia returns before the timeout', async () => {
            const track = jasmine.createSpyObj('MediaStreamTrack', [ 'stop' ]);
            const stream = {
                getAudioTracks: () => [ track ],
                getTracks: () => [ track ],
                getVideoTracks: () => []
            };

            getUserMediaSpy.and.returnValue(Promise.resolve(stream));

            await expectAsync((RTCUtils as any)._getUserMedia([ 'audio' ], {}, 100)).toBeResolvedTo(stream);

            expect(track.stop).not.toHaveBeenCalled();
        });

        describe('permission denial reason', () => {
            let addedEnumerateDevices: boolean;
            let emitSpy: jasmine.Spy;
            let permissionStates: { [key: string]: string; };

            const denial = (message: string, name = 'NotAllowedError') => Object.assign(new Error(message), { name });
            const statuses = () => emitSpy.calls.all().find(call => call.args[0] === RTCEvents.PERMISSIONS_CHANGED)
                ?.args[2];

            beforeEach(() => {
                emitSpy = spyOn((RTCUtils as any).eventEmitter, 'emit').and.callThrough();
                addedEnumerateDevices = !navigator.mediaDevices.enumerateDevices;
                if (addedEnumerateDevices) {
                    (navigator.mediaDevices as any).enumerateDevices = () => Promise.resolve([]);
                }
                permissionStates = {
                    camera: 'prompt',
                    microphone: 'prompt'
                };
                spyOn(navigator.permissions, 'query')
                    .and.callFake(({ name }) => Promise.resolve({ state: permissionStates[name] } as PermissionStatus));
            });

            afterEach(() => {
                addedEnumerateDevices && delete (navigator.mediaDevices as any).enumerateDevices;
            });

            it('reports an OS block', async () => {
                getUserMediaSpy.and.returnValue(Promise.reject(denial('Permission denied by system')));

                const error = await (RTCUtils as any)._getUserMedia([ 'audio', 'video' ], {}).catch(e => e);

                expect(error.name).toBe(JitsiTrackErrors.PERMISSION_DENIED);
                expect(error.reason).toBe(PermissionDenialReason.OS);
                expect(emitSpy).toHaveBeenCalledWith(
                    RTCEvents.PERMISSIONS_CHANGED,
                    { audio: false, video: false },
                    {
                        audio: { reason: PermissionDenialReason.OS, state: MediaPermissionState.DENIED },
                        video: { reason: PermissionDenialReason.OS, state: MediaPermissionState.DENIED }
                    });
            });

            it('reports a block in the browser when the denial comes without a prompt', async () => {
                getUserMediaSpy.and.returnValue(Promise.reject(denial('Permission denied')));

                const error = await (RTCUtils as any)._getUserMedia([ 'video' ], {}).catch(e => e);

                expect(error.reason).toBe(PermissionDenialReason.BROWSER);
            });

            it('reports a denial by the user when the prompt was answered', async () => {
                jasmine.clock().install();
                jasmine.clock().mockDate(new Date(0));

                let rejectGum: ((reason: unknown) => void) | undefined;

                getUserMediaSpy.and.returnValue(new Promise((_resolve, reject) => {
                    rejectGum = reject;
                }));

                const gumPromise = (RTCUtils as any)._getUserMedia([ 'audio' ], {}).catch(e => e);

                jasmine.clock().tick(2000);
                rejectGum?.(denial('Permission dismissed'));

                expect((await gumPromise).reason).toBe(PermissionDenialReason.USER);
            });

            it('reports a block in the site settings however late the denial comes', async () => {
                jasmine.clock().install();
                jasmine.clock().mockDate(new Date(0));
                permissionStates.camera = 'denied';

                let rejectGum: ((reason: unknown) => void) | undefined;

                getUserMediaSpy.and.returnValue(new Promise((_resolve, reject) => {
                    rejectGum = reject;
                }));

                const gumPromise = (RTCUtils as any)._getUserMedia([ 'video' ], {}).catch(e => e);

                // E.g. a long task during the startup delays the rejection.
                jasmine.clock().tick(1000);
                rejectGum?.(denial('Permission denied'));

                expect((await gumPromise).reason).toBe(PermissionDenialReason.BROWSER);
            });

            it('reports a denial of a device the site allows as an OS block', async () => {
                permissionStates.camera = 'granted';
                getUserMediaSpy.and.returnValue(Promise.reject(denial('Permission denied')));

                const error = await (RTCUtils as any)._getUserMedia([ 'video' ], {}).catch(e => e);

                expect(error.reason).toBe(PermissionDenialReason.OS);
            });

            it('reports a device that the permissions policy blocks', async () => {
                permissionStates.camera = 'granted';
                permissionStates.microphone = 'granted';
                spyOn(document.featurePolicy, 'allowsFeature').and.callFake(feature => feature !== 'camera');
                getUserMediaSpy.and.returnValue(Promise.reject(denial('Permission denied')));

                const error = await (RTCUtils as any)._getUserMedia([ 'audio', 'video' ], {}).catch(e => e);

                expect(error.reason).toBe(PermissionDenialReason.POLICY);
                expect(statuses()).toEqual({
                    video: { reason: PermissionDenialReason.POLICY, state: MediaPermissionState.DENIED }
                });
            });

            it('leaves a device that the site allows out of a block in the site settings', async () => {
                permissionStates.camera = 'denied';
                permissionStates.microphone = 'granted';
                getUserMediaSpy.and.returnValue(Promise.reject(denial('Permission denied')));

                const error = await (RTCUtils as any)._getUserMedia([ 'audio', 'video' ], {}).catch(e => e);

                expect(error.reason).toBe(PermissionDenialReason.BROWSER);
                expect(statuses()).toEqual({
                    video: { reason: PermissionDenialReason.BROWSER, state: MediaPermissionState.DENIED }
                });
            });

            it('falls back to the timing without the Permissions API', async () => {
                (navigator.permissions.query as jasmine.Spy).and.returnValue(Promise.reject(new TypeError()));
                getUserMediaSpy.and.returnValue(Promise.reject(denial('Permission denied')));

                const error = await (RTCUtils as any)._getUserMedia([ 'audio', 'video' ], {}).catch(e => e);

                expect(error.reason).toBe(PermissionDenialReason.BROWSER);
                expect(statuses()).toEqual({
                    audio: { reason: PermissionDenialReason.BROWSER, state: MediaPermissionState.DENIED },
                    video: { reason: PermissionDenialReason.BROWSER, state: MediaPermissionState.DENIED }
                });
            });

            it('reports a device that Firefox on macOS can\'t open as blocked by the OS', async () => {
                spyOn(browser, 'isFirefox').and.returnValue(true);
                spyOn(browser, 'isMacOS').and.returnValue(true);
                spyOn(navigator.mediaDevices, 'enumerateDevices')
                    .and.resolveTo([ { kind: 'videoinput' } as MediaDeviceInfo ]);
                getUserMediaSpy.and.returnValue(Promise.reject(denial('The object can not be found here.', 'NotFoundError')));

                const error = await (RTCUtils as any)._getUserMedia([ 'video' ], {}).catch(e => e);

                expect(error.name).toBe(JitsiTrackErrors.PERMISSION_DENIED);
                expect(error.reason).toBe(PermissionDenialReason.OS);
            });

            it('keeps a missing device as not found on Firefox', async () => {
                spyOn(browser, 'isFirefox').and.returnValue(true);
                spyOn(browser, 'isMacOS').and.returnValue(true);
                spyOn(navigator.mediaDevices, 'enumerateDevices')
                    .and.resolveTo([ { kind: 'audioinput' } as MediaDeviceInfo ]);
                getUserMediaSpy.and.returnValue(Promise.reject(denial('The object can not be found here.', 'NotFoundError')));

                const error = await (RTCUtils as any)._getUserMedia([ 'video' ], {}).catch(e => e);

                expect(error.name).toBe(JitsiTrackErrors.NOT_FOUND);
                expect(error.reason).toBeUndefined();
            });

            it('keeps the device as not found on Firefox when the device list doesn\'t come', async () => {
                spyOn(browser, 'isFirefox').and.returnValue(true);
                spyOn(browser, 'isMacOS').and.returnValue(true);
                spyOn(navigator.mediaDevices, 'enumerateDevices').and.returnValue(new Promise(() => undefined));
                getUserMediaSpy.and.returnValue(Promise.reject(denial('The object can not be found here.', 'NotFoundError')));

                const error = await (RTCUtils as any)._getUserMedia([ 'video' ], {}).catch(e => e);

                expect(error.name).toBe(JitsiTrackErrors.NOT_FOUND);
            });

            it('reports the granted devices on success', async () => {
                getUserMediaSpy.and.returnValue(Promise.resolve({
                    getAudioTracks: () => [ {} ],
                    getVideoTracks: () => []
                }));

                await (RTCUtils as any)._getUserMedia([ 'audio' ], {});

                expect(emitSpy).toHaveBeenCalledWith(
                    RTCEvents.PERMISSIONS_CHANGED,
                    { audio: true },
                    { audio: { state: MediaPermissionState.GRANTED } });
            });
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
