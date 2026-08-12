import { VideoType } from '../../service/RTC/VideoType';

import JitsiLocalTrack from './JitsiLocalTrack';

/* eslint-disable require-jsdoc */

describe('JitsiLocalTrack camera control', () => {
    const getCapabilities = (JitsiLocalTrack.prototype as any).getCameraControlCapabilities;
    const getSettings = (JitsiLocalTrack.prototype as any).getCameraControlSettings;
    const setControl = (JitsiLocalTrack.prototype as any).setCameraControl;

    // Builds the minimal `this` context the camera-control methods touch.
    function context({
        isVideo = true,
        videoType = VideoType.CAMERA,
        capabilities = {},
        settings = {},
        applyConstraints = () => Promise.resolve()
    }: any = {}): any {
        return {
            isVideoTrack: () => isVideo,
            track: {
                applyConstraints: jasmine.createSpy('applyConstraints').and.callFake(applyConstraints),
                getCapabilities: () => capabilities,
                getSettings: () => settings
            },
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
    });
});
