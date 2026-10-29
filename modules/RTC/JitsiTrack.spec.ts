import { JitsiTrackEvents } from '../../JitsiTrackEvents';

import JitsiTrack from './JitsiTrack';
import RTCUtils from './RTCUtils';

describe('JitsiTrack audio output', () => {
    const error = new DOMException('aborted', 'AbortError');

    function track(containers: object[] = [], audio = true): any {
        return {
            _attachTTFMTracker: jasmine.createSpy('_attachTTFMTracker'),
            _onTrackAttach: jasmine.createSpy('_onTrackAttach'),
            containers,
            emit: jasmine.createSpy('emit'),
            isAudioTrack: () => audio,
            isVideoTrack: () => !audio,
            stream: {}
        };
    }

    it('attach rejects, reports a failed output switch and does not add a container twice', async () => {
        const t = track();
        const el = {};

        spyOn(RTCUtils, 'attachMediaStream').and.callFake(() => Promise.reject(error));

        await expectAsync(JitsiTrack.prototype.attach.call(t, el)).toBeRejectedWith(error);
        await expectAsync(JitsiTrack.prototype.attach.call(t, el)).toBeRejectedWith(error);

        expect(t.containers).toEqual([ el ]);
        expect(t.emit).toHaveBeenCalledWith(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_FAILED, error);
    });

    it('attach of a video track does not report an audio output failure', async () => {
        const t = track([], false);

        spyOn(RTCUtils, 'attachMediaStream').and.callFake(() => Promise.reject(error));

        await expectAsync(JitsiTrack.prototype.attach.call(t, {})).toBeRejectedWith(error);

        expect(t.emit).not.toHaveBeenCalled();
    });

    it('setAudioOutput reports both the elements that switched and the ones that failed', async () => {
        const switched = { sinkId: 'speaker-2', setSinkId: jasmine.createSpy('setSinkId') };
        const t = track([
            { setSinkId: () => Promise.resolve() },
            { setSinkId: () => Promise.reject(error) },
            switched
        ]);

        spyOn(RTCUtils, 'isDeviceChangeAvailable').and.returnValue(true);
        spyOn(RTCUtils, 'reloadMediaElement');

        await JitsiTrack.prototype.setAudioOutput.call(t, 'speaker-2');

        expect(t.emit).toHaveBeenCalledWith(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED, 'speaker-2');
        expect(t.emit).toHaveBeenCalledWith(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_FAILED, error);
        expect(RTCUtils.reloadMediaElement).toHaveBeenCalledTimes(1);
        expect(switched.setSinkId).not.toHaveBeenCalled();
    });
});
