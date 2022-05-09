export default Transcriber;
/**
 * This is the main object for handing the Transcription. It interacts with
 * the audioRecorder to record every person in a conference and sends the
 * recorder audio to a transcriptionService. The returned speech-to-text result
 * will be merged to create a transcript
 * @param {AudioRecorder} audioRecorder An audioRecorder recording a conference
 */
declare function Transcriber(): void;
declare class Transcriber {
    audioRecorder: AudioRecorder;
    transcriptionService: SphinxService;
    counter: any;
    startTime: Date;
    transcription: string;
    callback: any;
    results: any[];
    state: string;
    lineLength: number;
    /**
     * Method to start the transcription process. It will tell the audioRecorder
     * to start storing all audio streams and record the start time for merging
     * purposes
     */
    start(): void;
    /**
     * Method to stop the transcription process. It will tell the audioRecorder to
     * stop, and get all the recorded audio to send it to the transcription service
    
     * @param callback a callback which will receive the transcription
     */
    stop(callback: any): void;
    /**
     * this method will check if the counter is zero. If it is, it will call
     * the merging method
     */
    maybeMerge(): void;
    /**
     * This method will merge all speech-to-text arrays together in one
     * readable transcription string
     */
    merge(): void;
    /**
     * Appends a word object to the transcription. It will make a new line with a
     * name if a name is specified
     * @param {Word} word the Word object holding the word to append
     * @param {String|null} name the name of a new speaker. Null if not applicable
     */
    updateTranscription(word: any, name: string | null): void;
    /**
     * Gives the transcriber a JitsiTrack holding an audioStream to transcribe.
     * The JitsiTrack is given to the audioRecorder. If it doesn't hold an
     * audiostream, it will not be added by the audioRecorder
     * @param {JitsiTrack} track the track to give to the audioRecorder
     */
    addTrack(track: any): void;
    /**
     * Remove the given track from the auioRecorder
     * @param track
     */
    removeTrack(track: any): void;
    /**
     * Will return the created transcription if it's avialable or throw an error
     * when it's not done yet
     * @returns {String} the transcription as a String
     */
    getTranscription(): string;
    /**
     * Returns the current state of the transcription process
     */
    getState(): string;
    /**
     * Resets the state to the "before" state, such that it's again possible to
     * call the start method
     */
    reset(): void;
}
import AudioRecorder from "./audioRecorder";
import SphinxService from "./transcriptionServices/SphinxTranscriptionService";
