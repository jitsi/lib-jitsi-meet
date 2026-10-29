import JitsiConference from '../../JitsiConference';
import { SyntheticAudioService } from '../../service/RTC/ReceiverAudioSubscription';

import { ReceiverAudioController } from './ReceiveAudioController';

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
            controller.setServiceIncludes(SyntheticAudioService.AUDIO_TRANSLATION, [ 'aaaaaaaa-a0.en' ]);
            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);

            expect(sent.length).toBe(2);
            expect(sent[1].all).toBe(true);
            expect(sent[1].include.sort()).toEqual([ 'aaaaaaaa-a0.en', 'agent001-a0' ]);
        });

        it('one service\'s change never clobbers the other\'s sources', () => {
            controller.setServiceIncludes(SyntheticAudioService.AUDIO_TRANSLATION, [ 'aaaaaaaa-a0.en', 'bbbbbbbb-a0.en' ]);
            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);

            controller.setServiceIncludes(SyntheticAudioService.AUDIO_TRANSLATION, []);

            const last = sent[sent.length - 1];

            expect(last.include).toEqual([ 'agent001-a0' ]);
        });

        it('reports each service\'s own sources', () => {
            controller.setServiceIncludes(SyntheticAudioService.AUDIO_TRANSLATION, [ 'aaaaaaaa-a0.en' ]);
            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);

            expect(controller.getServiceIncludes(SyntheticAudioService.AUDIO_TRANSLATION))
                .toEqual([ 'aaaaaaaa-a0.en' ]);
            expect(controller.getServiceIncludes(SyntheticAudioService.VOICE_AGENTS))
                .toEqual([ 'agent001-a0' ]);
        });

        it('does not re-send when a service sets an unchanged source list', () => {
                        controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);
            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);

            expect(sent.length).toBe(1);
        });


        it('preserves synthetic subscriptions across a base-include change', () => {
            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);
            controller.setAudioSubscriptionMode({ all: true, exclude: [], include: [ 'cccccccc-a0' ] });

            const last = sent[sent.length - 1];

            expect(last.include.sort()).toEqual([ 'agent001-a0', 'cccccccc-a0' ]);
        });

        it('preserves synthetic subscriptions across a remote-audio mute/unmute cycle', () => {
            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);
            controller.muteRemoteAudio(true);
            controller.muteRemoteAudio(false);

            const last = sent[sent.length - 1];

            expect(last.all).toBe(true);
            expect(last.include).toEqual([ 'agent001-a0' ]);
        });

        it('exposes the effective union through the audioSubscription getter', () => {
            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);
            controller.setServiceIncludes(SyntheticAudioService.AUDIO_TRANSLATION, [ 'aaaaaaaa-a0.en' ]);

            expect(controller.audioSubscription.include.sort())
                .toEqual([ 'aaaaaaaa-a0.en', 'agent001-a0' ]);
        });
    });

    describe('hasSyntheticIncludes', () => {
        it('is false until a service subscribes to synthetic sources', () => {
            expect(controller.hasSyntheticIncludes()).toBe(false);

            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);

            expect(controller.hasSyntheticIncludes()).toBe(true);
        });

        it('stays true until every service has cleared its sources', () => {
            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, [ 'agent001-a0' ]);
            controller.setServiceIncludes(SyntheticAudioService.AUDIO_TRANSLATION, [ 'aaaaaaaa-a0.en' ]);
            controller.setServiceIncludes(SyntheticAudioService.VOICE_AGENTS, []);

            expect(controller.hasSyntheticIncludes()).toBe(true);

            controller.setServiceIncludes(SyntheticAudioService.AUDIO_TRANSLATION, []);

            expect(controller.hasSyntheticIncludes()).toBe(false);
        });

        it('ignores the base include set', () => {
            controller.setAudioSubscriptionMode({ all: true, exclude: [], include: [ 'cccccccc-a0' ] });

            expect(controller.hasSyntheticIncludes()).toBe(false);
        });
    });
});
