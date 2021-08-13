export default AudioRecorder;
/**
 * main exported object of the file, holding all
 * relevant functions and variables for the outside world
 * @param jitsiConference the jitsiConference which this object
 * is going to record
 */
declare function AudioRecorder(jitsiConference: any): void;
declare class AudioRecorder {
    /**
     * main exported object of the file, holding all
     * relevant functions and variables for the outside world
     * @param jitsiConference the jitsiConference which this object
     * is going to record
     */
    constructor(jitsiConference: any);
    recorders: any[];
    fileType: string;
    isRecording: boolean;
    jitsiConference: any;
    /**
     * Adds a new TrackRecorder object to the array.
     *
     * @param track the track potentially holding an audio stream
     */
    addTrack(track: any): void;
    /**
     * Creates a TrackRecorder object. Also creates the MediaRecorder and
     * data array for the trackRecorder.
     * @param track the JitsiTrack holding the audio MediaStream(s)
     */
    instantiateTrackRecorder(track: any): TrackRecorder;
    /**
     * Notifies the module that a specific track has stopped, e.g participant left
     * the conference.
     * if the recording has not started yet, the TrackRecorder will be removed from
     * the array. If the recording has started, the recorder will stop recording
     * but not removed from the array so that the recorded stream can still be
     * accessed
     *
     * @param {JitsiTrack} track the JitsiTrack to remove from the recording session
     */
    removeTrack(track: any): void;
    /**
     * Tries to update the name value of all TrackRecorder in the array.
     * If it hasn't changed,it will keep the exiting name. If it changes to a
     * undefined value, the old value will also be kept.
     */
    updateNames(): void;
    /**
     * Starts the audio recording of every local and remote track
     */
    start(): void;
    /**
     * Stops the audio recording of every local and remote track
     */
    stop(): void;
    /**
     * link hacking to download all recorded audio streams
     */
    download(): void;
    /**
     * returns the audio files of all recorders as an array of objects,
     * which include the name of the owner of the track and the starting time stamp
     * @returns {Array} an array of RecordingResult objects
     */
    getRecordingResults(): any[];
    /**
     * Gets the mime type of the recorder audio
     * @returns {String} the mime type of the recorder audio
     */
    getFileType(): string;
}
declare namespace AudioRecorder {
    export { determineCorrectFileType };
}
import TrackRecorder from "./trackRecorder";
/**
 * Determines which kind of audio recording the browser supports
 * chrome supports "audio/webm" and firefox supports "audio/ogg"
 */
declare function determineCorrectFileType(): "audio/webm" | "audio/ogg";
