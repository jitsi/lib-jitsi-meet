import { MediaType } from '../../service/RTC/MediaType';

import JitsiLocalTrack, { IStreamEffect } from './JitsiLocalTrack';

describe('JitsiLocalTrack', () => {
    const MIC_ID = 'mic-1';
    const MIC_LABEL = 'Scarlett 2i2 USB';

    function fakeTrack(label: string): any {
        return {
            enabled: true,
            getConstraints: () => ({}),
            getSettings: () => ({}),
            kind: 'audio',
            label,
            readyState: 'live'
        };
    }

    function fakeStream(track: MediaStreamTrack): MediaStream {
        return {
            getAudioTracks: () => [ track ],
            getTracks: () => [ track ],
            getVideoTracks: () => []
        } as unknown as MediaStream;
    }

    function micDevices(): MediaDeviceInfo[] {
        return [
            { deviceId: MIC_ID, kind: 'audioinput', label: MIC_LABEL } as MediaDeviceInfo,
            { deviceId: 'other', kind: 'audioinput', label: 'Other mic' } as MediaDeviceInfo
        ];
    }

    function createTrack(effects: IStreamEffect[] = [], deviceId = MIC_ID, label = MIC_LABEL)
            : { localTrack: any; micTrack: any; } {
        const micTrack = fakeTrack(label);
        const localTrack: any = new JitsiLocalTrack({
            constraints: {},
            deviceId,
            effects,
            mediaType: MediaType.AUDIO,
            rtcId: 1,
            stream: fakeStream(micTrack),
            track: micTrack
        });

        return { localTrack, micTrack };
    }

    function mixerEffect(mixedTrack: MediaStreamTrack): IStreamEffect {
        return {
            isEnabled: () => true,
            isMuted: () => false,
            setMuted: () => undefined,
            startEffect: () => fakeStream(mixedTrack),
            stopEffect: () => undefined
        } as unknown as IStreamEffect;
    }

    describe('device list change', () => {
        it('keeps the device of a track with an active stream effect', () => {
            const { localTrack } = createTrack([ mixerEffect(fakeTrack('MediaStreamAudioDestinationNode')) ]);

            localTrack._onDeviceListWillChange(micDevices());

            // getDeviceId() falls back to the gUM device id, so check the matched one directly.
            expect(localTrack._realDeviceId).toBe(MIC_ID);
            expect(localTrack.isEnded()).toBeFalse();
        });

        it('follows a changed default device of a track with an active stream effect', () => {
            // The track keeps its 'Default - A' label, while the list now shows B as default and A under its own id.
            const { localTrack } = createTrack(
                [ mixerEffect(fakeTrack('MediaStreamAudioDestinationNode')) ], 'default', `Default - ${MIC_LABEL}`);

            localTrack._onDeviceListWillChange([
                { deviceId: 'default', kind: 'audioinput', label: 'Default - Other mic' } as MediaDeviceInfo,
                ...micDevices()
            ]);

            expect(localTrack._realDeviceId).toBe(MIC_ID);
            expect(localTrack.isEnded()).toBeFalse();
        });

        it('marks a track with an active stream effect as ended when its device is removed', () => {
            const { localTrack } = createTrack([ mixerEffect(fakeTrack('MediaStreamAudioDestinationNode')) ]);

            localTrack._onDeviceListWillChange(micDevices().filter(d => d.deviceId !== MIC_ID));

            expect(localTrack.isEnded()).toBeTrue();
        });

        it('marks a track without a stream effect as ended when its device is removed', () => {
            const { localTrack } = createTrack();

            localTrack._onDeviceListWillChange(micDevices());
            expect(localTrack.isEnded()).toBeFalse();

            localTrack._onDeviceListWillChange(micDevices().filter(d => d.deviceId !== MIC_ID));
            expect(localTrack.isEnded()).toBeTrue();
        });
    });

    describe('isEnded', () => {
        it('reports the device track ending while a stream effect is active', () => {
            const { localTrack, micTrack } = createTrack([ mixerEffect(fakeTrack('MediaStreamAudioDestinationNode')) ]);

            micTrack.readyState = 'ended';

            expect(localTrack.isEnded()).toBeTrue();
        });
    });
});
