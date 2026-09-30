import SignalingLayer, {
    isSyntheticSourceKind,
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

    describe('isSyntheticSourceKind', () => {
        it('accepts the two kinds the bridge signals', () => {
            expect(isSyntheticSourceKind('agent')).toBe(true);
            expect(isSyntheticSourceKind('translation')).toBe(true);
        });

        it('rejects anything else', () => {
            expect(isSyntheticSourceKind('bot')).toBe(false);
            expect(isSyntheticSourceKind('')).toBe(false);
            expect(isSyntheticSourceKind(1)).toBe(false);
            expect(isSyntheticSourceKind(undefined)).toBe(false);
            expect(isSyntheticSourceKind(null)).toBe(false);
        });
    });

    describe('synthetic source kind store', () => {
        let signalingLayer: SignalingLayer;

        beforeEach(() => {
            signalingLayer = new SignalingLayer();
        });

        it('returns the recorded kind', () => {
            signalingLayer.setSyntheticSourceKind('agent-0dae1739-a0', 'agent');
            signalingLayer.setSyntheticSourceKind('endpointA-a0.en', 'translation');

            expect(signalingLayer.getSyntheticSourceKind('agent-0dae1739-a0')).toBe('agent');
            expect(signalingLayer.getSyntheticSourceKind('endpointA-a0.en')).toBe('translation');
        });

        it('returns undefined for sources without a recorded kind, whatever their name', () => {
            expect(signalingLayer.getSyntheticSourceKind('endpointA-a0')).toBeUndefined();
            expect(signalingLayer.getSyntheticSourceKind('endpointA-a0.en')).toBeUndefined();
            expect(signalingLayer.getSyntheticSourceKind('agent-0dae1739-a0')).toBeUndefined();
            expect(signalingLayer.getSyntheticSourceKind(undefined)).toBeUndefined();
            expect(signalingLayer.getSyntheticSourceKind(null)).toBeUndefined();
        });

        it('isSyntheticSource: a recorded kind wins over the name', () => {
            // Neither a language suffix nor the agent- prefix: only the bridge-signaled kind marks it synthetic.
            signalingLayer.setSyntheticSourceKind('bot12345-a0', 'agent');

            expect(signalingLayer.isSyntheticSource('bot12345-a0')).toBe(true);
        });

        it('isSyntheticSource: falls back to the name heuristics when no kind was recorded', () => {
            expect(signalingLayer.isSyntheticSource('endpointA-a0.en')).toBe(true);
            expect(signalingLayer.isSyntheticSource('agent-0dae1739-a0')).toBe(true);
            expect(signalingLayer.isSyntheticSource('endpointA-a0')).toBe(false);
            expect(signalingLayer.isSyntheticSource(undefined)).toBe(false);
            expect(signalingLayer.isSyntheticSource(null)).toBe(false);
        });

        it('forgets only the given sources', () => {
            signalingLayer.setSyntheticSourceKind('endpointA-a0.en', 'translation');
            signalingLayer.setSyntheticSourceKind('agent-0dae1739-a0', 'agent');

            signalingLayer.removeSyntheticSourceKinds([ 'endpointA-a0.en', 'never-recorded-a0' ]);

            expect(signalingLayer.getSyntheticSourceKind('endpointA-a0.en')).toBeUndefined();
            expect(signalingLayer.getSyntheticSourceKind('agent-0dae1739-a0')).toBe('agent');
        });

        it('forgets every source on clear', () => {
            signalingLayer.setSyntheticSourceKind('endpointA-a0.en', 'translation');
            signalingLayer.setSyntheticSourceKind('agent-0dae1739-a0', 'agent');

            signalingLayer.clearSyntheticSourceKinds();

            expect(signalingLayer.getSyntheticSourceKind('endpointA-a0.en')).toBeUndefined();
            expect(signalingLayer.getSyntheticSourceKind('agent-0dae1739-a0')).toBeUndefined();
        });
    });
});
