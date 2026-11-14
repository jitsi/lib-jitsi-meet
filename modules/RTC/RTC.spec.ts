import RTC from './RTC';
import RTCUtils from './RTCUtils';

describe('RTC', () => {
    describe('_onDeviceListChanged', () => {
        const mic = { deviceId: 'mic-1', groupId: 'g1', kind: 'audioinput', label: 'Mic' };
        const speaker = { deviceId: 'default', groupId: 'g1', kind: 'audiooutput', label: 'Default - Speakers' };

        it('re-applies the audio output only when the audio outputs change', () => {
            const rtc: any = { _updateAudioOutputForAudioTracks: jasmine.createSpy('update') };
            const onDeviceListChanged = (RTC.prototype as any)._onDeviceListChanged.bind(rtc);

            onDeviceListChanged([ mic, speaker ]);
            expect(rtc._updateAudioOutputForAudioTracks).toHaveBeenCalledTimes(1);

            onDeviceListChanged([ { ...mic, deviceId: 'mic-2' }, speaker ]);
            expect(rtc._updateAudioOutputForAudioTracks).toHaveBeenCalledTimes(1);

            // The OS default output switched.
            onDeviceListChanged([ mic, { ...speaker, groupId: 'g2', label: 'Default - Headset' } ]);
            expect(rtc._updateAudioOutputForAudioTracks).toHaveBeenCalledTimes(2);
        });

        it('does not re-apply a selected output that was unplugged', () => {
            const rtc: any = { _updateAudioOutputForAudioTracks: jasmine.createSpy('update') };

            spyOn(RTCUtils, 'getAudioOutputDevice').and.returnValue('speaker-2');
            (RTC.prototype as any)._onDeviceListChanged.call(rtc, [ mic, speaker ]);

            expect(rtc._updateAudioOutputForAudioTracks).not.toHaveBeenCalled();
        });
    });
});
