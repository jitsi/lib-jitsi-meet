import JitsiMediaDevices from './JitsiMediaDevices';
import { JitsiMediaDevicesEvents } from './JitsiMediaDevicesEvents';
import audioOutputManager from './modules/RTC/AudioOutputManager';
import RTC from './modules/RTC/RTC';
import { MediaPermissionState, PermissionDenialReason } from './service/RTC/MediaPermission';
import { MediaType } from './service/RTC/MediaType';
import { RTCEvents } from './service/RTC/RTCEvents';

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

    afterEach(() => {
        jasmine.clock().uninstall();
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

    it('keeps the user as the reason when the requests that follow a block at the prompt fail at once', async () => {
        apiState(MediaType.AUDIO, 'prompt', false);
        mediaDevices._onGumPermissionStatus({
            audio: { reason: PermissionDenialReason.USER, state: MediaPermissionState.DENIED }
        });
        apiState(MediaType.AUDIO, 'denied', true);
        mediaDevices._onGumPermissionStatus({
            audio: { reason: PermissionDenialReason.BROWSER, state: MediaPermissionState.DENIED }
        });

        expect(await mediaDevices.getPermissionStatus(MediaType.AUDIO)).toEqual({
            reason: PermissionDenialReason.USER,
            state: MediaPermissionState.DENIED
        });
    });

    it('reports a later block in the site settings as a block in the browser', async () => {
        mediaDevices._onGumPermissionStatus({
            video: { reason: PermissionDenialReason.OS, state: MediaPermissionState.DENIED }
        });
        apiState(MediaType.VIDEO, 'denied', true);

        expect(await mediaDevices.getPermissionStatus(MediaType.VIDEO)).toEqual({
            reason: PermissionDenialReason.BROWSER,
            state: MediaPermissionState.DENIED
        });

        // A prompt that the user closed long before isn't the answer either.
        jasmine.clock().install();
        jasmine.clock().mockDate(new Date(0));
        mediaDevices = new JitsiMediaDevices();
        apiState(MediaType.AUDIO, 'prompt', false);
        mediaDevices._onGumPermissionStatus({
            audio: { reason: PermissionDenialReason.USER, state: MediaPermissionState.DENIED }
        });
        jasmine.clock().tick(60000);
        apiState(MediaType.AUDIO, 'denied', true);

        expect(await mediaDevices.getPermissionStatus(MediaType.AUDIO)).toEqual({
            reason: PermissionDenialReason.BROWSER,
            state: MediaPermissionState.DENIED
        });
    });

    it('sends copies of the statuses', async () => {
        listener.and.callFake(statuses => {
            statuses.audio.state = 'changed by a listener';
        });
        apiState(MediaType.AUDIO, 'granted', false);

        expect(await mediaDevices.getPermissionStatus(MediaType.AUDIO)).toEqual({ state: MediaPermissionState.GRANTED });
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

describe('JitsiMediaDevices init', () => {
    let listeners: { [key: string]: Function; };
    let mediaDevices: any;
    let permissionStatuses: { [key: string]: any; };

    beforeEach(() => {
        listeners = {};
        spyOn(RTC, 'addListener').and.callFake((type: string, listener: Function) => {
            listeners[type] = listener;
        });
        permissionStatuses = {
            camera: { state: 'denied' },
            microphone: { state: 'prompt' }
        };
        spyOn(navigator.permissions, 'query')
            .and.callFake(({ name }) => Promise.resolve(permissionStatuses[name] as PermissionStatus));
        mediaDevices = new JitsiMediaDevices();
        spyOn(mediaDevices, 'enumerateDevices');
        mediaDevices.init();
    });

    it('reads the Permissions API states and follows their changes', async () => {
        expect(await mediaDevices.getPermissionStatus(MediaType.AUDIO)).toEqual({ state: MediaPermissionState.PROMPT });
        expect(await mediaDevices.getPermissionStatus(MediaType.VIDEO)).toEqual({
            reason: PermissionDenialReason.BROWSER,
            state: MediaPermissionState.DENIED
        });

        permissionStatuses.camera.state = 'granted';
        permissionStatuses.camera.onchange();

        expect(await mediaDevices.getPermissionStatus(MediaType.VIDEO)).toEqual({ state: MediaPermissionState.GRANTED });
    });

    it('keeps the user as the reason through jitsi-meet\'s retries after a block at the prompt', async () => {
        await mediaDevices.getPermissionStatus(MediaType.AUDIO);

        // The combined request, then a request for each device.
        listeners[RTCEvents.PERMISSIONS_CHANGED]({ audio: false }, {
            audio: { reason: PermissionDenialReason.USER, state: MediaPermissionState.DENIED }
        });
        permissionStatuses.microphone.state = 'denied';
        permissionStatuses.microphone.onchange();
        listeners[RTCEvents.PERMISSIONS_CHANGED]({ audio: false }, {
            audio: { reason: PermissionDenialReason.BROWSER, state: MediaPermissionState.DENIED }
        });

        expect(await mediaDevices.getPermissionStatus(MediaType.AUDIO)).toEqual({
            reason: PermissionDenialReason.USER,
            state: MediaPermissionState.DENIED
        });
    });
});
