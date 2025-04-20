import { getLogger } from '@jitsi/logger';
import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import RTC from '../RTC/RTC';
import Statistics from '../statistics/statistics';
import JitsiLocalTrack from '../RTC/JitsiLocalTrack';

const logger = getLogger('modules/detection/ActiveDeviceDetector');

// If after 3000 ms the detector did not find any active devices consider that there aren't any usable ones available
// i.e. audioLevel > 0.008
const DETECTION_TIMEOUT = 3000;

/**
 * Interface representing the structure of the active audio device.
 */
export interface IActiveAudioDevice {
    deviceId: string;
    deviceLabel: string;
}

/**
 * Class for detecting active audio devices.
 */
export default class ActiveDeviceDetector {
    /**
     * Go through all audio devices on the system and return one that is active, i.e. has audio signal.
     *
     * @returns Promise<ActiveAudioDevice> - Object containing information about the found device.
     */
    static getActiveAudioDevice(): Promise<IActiveAudioDevice> {
        return new Promise(resolve => {
            RTC.enumerateDevices((devices: MediaDeviceInfo[]) => {
                const audioDevices = devices.filter(device => device.kind === 'audioinput');
                const devicePromiseArray: Promise<JitsiLocalTrack>[] = [];

                for (const micDevice of audioDevices) {
                    const devicePromise = RTC.obtainAudioAndVideoPermissions({
                        devices: [ 'audio' ],
                        micDeviceId: micDevice.deviceId
                    }).then((tracks: JitsiLocalTrack[]) => {
                        // We expect a single device to be available when obtained from obtainAudioAndVideoPermissions
                        // that's why only take tracks[0].
                        const track = tracks[0];

                        Statistics.startLocalStats(track, track.setAudioLevel.bind(track));

                        return track;
                    });

                    devicePromiseArray.push(devicePromise);
                }

                Promise.allSettled(devicePromiseArray).then(outcomeArray => {
                    const successfulPromises = outcomeArray.filter(
                        (p): p is PromiseFulfilledResult<JitsiLocalTrack> => p.status === 'fulfilled'
                    );
                    const rejectedPromises = outcomeArray.filter(
                        (p): p is PromiseRejectedResult => p.status === 'rejected'
                    );

                    const availableDevices = successfulPromises.map(p => p.value);
                    const rejectReasons = rejectedPromises.map(p => p.reason);

                    for (const reason of rejectReasons) {
                        logger.error('Failed to acquire audio device with error: ', reason);
                    }

                    // Setup event handlers for monitored devices.
                    for (const device of availableDevices) {
                        device.on(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED, (audioLevel: number) => {
                            // This is a very naive approach but works, a more accurate one would be to use rnnoise in
                            // order to limit the number of false positives. The 0.008 constant is due to how
                            // LocalStatsCollector from lib-jitsi-meet publishes audio-levels, in this case 0.008 denotes
                            // no input.
                            if (audioLevel > 0.008) {
                                ActiveDeviceDetector.stopActiveDevices(availableDevices);
                                resolve({
                                    deviceId: device.deviceId,
                                    deviceLabel: device.track.label
                                });
                            }
                        });
                    }

                    // Cancel the detection in case no devices were found with audioLevel > 0 in the set timeout.
                    setTimeout(() => {
                        ActiveDeviceDetector.stopActiveDevices(availableDevices);
                        resolve({
                            deviceId: '',
                            deviceLabel: ''
                        });
                    }, DETECTION_TIMEOUT);
                });
            });
        });
    }

    /**
     * Stop the streams of the provided JitsiLocalTracks.
     *
     * @param {Array<JitsiLocalTrack>} deviceList - Array of JitsiLocalTracks to stop.
     * @returns {void}
     */
    static stopActiveDevices(deviceList: JitsiLocalTrack[]): void {
        for (const device of deviceList) {
            device.stopStream();
        }
    }
}
