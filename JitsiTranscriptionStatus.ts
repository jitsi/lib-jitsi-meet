export enum JitsiTranscriptionStatus {
    /**
     * The transcription is on.
     */
    ON = 'on',

    /**
     * The transcription is off.
     */
    OFF = 'off'
}

// exported for backward compatibility
export const ON = JitsiTranscriptionStatus.ON;
export const OFF = JitsiTranscriptionStatus.OFF;
