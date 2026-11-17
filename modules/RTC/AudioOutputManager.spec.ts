import { JitsiTrackEvents } from '../../JitsiTrackEvents';

import { AudioOutputManager } from './AudioOutputManager';
import JitsiTrack from './JitsiTrack';

describe('AudioOutputManager', () => {
    const audio = { getAudioTracks: () => [ {} ] } as unknown as MediaStream;
    const video = { getAudioTracks: () => [] } as unknown as MediaStream;
    const aborted = () => new DOMException('aborted', 'AbortError');
    const tick = () => new Promise(resolve => setTimeout(resolve));
    let manager: AudioOutputManager;
    let probe: jasmine.Spy;

    function element(id: string, setSinkId?: (sinkId: string) => Promise<void>): any {
        const el: any = {
            id,
            paused: true,
            play: jasmine.createSpy('play').and.returnValue(Promise.resolve()),
            sinkId: '',
            srcObject: null
        };

        el.setSinkId = jasmine.createSpy('setSinkId').and.callFake((sinkId: string) =>
            (setSinkId?.(sinkId) ?? Promise.resolve()).then(() => {
                el.sinkId = sinkId;
            }));

        return el;
    }

    function track(): JitsiTrack {
        return { emit: jasmine.createSpy('emit') } as unknown as JitsiTrack;
    }

    function deferred() {
        let resolve: () => void = () => undefined;
        const promise = new Promise<void>(r => {
            resolve = r;
        });

        return { promise, resolve };
    }

    beforeEach(() => {
        manager = new AudioOutputManager();
        manager.enable({ switchTimeout: 50 });
        probe = spyOn(HTMLMediaElement.prototype, 'setSinkId').and.returnValue(Promise.resolve());
    });

    it('switches the elements that play audio until they are detached', async () => {
        const el = element('a');
        const videoEl = element('v');

        await manager.attach(el, audio, track());
        await manager.attach(videoEl, video);
        expect(el.setSinkId).not.toHaveBeenCalled();

        expect(await manager.setDevice('speaker-2')).toEqual([]);
        expect(el.setSinkId).toHaveBeenCalledOnceWith('speaker-2');
        expect(videoEl.setSinkId).not.toHaveBeenCalled();

        await manager.attach(el, null);
        await manager.setDevice('speaker-3');
        expect(el.setSinkId).toHaveBeenCalledTimes(1);
    });

    it('moves a reused element that is on another output back to the default', async () => {
        const el = Object.assign(element('a'), { sinkId: 'speaker-2' });

        await manager.attach(el, audio);

        expect(el.setSinkId).toHaveBeenCalledOnceWith('');
    });

    it('switches an element attached later to the selected device', async () => {
        const el = element('a');

        await manager.setDevice('speaker-2');
        await manager.attach(el, audio);

        expect(el.setSinkId).toHaveBeenCalledOnceWith('speaker-2');
        expect(manager.getDevice()).toBe('speaker-2');
    });

    it('resolves with the tracks that did not switch and reports each track', async () => {
        const error = aborted();
        const switched = track();
        const failing = track();

        await manager.attach(element('a'), audio, switched);
        await manager.attach(element('b', () => Promise.reject(error)), audio, failing);

        expect(await manager.setDevice('speaker-2')).toEqual([ failing ]);
        expect(manager.getDevice()).toBe('speaker-2');
        expect(switched.emit).toHaveBeenCalledWith(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED, 'speaker-2');
        expect(failing.emit).toHaveBeenCalledWith(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_FAILED, error);
    });

    it('rejects and keeps the previous device when no element could switch', async () => {
        const error = aborted();

        await manager.attach(element('a', () => Promise.reject(error)), audio, track());

        await expectAsync(manager.setDevice('speaker-2')).toBeRejectedWith(error);
        expect(manager.getDevice()).toBe('default');
    });

    it('rejects without switching any element when the device cannot be used', async () => {
        const error = new DOMException('not found', 'NotFoundError');
        const el = element('a');

        probe.and.returnValue(Promise.reject(error));
        await manager.attach(el, audio);

        await expectAsync(manager.setDevice('speaker-2')).toBeRejectedWith(error);
        expect(el.setSinkId).not.toHaveBeenCalled();
        expect(manager.getDevice()).toBe('default');
    });

    it('counts a switch that does not settle within the switch timeout as failed', async () => {
        const hanging = track();

        await manager.attach(element('a'), audio, track());
        await manager.attach(element('b', () => new Promise(() => undefined)), audio, hanging);

        expect(await manager.setDevice('speaker-2')).toEqual([ hanging ]);
        expect(hanging.emit).toHaveBeenCalledWith(
            JitsiTrackEvents.TRACK_AUDIO_OUTPUT_FAILED, jasmine.objectContaining({ name: 'TimeoutError' }));
    });

    it('moves an element back to the selected device when its switch finishes after a revert', async () => {
        const late = deferred();
        const el = element('a', sinkId => sinkId === 'speaker-2' ? late.promise : Promise.resolve());

        await manager.attach(el, audio);
        await expectAsync(manager.setDevice('speaker-2'))
            .toBeRejectedWith(jasmine.objectContaining({ name: 'TimeoutError' }));

        late.resolve();
        await tick();

        expect(el.setSinkId).toHaveBeenCalledWith('');
        expect(el.sinkId).toBe('');
    });

    it('does not revert a newer selection', async () => {
        const el = element('a', sinkId => sinkId === 'speaker-2' ? new Promise(() => undefined) : Promise.resolve());

        await manager.attach(el, audio);

        const first = manager.setDevice('speaker-2');

        await tick();
        expect(await manager.setDevice('speaker-3')).toEqual([]);

        await expectAsync(first).toBeRejected();
        expect(manager.getDevice()).toBe('speaker-3');
    });

    it('switches the elements again only when the audio outputs change', async () => {
        const mic = { deviceId: 'mic', groupId: 'g1', kind: 'audioinput', label: 'Mic' } as MediaDeviceInfo;
        const speaker = { deviceId: 'speaker-2', groupId: 'g2', kind: 'audiooutput', label: 'Speaker' } as MediaDeviceInfo;
        const headset = { deviceId: 'headset', groupId: 'g3', kind: 'audiooutput', label: 'Headset' } as MediaDeviceInfo;
        const el = element('a', () => Promise.reject(aborted()));

        await manager.attach(element('b'), audio);
        await manager.attach(el, audio);
        await manager.setDevice('speaker-2');

        // The selected output is not in the list, the application picks another one.
        manager.onDeviceListChanged([ mic ]);
        expect(el.setSinkId).toHaveBeenCalledTimes(1);

        manager.onDeviceListChanged([ mic, speaker ]);
        expect(el.setSinkId).toHaveBeenCalledTimes(2);

        manager.onDeviceListChanged([ speaker ]);
        expect(el.setSinkId).toHaveBeenCalledTimes(2);

        manager.onDeviceListChanged([ speaker, headset ]);
        expect(el.setSinkId).toHaveBeenCalledTimes(3);
        await tick();
    });

    it('reloads a playing element whose switch was aborted', async () => {
        const el = element('a', () => Promise.reject(aborted()));
        const assigned: Array<MediaStream | null> = [];

        await manager.attach(element('b'), audio);
        await manager.attach(el, audio);
        el.paused = false;
        Object.defineProperty(el, 'srcObject', {
            get: () => assigned.length ? assigned[assigned.length - 1] : audio,
            set: value => assigned.push(value)
        });

        await manager.setDevice('speaker-2');

        expect(assigned).toEqual([ null, audio ]);
        expect(el.play).toHaveBeenCalled();
    });

    it('does not reload an element whose switch was rejected before it started', async () => {
        const el = element('a', () => Promise.reject(new DOMException('not found', 'NotFoundError')));
        const assigned: Array<MediaStream | null> = [];

        await manager.attach(element('b'), audio);
        await manager.attach(el, audio);
        el.paused = false;
        Object.defineProperty(el, 'srcObject', {
            get: () => audio,
            set: value => assigned.push(value)
        });

        await manager.setDevice('speaker-2');

        expect(assigned).toEqual([]);
        expect(el.play).not.toHaveBeenCalled();
    });

    it('leaves an element that was given another stream during the switch alone', async () => {
        const other = { getAudioTracks: () => [ {} ] } as unknown as MediaStream;
        let current = audio;
        const el = element('a', () => {
            current = other;

            return Promise.reject(aborted());
        });
        const assigned: Array<MediaStream | null> = [];

        await manager.attach(element('b'), audio);
        await manager.attach(el, audio);
        el.paused = false;
        Object.defineProperty(el, 'srcObject', {
            get: () => current,
            set: value => assigned.push(value)
        });

        await manager.setDevice('speaker-2');

        expect(assigned).toEqual([]);
        expect(el.play).not.toHaveBeenCalled();
    });
});
