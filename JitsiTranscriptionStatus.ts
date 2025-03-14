export enum JitsiTranscriptionStatus {

    /**
     * The transcription is off.
     */
    OFF = 'OFF',

    /**
     * The transcription is on.
     */
    ON = 'ON'
}

// exported for backward compatibility
export const ON = JitsiTranscriptionStatus.ON;
export const OFF = JitsiTranscriptionStatus.OFF;
