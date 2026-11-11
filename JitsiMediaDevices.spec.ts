import JitsiMediaDevices from './JitsiMediaDevices';
import { JitsiMediaDevicesEvents } from './JitsiMediaDevicesEvents';
import audioOutputManager from './modules/RTC/AudioOutputManager';
import { MediaPermissionState, PermissionDenialReason } from './service/RTC/MediaPermission';
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

describe('JitsiMediaDevices permission status', () => {
    let mediaDevices: any;
    let listener: jasmine.Spy;

    const apiState = (type: MediaType, state: string, isChange: boolean) =>
        mediaDevices._onPermissionsApiState(type, { state }, isChange);

    beforeEach(() => {
        mediaDevices = new JitsiMediaDevices();
        listener = jasmine.createSpy('listener');
        mediaDevices.addListener(JitsiMediaDevicesEvents.PERMISSION_STATUS_CHANGED, listener);
    });

    it('reports the Permissions API state', async () => {
        apiState(MediaType.AUDIO, 'granted', false);
        apiState(MediaType.VIDEO, 'prompt', false);

        expect(await mediaDevices.getPermissionStatus(MediaType.AUDIO)).toEqual({ state: MediaPermissionState.GRANTED });
        expect(await mediaDevices.getPermissionStatus(MediaType.VIDEO)).toEqual({ state: MediaPermissionState.PROMPT });
        expect(listener).toHaveBeenCalledWith({
            audio: { state: MediaPermissionState.GRANTED },
            video: { state: MediaPermissionState.PROMPT }
        });
    });

    it('is unknown until the Permissions API or getUserMedia reports it', async () => {
        expect(await mediaDevices.getPermissionStatus(MediaType.AUDIO)).toBeUndefined();
    });

    it('treats a denied Permissions API state as a block in the browser', async () => {
        apiState(MediaType.VIDEO, 'denied', false);

        expect(await mediaDevices.getPermissionStatus(MediaType.VIDEO)).toEqual({
            reason: PermissionDenialReason.BROWSER,
            state: MediaPermissionState.DENIED
        });
    });

    it('stays prompt when the user closed the prompt without answering', async () => {
        apiState(MediaType.AUDIO, 'prompt', false);
        mediaDevices._onGumPermissionStatus({
            audio: { reason: PermissionDenialReason.USER, state: MediaPermissionState.DENIED }
        });

        expect(await mediaDevices.getPermissionStatus(MediaType.AUDIO)).toEqual({
            reason: PermissionDenialReason.USER,
            state: MediaPermissionState.PROMPT
        });
    });

    it('keeps the user as the reason when the user blocked at the prompt', async () => {
        apiState(MediaType.AUDIO, 'prompt', false);
        mediaDevices._onGumPermissionStatus({
            audio: { reason: PermissionDenialReason.USER, state: MediaPermissionState.DENIED }
        });
        apiState(MediaType.AUDIO, 'denied', true);

        expect(await mediaDevices.getPermissionStatus(MediaType.AUDIO)).toEqual({
            reason: PermissionDenialReason.USER,
            state: MediaPermissionState.DENIED
        });
    });

    it('reports an OS block over a granted Permissions API state until it changes', async () => {
        mediaDevices._onGumPermissionStatus({
            video: { reason: PermissionDenialReason.OS, state: MediaPermissionState.DENIED }
        });
        apiState(MediaType.VIDEO, 'granted', false);

        expect(await mediaDevices.getPermissionStatus(MediaType.VIDEO)).toEqual({
            reason: PermissionDenialReason.OS,
            state: MediaPermissionState.DENIED
        });

        mediaDevices._onGumPermissionStatus({ video: { state: MediaPermissionState.GRANTED } });

        expect(await mediaDevices.getPermissionStatus(MediaType.VIDEO)).toEqual({ state: MediaPermissionState.GRANTED });
    });

    it('emits only when a status changes', () => {
        apiState(MediaType.AUDIO, 'granted', false);
        mediaDevices._onGumPermissionStatus({ audio: { state: MediaPermissionState.GRANTED } });

        expect(listener).toHaveBeenCalledTimes(1);
    });
});
