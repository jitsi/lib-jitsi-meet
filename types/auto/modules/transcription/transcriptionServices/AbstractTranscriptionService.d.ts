/**
 * Abstract class representing an interface to implement a speech-to-text
 * service on.
 */
export default class TranscriptionService {
    /**
     * This method can be used to send the recorder audio stream and
     * retrieve the answer from the transcription service from the callback
     *
     * @param {RecordingResult} recordingResult a recordingResult object which
     * includes the recorded audio stream as a blob
     * @param {Function} callback  which will retrieve the a RecordingResult with
     *        the answer as a WordArray
     */
    send(recordingResult: any, callback: Function): void;
    /**
     * Abstract method which will rend the recorder audio stream to the implemented
     * transcription service and will retrieve an answer, which will be
     * called on the given callback method
     *
     * @param {Blob} audioBlob the recorded audio stream as a single Blob
     * @param {function} callback function which will retrieve the answer
     *                            from the service
     */
    sendRequest(audioBlob: Blob, callback: Function): void;
    /**
     * Abstract method which will parse the output from the implemented
     * transcription service to the expected format
     *
     * The transcriber class expect an array of word objects, where each word
     * object is one transcribed word by the service.
     *
     * The expected output of this method is an array of word objects, in
     * the correct order. That is, the first object in the array is the first word
     * being said, and the last word in the array is the last word being said
     *
     * @param response the answer from the speech-to-text server which needs to be
     *                 formatted
     * @return {Array<Word>} an array of Word objects
     */
    formatResponse(response: any): Array<any>;
    /**
     * Abstract method which will verify that the response from the server is valid
     *
     * @param response the response from the server
     * @return {boolean} true if response is valid, false otherwise
     */
    verify(response: any): boolean;
}
