import JitsiMediaDevices from './JitsiMediaDevices';
import audioOutputManager from './modules/RTC/AudioOutputManager';
import { MediaType } from './service/RTC/MediaType';

describe('JitsiMediaDevices', () => {
    it('reports whether the audio output manager is enabled', () => {
        const mediaDevices = new JitsiMediaDevices();
        const enabled = spyOnProperty(audioOutputManager, 'enabled').and.returnValue(false);

        expect(mediaDevices.isAudioOutputManagerEnabled()).toBe(false);
        enabled.and.returnValue(true);
        expect(mediaDevices.isAudioOutputManagerEnabled()).toBe(true);
    });

    describe('isDevicePermissionGranted', () => {
        let mediaDevices: JitsiMediaDevices;

        beforeEach(() => {
            mediaDevices = new JitsiMediaDevices();
            spyOn(mediaDevices, 'enumerateDevices');
        });

        function cachePermissions(permissions: { [key: string]: boolean; }): void {
            (mediaDevices as any)._handlePermissionsChange(permissions);
        }

        it('resolves true without a type when audio and video are cached as granted', async () => {
            cachePermissions({ [MediaType.AUDIO]: true, [MediaType.VIDEO]: true });

            await expectAsync(mediaDevices.isDevicePermissionGranted()).toBeResolvedTo(true);
        });

        it('resolves false without a type when one of audio and video is cached as denied', async () => {
            cachePermissions({ [MediaType.AUDIO]: true, [MediaType.VIDEO]: false });

            await expectAsync(mediaDevices.isDevicePermissionGranted()).toBeResolvedTo(false);
        });

        it('queries the Permissions API without a type when only one of audio and video is cached', async () => {
            cachePermissions({ [MediaType.AUDIO]: true });
            (mediaDevices as any)._permissionsApiSupported = Promise.resolve(true);
            const query = spyOn(navigator.permissions, 'query')
                .and.returnValue(Promise.resolve({ state: 'granted' } as PermissionStatus));

            await expectAsync(mediaDevices.isDevicePermissionGranted()).toBeResolvedTo(true);

            expect(query).toHaveBeenCalledWith({ name: 'camera' as PermissionName });
            expect(query).toHaveBeenCalledWith({ name: 'microphone' as PermissionName });
        });
    });
});
