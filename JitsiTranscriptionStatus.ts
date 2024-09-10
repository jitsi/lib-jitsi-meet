export enum JitsiTranscriptionStatus {
    /**
     * The transcription is on.
     */
    ON = 'ON',

    /**
     * The transcription is off.
     */
    OFF = 'OFF'
}

// exported for backward compatibility
export const ON = JitsiTranscriptionStatus.ON;
export const OFF = JitsiTranscriptionStatus.OFF;
