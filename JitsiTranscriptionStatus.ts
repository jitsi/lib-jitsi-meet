export enum JitsiTranscriptionStatus {
    /**
     * The transcription is on.
     *
     * @type {String}
     */
    ON = 'on',

    /**
     * The transcription is off.
     *
     * @type {String}
     */
    OFF = 'off'
}

// exported for backward compatibility
export const ON = JitsiTranscriptionStatus.ON;
export const OFF = JitsiTranscriptionStatus.OFF;
