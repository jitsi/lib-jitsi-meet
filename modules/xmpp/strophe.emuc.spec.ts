import { $iq } from 'strophe.js';

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import MucConnectionPlugin from './strophe.emuc';

const ROOM_JID = 'room@conference.example.com';

/* eslint-disable newline-per-chained-call */

describe('MucConnectionPlugin', () => {
    describe('onClientRequirements', () => {
        let emitted: any[];
        let plugin: any;

        /**
         * Builds a client-requirements IQ.
         *
         * @param {string} action - The action attribute.
         * @param {Array} features - The missing features to add.
         * @param {string} from - The 'from' attribute.
         * @returns {Element}
         */
        function createIq(action: string, features: any[], from = `${ROOM_JID}/focus`) {
            const iq = $iq({
                from,
                to: `${ROOM_JID}/abcdabcd`,
                type: 'set'
            }).c('client-requirements', {
                action,
                xmlns: 'jitsi:client-requirements'
            });

            features.forEach(feature => {
                iq.c('missing-feature', feature).up();
            });

            return iq.tree();
        }

        beforeEach(() => {
            emitted = [];
            plugin = new MucConnectionPlugin({
                eventEmitter: {
                    emit: (...args: any[]) => emitted.push(args)
                }
            } as any);
            plugin.rooms[ROOM_JID] = {};
        });

        it('emits an event with the missing features', () => {
            plugin.onClientRequirements(createIq('reject', [ {
                'details': 'Update the app.',
                'level': 'hard',
                'name': 'SSRC_REWRITING_V1',
                'url': 'https://example.com',
                'var': 'http://jitsi.org/ssrc-rewriting-1'
            } ]));

            expect(emitted.length).toBe(1);
            expect(emitted[0][0]).toBe(XMPPEvents.CLIENT_REQUIREMENTS_RECEIVED);
            expect(emitted[0][1]).toEqual({
                action: 'reject',
                features: [ {
                    details: 'Update the app.',
                    feature: 'http://jitsi.org/ssrc-rewriting-1',
                    level: 'hard',
                    name: 'SSRC_REWRITING_V1',
                    url: 'https://example.com'
                } ]
            });
        });

        it('handles multiple missing features and missing optional attributes', () => {
            plugin.onClientRequirements(createIq('warn', [ {
                'level': 'soft',
                'var': 'feature-1'
            }, {
                'level': 'soft',
                'name': 'FEATURE_2',
                'var': 'feature-2'
            } ]));

            expect(emitted.length).toBe(1);
            expect(emitted[0][1].action).toBe('warn');
            expect(emitted[0][1].features.length).toBe(2);
            expect(emitted[0][1].features[0]).toEqual({
                details: undefined,
                feature: 'feature-1',
                level: 'soft',
                name: undefined,
                url: undefined
            });
            expect(emitted[0][1].features[1].name).toBe('FEATURE_2');
        });

        it('ignores an IQ for an unknown room', () => {
            plugin.onClientRequirements(createIq('reject', [ {
                'level': 'hard',
                'var': 'feature-1'
            } ], 'other-room@conference.example.com/focus'));

            expect(emitted.length).toBe(0);
        });

        it('ignores an IQ with no client-requirements element', () => {
            plugin.onClientRequirements($iq({
                from: `${ROOM_JID}/focus`,
                type: 'set'
            }).tree());

            expect(emitted.length).toBe(0);
        });
    });
});
