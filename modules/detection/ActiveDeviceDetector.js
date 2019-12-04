import { getLogger } from 'jitsi-meet-logger';

import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import RTC from '../RTC/RTC';
import Statistics from '../statistics/statistics';


const logger = getLogger(__filename);

// If after 3000 ms the detector did not find any active devices consider that there aren't any usable ones available
// i.e. audioLevel > 0.008
const DETECTION_TIMEOUT = 3000;


/**
 * Go through all audio devices on the system and return one that is active, i.e. has audio signal.
 *
 * @returns Promise<Object> - Object containing information about the found device.
 */
export default function getActiveAudioDevice() {

    return new Promise(resolve => {
        RTC.enumerateDevices(devices => {
            const audioDevices = devices.filter(device => device.kind === 'audioinput');
            const devicePromiseArray = [];


            for (const micDevice of audioDevices) {
                const devicePromise = RTC.obtainAudioAndVideoPermissions({ devices: [ 'audio' ],
                    micDeviceId: micDevice.deviceId }).then(tracks => {

                    // We expect a single device to be available when obtained from obtainAudioAndVideoPermissions
                    // that's  why only take p.value[0].
                    const track = tracks[0];
                    const originalStream = track.getOriginalStream();

                    Statistics.startLocalStats(originalStream, track.setAudioLevel.bind(track));
                    track.addEventListener(JitsiTrackEvents.LOCAL_TRACK_STOPPED, () => {
                        Statistics.stopLocalStats(originalStream);
                    });

                    return track;
                });

                devicePromiseArray.push(devicePromise);
            }

            Promise.allSettled(devicePromiseArray).then(outcomeArray => {
                const successfulPromises = outcomeArray.filter(p => p.status === 'fulfilled');
                const rejectedPromises = outcomeArray.filter(p => p.status === 'rejected');


                const availableDevices = successfulPromises.map(p => p.value);
                const rejectReasons = rejectedPromises.map(p => p.value);

                for (const reason of rejectReasons) {
                    logger.error('Failed to acquire audio device with error: ', reason);
                }

                // Setup event handlers for monitored devices.
                for (const device of availableDevices) {
                    device.on(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED, audioLevel => {
                        // This is a very naive approach but works, a more accurate one would be to use rnnoise in
                        // order to limit  the number of false positives. The 0.008 constant is due to how
                        // LocalStatsCollector from lib-jitsi-meet publishes audio-levels, in this case 0.008 denotes //
                        // no input.
                        if (audioLevel > 0.008) {
                            stopActiveDevices(availableDevices);
                            resolve({ deviceId: device.deviceId,
                                deviceLabel: device.track.label });
                        }
                    });
                }

                // Cancel the detection in case no devices was found with audioLevel > 0 in the set timeout.
                setTimeout(() => {
                    stopActiveDevices(availableDevices);
                    resolve({
                        deviceId: '',
                        deviceLabel: '' }
                    );
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
function stopActiveDevices(deviceList) {
    for (const device of deviceList) {
        device.stopStream();
    }
}
