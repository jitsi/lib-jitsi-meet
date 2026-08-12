import { VideoType } from '../../service/RTC/VideoType';

import JitsiLocalTrack from './JitsiLocalTrack';

/* eslint-disable require-jsdoc */

describe('JitsiLocalTrack camera control', () => {
    const getCapabilities = (JitsiLocalTrack.prototype as any).getCameraControlCapabilities;
    const getSettings = (JitsiLocalTrack.prototype as any).getCameraControlSettings;
    const setControl = (JitsiLocalTrack.prototype as any).setCameraControl;
    const getSourceTrack = (JitsiLocalTrack.prototype as any)._getCameraSourceTrack;

    // Builds a mock MediaStreamTrack with the given PTZ capabilities/settings.
    function mockTrack({ capabilities = {}, settings = {}, applyConstraints = () => Promise.resolve() }: any = {}) {
        return {
            applyConstraints: jasmine.createSpy('applyConstraints').and.callFake(applyConstraints),
            getCapabilities: () => capabilities,
            getSettings: () => settings
        };
    }

    // Builds the minimal `this` context the camera-control methods touch. When `effect` is true, `this.track` is the
    // effect output (no PTZ, like a virtual-background canvas capture) and the real camera lives in `_originalStream`.
    function context({ isVideo = true, videoType = VideoType.CAMERA, effect = false, ...trackOptions }: any = {}): any {
        const cameraTrack = mockTrack(trackOptions);

        if (effect) {
            return {
                _effectEnabled: true,
                _getCameraSourceTrack: getSourceTrack,
                _originalStream: { getVideoTracks: () => [ cameraTrack ] },
                isVideoTrack: () => isVideo,
                track: mockTrack({ /* canvas output: no PTZ caps/settings */ }),
                videoType
            };
        }

        return {
            _effectEnabled: false,
            _getCameraSourceTrack: getSourceTrack,
            isVideoTrack: () => isVideo,
            stream: { getVideoTracks: () => [ cameraTrack ] },
            track: cameraTrack,
            videoType
        };
    }

    describe('getCameraControlCapabilities', () => {
        it('returns the pan/tilt/zoom ranges reported by the track', () => {
            const ctx = context({
                capabilities: {
                    pan: { max: 100, min: -100, step: 1 },
                    tilt: { max: 50, min: -50, step: 2 },
                    zoom: { max: 4, min: 1, step: 0.1 }
                }
            });

            expect(getCapabilities.call(ctx)).toEqual({
                pan: { max: 100, min: -100, step: 1 },
                tilt: { max: 50, min: -50, step: 2 },
                zoom: { max: 4, min: 1, step: 0.1 }
            });
        });

        it('omits controls the camera does not expose and defaults a missing step to 1', () => {
            const ctx = context({ capabilities: { zoom: { max: 4, min: 1 } } });

            expect(getCapabilities.call(ctx)).toEqual({ zoom: { max: 4, min: 1, step: 1 } });
        });

        it('returns an empty object for a non-camera video track', () => {
            const ctx = context({ videoType: VideoType.DESKTOP, capabilities: { zoom: { max: 4, min: 1 } } });

            expect(getCapabilities.call(ctx)).toEqual({});
        });

        it('returns an empty object for an audio track', () => {
            const ctx = context({ isVideo: false });

            expect(getCapabilities.call(ctx)).toEqual({});
        });

        it('reads capabilities from the camera source, not the effect output, when an effect is active', () => {
            const ctx = context({ effect: true, capabilities: { zoom: { max: 4, min: 1, step: 1 } } });

            // this.track (canvas output) has no caps; the camera source in _originalStream does.
            expect(getCapabilities.call(ctx)).toEqual({ zoom: { max: 4, min: 1, step: 1 } });
        });
    });

    describe('getCameraControlSettings', () => {
        it('returns the current pan/tilt/zoom values', () => {
            const ctx = context({ settings: { pan: 10, tilt: -5, zoom: 2 } });

            expect(getSettings.call(ctx)).toEqual({ pan: 10, tilt: -5, zoom: 2 });
        });

        it('omits keys the track does not report', () => {
            const ctx = context({ settings: { zoom: 2 } });

            expect(getSettings.call(ctx)).toEqual({ zoom: 2 });
        });
    });

    describe('setCameraControl', () => {
        it('applies only the provided controls via advanced constraints without re-acquiring the stream', async () => {
            const ctx = context();

            await setControl.call(ctx, { pan: 10, zoom: 2 });

            expect(ctx.track.applyConstraints).toHaveBeenCalledWith({ advanced: [ { pan: 10, zoom: 2 } ] });
        });

        it('is a no-op when no numeric controls are provided', async () => {
            const ctx = context();

            await setControl.call(ctx, { pan: undefined } as any);

            expect(ctx.track.applyConstraints).not.toHaveBeenCalled();
        });

        it('rejects for a non-camera track', async () => {
            const ctx = context({ videoType: VideoType.DESKTOP });

            await expectAsync(setControl.call(ctx, { zoom: 2 })).toBeRejected();
            expect(ctx.track.applyConstraints).not.toHaveBeenCalled();
        });

        it('propagates a rejection from the underlying applyConstraints', async () => {
            const ctx = context({ applyConstraints: () => Promise.reject(new Error('out of range')) });

            await expectAsync(setControl.call(ctx, { zoom: 999 })).toBeRejectedWithError('out of range');
        });

        it('applies to the camera source, not the effect output, when an effect is active', async () => {
            const ctx = context({ effect: true });
            const cameraTrack = ctx._originalStream.getVideoTracks()[0];

            await setControl.call(ctx, { zoom: 2 });

            expect(cameraTrack.applyConstraints).toHaveBeenCalledWith({ advanced: [ { zoom: 2 } ] });
            expect(ctx.track.applyConstraints).not.toHaveBeenCalled();
        });
    });
});
