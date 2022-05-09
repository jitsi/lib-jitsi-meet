/**
 * This object stores variables needed around the recording of an audio stream
 * and passing this recording along with additional information along to
 * different processes
 */
export default class RecordingResult {
    /**
     * @param blob the recording audio stream as a single blob
     * @param name the name of the person of the audio stream
     * @param startTime the time in UTC when recording of the audiostream started
     * @param wordArray the recorder audio stream transcribed as an array of Word objects
     */
    constructor(blob: any, name: any, startTime: any, wordArray: any);
    blob: any;
    name: any;
    startTime: any;
    wordArray: any;
}
