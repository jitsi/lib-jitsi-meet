import * as exported from "./DetectionEvents";

// this test is brittle on purpose because it's designed to ensure that the TypeScript conversion maintains backward compatibility

describe( "/modules/detection/DetectionEvents members", () => {
    const {
        DetectionEvents,
        ...others
    } = exported;

    it( "known members", () => {
        expect( DetectionEvents ).toBeDefined();

        expect( DetectionEvents.DETECTOR_STATE_CHANGE ).toBe( 'detector_state_change' );
        expect( DetectionEvents.AUDIO_INPUT_STATE_CHANGE ).toBe( 'audio_input_state_changed' );
        expect( DetectionEvents.NO_AUDIO_INPUT ).toBe( 'no_audio_input_detected' );
        expect( DetectionEvents.VAD_NOISY_DEVICE ).toBe( 'detection.vad_noise_device' );
        expect( DetectionEvents.VAD_REPORT_PUBLISHED ).toBe( 'vad-report-published' );
        expect( DetectionEvents.VAD_SCORE_PUBLISHED ).toBe( 'detection.vad_score_published' );
        expect( DetectionEvents.VAD_TALK_WHILE_MUTED ).toBe( 'detection.vad_talk_while_muted' );
    } );

    it( "unknown members", () => {
        const keys = Object.keys( others );
        expect( keys ).withContext( `Extra members: ${ keys.join( ", " ) }` ).toEqual( [] );
    } );
} );