import { JitsiTrackEvents } from '../../JitsiTrackEvents';

import { AudioOutputManager } from './AudioOutputManager';
import JitsiTrack from './JitsiTrack';

interface IFakeElement {
    id: string;
    paused: boolean;
    play: jasmine.Spy;
    setSinkId: jasmine.Spy;
    sinkId: string;
    srcObject: MediaStream | null;
}

describe('AudioOutputManager', () => {
    const audio = { getAudioTracks: () => [ {} ] } as unknown as MediaStream;
    const video = { getAudioTracks: () => [] } as unknown as MediaStream;
    const aborted = () => new DOMException('aborted', 'AbortError');
    const tick = () => new Promise(resolve => setTimeout(resolve));
    let manager: AudioOutputManager;
    let probe: jasmine.Spy;

    function element(id: string, setSinkId?: (sinkId: string) => Promise<void>): IFakeElement {
        const el: IFakeElement = {
            id,
            paused: true,
            play: jasmine.createSpy('play').and.returnValue(Promise.resolve()),
            setSinkId: jasmine.createSpy('setSinkId'),
            sinkId: '',
            srcObject: null
        };

        el.setSinkId.and.callFake((sinkId: string) => (setSinkId?.(sinkId) ?? Promise.resolve()).then(() => {
            el.sinkId = sinkId;
        }));

        return el;
    }

    function attach(el: IFakeElement, stream: MediaStream | null, t?: JitsiTrack) {
        return manager.attach(el as unknown as HTMLMediaElement, stream, t);
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

        await attach(el, audio, track());
        await attach(videoEl, video);
        expect(el.setSinkId).not.toHaveBeenCalled();

        expect(await manager.setDevice('speaker-2')).toEqual([]);
        expect(el.setSinkId).toHaveBeenCalledOnceWith('speaker-2');
        expect(videoEl.setSinkId).not.toHaveBeenCalled();

        await attach(el, null);
        await manager.setDevice('speaker-3');
        expect(el.setSinkId).toHaveBeenCalledTimes(1);
    });

    it('moves a reused element that is on another output back to the default', async () => {
        const el = Object.assign(element('a'), { sinkId: 'speaker-2' });

        await attach(el, audio);

        expect(el.setSinkId).toHaveBeenCalledOnceWith('');
    });

    it('switches an element attached later to the selected device', async () => {
        const el = element('a');

        await manager.setDevice('speaker-2');
        await attach(el, audio);

        expect(el.setSinkId).toHaveBeenCalledOnceWith('speaker-2');
        expect(manager.getDevice()).toBe('speaker-2');
    });

    it('resolves with the tracks that did not switch and reports each track', async () => {
        const error = aborted();
        const switched = track();
        const failing = track();

        await attach(element('a'), audio, switched);
        await attach(element('b', () => Promise.reject(error)), audio, failing);

        expect(await manager.setDevice('speaker-2')).toEqual([ failing ]);
        expect(manager.getDevice()).toBe('speaker-2');
        expect(switched.emit).toHaveBeenCalledWith(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED, 'speaker-2');
        expect(failing.emit).toHaveBeenCalledWith(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_FAILED, error);
    });

    it('rejects and keeps the previous device when no element could switch', async () => {
        const error = aborted();

        await attach(element('a', () => Promise.reject(error)), audio, track());

        await expectAsync(manager.setDevice('speaker-2')).toBeRejectedWith(error);
        expect(manager.getDevice()).toBe('default');
    });

    it('rejects without switching any element when the device cannot be used', async () => {
        const error = new DOMException('not found', 'NotFoundError');
        const el = element('a');

        probe.and.returnValue(Promise.reject(error));
        await attach(el, audio);

        await expectAsync(manager.setDevice('speaker-2')).toBeRejectedWith(error);
        expect(el.setSinkId).not.toHaveBeenCalled();
        expect(manager.getDevice()).toBe('default');
    });

    it('counts a switch that does not settle within the switch timeout as failed', async () => {
        const hanging = track();

        await attach(element('a'), audio, track());
        await attach(element('b', () => new Promise(() => undefined)), audio, hanging);

        expect(await manager.setDevice('speaker-2')).toEqual([ hanging ]);
        expect(hanging.emit).toHaveBeenCalledWith(
            JitsiTrackEvents.TRACK_AUDIO_OUTPUT_FAILED, jasmine.objectContaining({ name: 'TimeoutError' }));
    });

    it('moves an element back to the selected device when its switch finishes after a revert', async () => {
        const late = deferred();
        const el = element('a', sinkId => sinkId === 'speaker-2' ? late.promise : Promise.resolve());

        await attach(el, audio);
        await expectAsync(manager.setDevice('speaker-2'))
            .toBeRejectedWith(jasmine.objectContaining({ name: 'TimeoutError' }));

        late.resolve();
        await tick();

        expect(el.setSinkId).toHaveBeenCalledWith('');
        expect(el.sinkId).toBe('');
    });

    it('ends a running change when a newer one starts, without waiting for its switches', async () => {
        const el = element('a', sinkId => sinkId === 'speaker-2' ? new Promise(() => undefined) : Promise.resolve());

        // Long enough that waiting for the first change would time the spec out.
        manager.enable({ switchTimeout: 60000 });
        await attach(el, audio);

        const first = manager.setDevice('speaker-2');

        await tick();
        expect(await manager.setDevice('speaker-3')).toEqual([]);

        await expectAsync(first).toBeRejectedWith(jasmine.objectContaining({ name: 'SupersededError' }));
        expect(manager.getDevice()).toBe('speaker-3');
    });

    it('does not leave the elements on the device of a change that a newer one ended', async () => {
        const slow = deferred();
        const el = element('a', sinkId => sinkId === 'speaker-2' ? slow.promise : Promise.resolve());

        await attach(el, audio);

        const first = manager.setDevice('speaker-2');

        await tick();
        expect(await manager.setDevice('default')).toEqual([]);
        await expectAsync(first).toBeRejectedWith(jasmine.objectContaining({ name: 'SupersededError' }));

        slow.resolve();
        await tick();

        expect(manager.getDevice()).toBe('default');
        expect(el.sinkId).toBe('');
    });

    it('does not report the tracks of a change that a newer one ended', async () => {
        const slow = deferred();
        const t = track();

        await attach(element('a', sinkId => sinkId === 'speaker-2' ? slow.promise : Promise.resolve()), audio, t);

        const first = manager.setDevice('speaker-2');

        await tick();
        expect(await manager.setDevice('default')).toEqual([]);
        await expectAsync(first).toBeRejected();

        slow.resolve();
        await tick();

        expect(t.emit).not.toHaveBeenCalledWith(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED, 'speaker-2');
    });

    it('moves an element whose attach lands after a change to the selected device', async () => {
        const slow = deferred();
        const el = element('a', sinkId => sinkId === 'speaker-2' ? slow.promise : Promise.resolve());

        await manager.setDevice('speaker-2');

        const attaching = attach(el, audio, track());

        expect(await manager.setDevice('default')).toEqual([]);
        slow.resolve();
        await attaching;
        await tick();

        expect(manager.getDevice()).toBe('default');
        expect(el.sinkId).toBe('');
    });

    it('moves an element whose retry lands after a change back to the selected device', async () => {
        const slow = deferred();
        const failing = track();
        let attempts = 0;
        const el = element('a', sinkId => {
            if (sinkId !== 'speaker-2') {
                return Promise.resolve();
            }

            return ++attempts === 1 ? Promise.reject(aborted()) : slow.promise;
        });
        const speaker = {
            deviceId: 'speaker-2',
            groupId: 'g2',
            kind: 'audiooutput',
            label: 'Speaker'
        } as MediaDeviceInfo;

        await attach(element('b'), audio, track());
        await attach(el, audio, failing);
        expect(await manager.setDevice('speaker-2')).toEqual([ failing ]);

        manager.onDeviceListChanged([ speaker ]);
        expect(await manager.setDevice('default')).toEqual([]);

        slow.resolve();
        await tick();

        expect(attempts).toBe(2);
        expect(el.sinkId).toBe('');
    });

    it('keeps the device selected before two overlapping changes that both fail', async () => {
        const el = element('a', sinkId => {
            if (sinkId === 'speaker-2') {
                return new Promise(() => undefined);
            }

            return sinkId === 'speaker-3' ? Promise.reject(aborted()) : Promise.resolve();
        });

        await attach(el, audio);

        const first = manager.setDevice('speaker-2');

        await tick();

        await expectAsync(manager.setDevice('speaker-3'))
            .toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
        await expectAsync(first).toBeRejectedWith(jasmine.objectContaining({ name: 'SupersededError' }));
        expect(manager.getDevice()).toBe('default');
    });

    it('keeps the device selected before a change that hangs and a newer one that cannot be used', async () => {
        const el = element('a', sinkId => sinkId === 'speaker-2' ? new Promise(() => undefined) : Promise.resolve());

        probe.and.callFake((sinkId: string) => sinkId === 'speaker-3'
            ? Promise.reject(new DOMException('not found', 'NotFoundError')) : Promise.resolve());
        await attach(el, audio);

        const first = manager.setDevice('speaker-2');

        await tick();

        await expectAsync(manager.setDevice('speaker-3'))
            .toBeRejectedWith(jasmine.objectContaining({ name: 'NotFoundError' }));
        await expectAsync(first).toBeRejected();
        expect(manager.getDevice()).toBe('default');
    });

    it('checks a device again after a change to it was reverted', async () => {
        const el = element('a', () => Promise.reject(aborted()));

        // Like a real element, the check element keeps the device it switched to.
        probe.and.callFake(function(this: HTMLMediaElement, sinkId: string) {
            Object.defineProperty(this, 'sinkId', { configurable: true, value: sinkId });

            return Promise.resolve();
        });
        await attach(el, audio);
        await expectAsync(manager.setDevice('speaker-2')).toBeRejected();
        await attach(el, null);

        probe.and.returnValue(Promise.reject(new DOMException('not found', 'NotFoundError')));

        await expectAsync(manager.setDevice('speaker-2'))
            .toBeRejectedWith(jasmine.objectContaining({ name: 'NotFoundError' }));
    });

    it('reports a switch that lands on the selected device after the time limit', async () => {
        const late = deferred();
        const lateTrack = track();

        await attach(element('a'), audio, track());
        await attach(element('b', () => late.promise), audio, lateTrack);

        expect(await manager.setDevice('speaker-2')).toEqual([ lateTrack ]);
        late.resolve();
        await tick();

        expect(lateTrack.emit).toHaveBeenCalledWith(JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED, 'speaker-2');
    });

    it('does not switch the elements again when the devices change during a change', async () => {
        const slow = deferred();
        const el = element('a', () => slow.promise);
        const speaker = {
            deviceId: 'speaker-2',
            groupId: 'g2',
            kind: 'audiooutput',
            label: 'Speaker'
        } as MediaDeviceInfo;

        await attach(el, audio, track());

        const change = manager.setDevice('speaker-2');

        await tick();
        manager.onDeviceListChanged([ speaker ]);
        slow.resolve();
        await change;

        expect(el.setSinkId).toHaveBeenCalledOnceWith('speaker-2');
    });

    it('switches the elements again after a change when the devices changed during it', async () => {
        const slow = deferred();
        let ready = false;
        const failing = element('a', () => ready ? Promise.resolve() : Promise.reject(aborted()));
        const speaker = {
            deviceId: 'speaker-2',
            groupId: 'g2',
            kind: 'audiooutput',
            label: 'Speaker'
        } as MediaDeviceInfo;

        await attach(failing, audio, track());
        await attach(element('b', () => slow.promise), audio, track());

        const change = manager.setDevice('speaker-2');

        await tick();

        // Like a Bluetooth headset that becomes ready while the switch is still running.
        ready = true;
        manager.onDeviceListChanged([ speaker ]);
        expect(failing.setSinkId).toHaveBeenCalledTimes(1);

        slow.resolve();
        await change;
        await tick();

        expect(failing.setSinkId).toHaveBeenCalledTimes(2);
        expect(failing.sinkId).toBe('speaker-2');
    });

    it('rejects the changes that newer ones ended or replaced with SupersededError', async () => {
        const gate = deferred();

        probe.and.callFake((sinkId: string) => sinkId === 'speaker-2' ? gate.promise : Promise.resolve());

        const first = manager.setDevice('speaker-2');

        await tick();

        const second = manager.setDevice('speaker-3');
        const third = manager.setDevice('speaker-4');

        gate.resolve();

        await expectAsync(first).toBeRejectedWith(jasmine.objectContaining({ name: 'SupersededError' }));
        await expectAsync(second).toBeRejectedWith(jasmine.objectContaining({ name: 'SupersededError' }));
        expect(await third).toEqual([]);
        expect(manager.getDevice()).toBe('speaker-4');
    });

    it('applies only the last of the changes requested at once', async () => {
        const first = manager.setDevice('speaker-2');
        const second = manager.setDevice('speaker-3');

        await expectAsync(first).toBeRejectedWith(jasmine.objectContaining({ name: 'SupersededError' }));
        expect(await second).toEqual([]);
        expect(manager.getDevice()).toBe('speaker-3');
    });

    it('switches the elements again only when the audio outputs change', async () => {
        const mic = { deviceId: 'mic', groupId: 'g1', kind: 'audioinput', label: 'Mic' } as MediaDeviceInfo;
        const speaker = {
            deviceId: 'speaker-2',
            groupId: 'g2',
            kind: 'audiooutput',
            label: 'Speaker'
        } as MediaDeviceInfo;
        const headset = {
            deviceId: 'headset',
            groupId: 'g3',
            kind: 'audiooutput',
            label: 'Headset'
        } as MediaDeviceInfo;
        const el = element('a', () => Promise.reject(aborted()));

        await attach(element('b'), audio);
        await attach(el, audio);
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

        await attach(element('b'), audio);
        await attach(el, audio);
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

        await attach(element('b'), audio);
        await attach(el, audio);
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

        await attach(element('b'), audio);
        await attach(el, audio);
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
