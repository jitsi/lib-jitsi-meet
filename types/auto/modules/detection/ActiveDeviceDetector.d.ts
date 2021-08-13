/**
 * Go through all audio devices on the system and return one that is active, i.e. has audio signal.
 *
 * @returns Promise<Object> - Object containing information about the found device.
 */
export default function getActiveAudioDevice(): Promise<any>;
