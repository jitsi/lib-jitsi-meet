import {
    isSyntheticSourceName,
    isTranslatedSourceName,
    isVoiceAgentEndpointId
} from './SignalingLayer';

describe('/service/RTC/SignalingLayer', () => {
    describe('isTranslatedSourceName', () => {
        it('matches a translated source (has a language suffix)', () => {
            expect(isTranslatedSourceName('endpointA-a0.en')).toBe(true);
        });

        it('does not match a regular source', () => {
            expect(isTranslatedSourceName('endpointA-a0')).toBe(false);
        });

        it('handles null/undefined', () => {
            expect(isTranslatedSourceName(undefined)).toBe(false);
            expect(isTranslatedSourceName(null)).toBe(false);
        });
    });

    describe('isVoiceAgentEndpointId', () => {
        it('matches an agent endpoint id', () => {
            expect(isVoiceAgentEndpointId('agent-0dae1739')).toBe(true);
        });

        it('matches an agent source name (inherits the prefix)', () => {
            expect(isVoiceAgentEndpointId('agent-0dae1739-a0')).toBe(true);
        });

        it('does not match a real endpoint id', () => {
            expect(isVoiceAgentEndpointId('1a2b3c4d')).toBe(false);
        });

        it('handles null/undefined', () => {
            expect(isVoiceAgentEndpointId(undefined)).toBe(false);
            expect(isVoiceAgentEndpointId(null)).toBe(false);
        });
    });

    describe('isSyntheticSourceName', () => {
        it('matches a translated source', () => {
            expect(isSyntheticSourceName('endpointA-a0.en')).toBe(true);
        });

        it('matches a voice-agent source', () => {
            expect(isSyntheticSourceName('agent-0dae1739-a0')).toBe(true);
        });

        it('does not match a regular participant source', () => {
            expect(isSyntheticSourceName('endpointA-a0')).toBe(false);
        });
    });
});
