import { JitsiTrackEvents } from '../../JitsiTrackEvents';
import { MediaType } from '../../service/RTC/MediaType';

import JitsiLocalTrack, { IStreamEffect } from './JitsiLocalTrack';
import RTCUtils from './RTCUtils';

describe('JitsiLocalTrack', () => {
    const MIC_ID = 'mic-1';
    const MIC_LABEL = 'Scarlett 2i2 USB';

    function fakeTrack(label: string): any {
        const track = {
            enabled: true,
            getConstraints: () => ({}),
            getSettings: () => ({}),
            kind: 'audio',
            label,
            readyState: 'live',
            stop: jasmine.createSpy('stop').and.callFake(() => {
                track.readyState = 'ended';
            })
        };

        return track;
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

    describe('stopStream', () => {
        function createTrackWithEffect(): { effect: IStreamEffect; localTrack: any; micTrack: any; outputTrack: any; } {
            const outputTrack = fakeTrack('MediaStreamAudioDestinationNode');
            const effect = mixerEffect(outputTrack);

            spyOn(effect, 'stopEffect');

            return { effect, outputTrack, ...createTrack([ effect ]) };
        }

        it('stops the effect and the device but keeps the effect output as the track', () => {
            const { effect, localTrack, micTrack, outputTrack } = createTrackWithEffect();

            expect(localTrack.getTrack()).toBe(outputTrack);

            localTrack.stopStream();

            // The senders hold the effect output, so getTrack() must keep returning it.
            expect(localTrack.getTrack()).toBe(outputTrack);
            expect(effect.stopEffect).toHaveBeenCalledTimes(1);
            expect(micTrack.stop).toHaveBeenCalled();
            expect(outputTrack.stop).toHaveBeenCalled();
            expect(localTrack.isEnded()).toBeTrue();
        });

        it('emits LOCAL_TRACK_STOPPED once for a track with a stream effect', async () => {
            const audioContext = new AudioContext();
            const oscillatorStream = (): MediaStream => {
                const oscillator = audioContext.createOscillator();
                const destination = audioContext.createMediaStreamDestination();

                oscillator.connect(destination);
                oscillator.start();

                return destination.stream;
            };
            const micStream = oscillatorStream();
            const localTrack = new JitsiLocalTrack({
                constraints: {},
                deviceId: MIC_ID,
                effects: [ {
                    isEnabled: () => true,
                    startEffect: oscillatorStream,
                    stopEffect: () => undefined
                } as unknown as IStreamEffect ],
                mediaType: MediaType.AUDIO,
                rtcId: 1,
                stream: micStream,
                track: micStream.getTracks()[0]
            });
            const onStopped = jasmine.createSpy('onStopped');

            localTrack.on(JitsiTrackEvents.LOCAL_TRACK_STOPPED, onStopped);
            localTrack.stopStream();

            // Chrome fires the inactive event of a stopped stream asynchronously.
            await new Promise(resolve => setTimeout(resolve, 200));
            await audioContext.close();

            expect(onStopped).toHaveBeenCalledTimes(1);
        });

        it('stops the effect once when stopStream is called again', () => {
            const { effect, localTrack } = createTrackWithEffect();

            localTrack.stopStream();
            localTrack.stopStream();

            expect(effect.stopEffect).toHaveBeenCalledTimes(1);
        });

        it('does not stop the effect again when the effect is removed after stopStream', async () => {
            const { effect, localTrack, micTrack } = createTrackWithEffect();

            localTrack.stopStream();
            await localTrack.setEffect(undefined);

            expect(effect.stopEffect).toHaveBeenCalledTimes(1);
            expect(localTrack.getTrack()).toBe(micTrack);
            expect(localTrack.isEnded()).toBeTrue();
        });

        it('removes the track from the peerconnection by the effect output when the effect is removed', async () => {
            const { effect, localTrack, outputTrack } = createTrackWithEffect();
            let trackOnRemove;

            localTrack.conference = {
                _addLocalTrackToPc: () => Promise.resolve(),
                _removeLocalTrackFromPc: (track: any) => {
                    trackOnRemove = track.getTrack();

                    return Promise.resolve();
                }
            };
            localTrack.stopStream();
            await localTrack.setEffect(undefined);

            expect(trackOnRemove).toBe(outputTrack);
            expect(effect.stopEffect).toHaveBeenCalledTimes(1);
        });

        it('stops the effect once when the track is disposed after stopStream', async () => {
            const { effect, localTrack } = createTrackWithEffect();

            localTrack.stopStream();
            await localTrack.dispose();

            expect(effect.stopEffect).toHaveBeenCalledTimes(1);
            expect(localTrack.disposed).toBeTrue();
        });

        it('keeps a track muted through an effect without its own mute muted', async () => {
            const outputTrack = fakeTrack('MediaStreamAudioDestinationNode');
            const { localTrack } = createTrack([ {
                isEnabled: () => true,
                startEffect: () => fakeStream(outputTrack),
                stopEffect: () => undefined
            } as unknown as IStreamEffect ]);

            await localTrack.mute();
            localTrack.stopStream();

            expect(localTrack.isMuted()).toBeTrue();
        });

        it('stops the effect once when a video track is muted after stopStream', async () => {
            const cameraTrack = { ...fakeTrack('FaceTime HD Camera'), kind: 'video' };
            const outputTrack = { ...fakeTrack('canvas'), kind: 'video' };
            const effect = mixerEffect(outputTrack);

            spyOn(effect, 'stopEffect');

            const localTrack: any = new JitsiLocalTrack({
                constraints: { height: { ideal: 720 }, width: { ideal: 1280 } },
                deviceId: 'camera-1',
                effects: [ effect ],
                mediaType: MediaType.VIDEO,
                rtcId: 1,
                stream: {
                    getTracks: () => [ cameraTrack ],
                    getVideoTracks: () => [ cameraTrack ]
                } as unknown as MediaStream,
                track: cameraTrack,
                videoType: 'camera'
            });

            localTrack.stopStream();
            await localTrack.mute();

            expect(effect.stopEffect).toHaveBeenCalledTimes(1);
        });

        it('does not report a video track unmuted after its effect was removed as ended', async () => {
            const videoTrack = (label: string): any => {
                const track = fakeTrack(label);

                track.kind = 'video';

                return track;
            };
            const videoStream = (track: any): MediaStream => ({
                get active() {
                    return track.readyState === 'live';
                },
                getTracks: () => [ track ],
                getVideoTracks: () => [ track ]
            }) as unknown as MediaStream;
            const cameraTrack = videoTrack('FaceTime HD Camera');
            const newCameraTrack = videoTrack('FaceTime HD Camera');
            const outputTrack = videoTrack('canvas');
            const localTrack: any = new JitsiLocalTrack({
                constraints: { height: { ideal: 720 }, width: { ideal: 1280 } },
                deviceId: 'camera-1',

                // Like the virtual background, the effect has no mute state of its own.
                effects: [ {
                    isEnabled: () => true,
                    startEffect: () => videoStream(outputTrack),
                    stopEffect: () => undefined
                } as unknown as IStreamEffect ],
                mediaType: MediaType.VIDEO,
                rtcId: 1,
                stream: videoStream(cameraTrack),
                track: cameraTrack,
                videoType: 'camera'
            });

            spyOn(RTCUtils, 'obtainAudioAndVideoPermissions').and.returnValue(Promise.resolve([ {
                stream: videoStream(newCameraTrack),
                track: newCameraTrack,
                videoType: 'camera'
            } ]));

            // The stopped stream reads as muted, so the effect is only dropped, without restoring the stream.
            localTrack.stopStream();
            await localTrack.setEffect(undefined);
            await localTrack.unmute();

            expect(localTrack.getTrack()).toBe(newCameraTrack);
            expect(localTrack.isEnded()).toBeFalse();
        });

        it('stops a new effect started after stopStream', async () => {
            const { localTrack } = createTrackWithEffect();
            const newEffect = mixerEffect(fakeTrack('MediaStreamAudioDestinationNode'));

            spyOn(newEffect, 'stopEffect');
            localTrack.stopStream();
            await localTrack.setEffect(newEffect);
            localTrack.stopStream();

            expect(newEffect.stopEffect).toHaveBeenCalledTimes(1);
        });

        it('stops the stream of a track without a stream effect', () => {
            const { localTrack, micTrack } = createTrack();

            localTrack.stopStream();

            expect(localTrack.getTrack()).toBe(micTrack);
            expect(micTrack.stop).toHaveBeenCalled();
            expect(localTrack.isEnded()).toBeTrue();
        });
    });
});
