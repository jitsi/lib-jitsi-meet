import JitsiConference from '../../JitsiConference';

import { ReceiverAudioController } from './ReceiveAudioController';
import { SyntheticAudioService } from './SyntheticAudioSubscription';

describe('/modules/qualitycontrol/ReceiveAudioController', () => {
    let controller: ReceiverAudioController;
    let sent: any[];

    beforeEach(() => {
        sent = [];
        const conference = {
            rtc: {
                sendReceiverAudioSubscriptionMessage: (message: any) => sent.push(message)
            }
        } as unknown as JitsiConference;

        controller = new ReceiverAudioController(conference);
    });

    describe('synthetic subscriptions (per-service co-existence)', () => {
        it('sends the union of two services\' sources', () => {
            controller.getSyntheticSubscription(SyntheticAudioService.AUDIO_TRANSLATION)
                .setSources([ 'aaaaaaaa-a0.en' ]);
            controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS)
                .setSources([ 'agent001-a0' ]);

            expect(sent.length).toBe(2);
            expect(sent[1].all).toBe(true);
            expect(sent[1].include.sort()).toEqual([ 'aaaaaaaa-a0.en', 'agent001-a0' ]);
        });

        it('one service\'s change never clobbers the other\'s sources', () => {
            controller.getSyntheticSubscription(SyntheticAudioService.AUDIO_TRANSLATION)
                .setSources([ 'aaaaaaaa-a0.en', 'bbbbbbbb-a0.en' ]);
            controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS)
                .setSources([ 'agent001-a0' ]);

            controller.getSyntheticSubscription(SyntheticAudioService.AUDIO_TRANSLATION).clear();

            const last = sent[sent.length - 1];

            expect(last.include).toEqual([ 'agent001-a0' ]);
        });

        it('reports each service\'s own sources through its handle', () => {
            controller.getSyntheticSubscription(SyntheticAudioService.AUDIO_TRANSLATION)
                .setSources([ 'aaaaaaaa-a0.en' ]);
            controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS)
                .setSources([ 'agent001-a0' ]);

            expect(controller.getSyntheticSubscription(SyntheticAudioService.AUDIO_TRANSLATION).sources)
                .toEqual([ 'aaaaaaaa-a0.en' ]);
            expect(controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS).sources)
                .toEqual([ 'agent001-a0' ]);
        });

        it('does not re-send when a service sets an unchanged source list', () => {
            const subscription = controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS);

            subscription.setSources([ 'agent001-a0' ]);
            subscription.setSources([ 'agent001-a0' ]);

            expect(sent.length).toBe(1);
        });

        it('returns the same handle for repeated lookups of a service', () => {
            expect(controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS))
                .toBe(controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS));
        });

        it('preserves synthetic subscriptions across a base-include change', () => {
            controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS)
                .setSources([ 'agent001-a0' ]);
            controller.setAudioSubscriptionMode({ all: true, exclude: [], include: [ 'cccccccc-a0' ] });

            const last = sent[sent.length - 1];

            expect(last.include.sort()).toEqual([ 'agent001-a0', 'cccccccc-a0' ]);
        });

        it('preserves synthetic subscriptions across a remote-audio mute/unmute cycle', () => {
            controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS)
                .setSources([ 'agent001-a0' ]);
            controller.muteRemoteAudio(true);
            controller.muteRemoteAudio(false);

            const last = sent[sent.length - 1];

            expect(last.all).toBe(true);
            expect(last.include).toEqual([ 'agent001-a0' ]);
        });

        it('exposes the effective union through the audioSubscription getter', () => {
            controller.getSyntheticSubscription(SyntheticAudioService.VOICE_AGENTS)
                .setSources([ 'agent001-a0' ]);
            controller.getSyntheticSubscription(SyntheticAudioService.AUDIO_TRANSLATION)
                .setSources([ 'aaaaaaaa-a0.en' ]);

            expect(controller.audioSubscription.include.sort())
                .toEqual([ 'aaaaaaaa-a0.en', 'agent001-a0' ]);
        });
    });
});
