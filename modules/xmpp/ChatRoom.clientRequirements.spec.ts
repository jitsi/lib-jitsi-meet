import { $iq } from 'strophe.js';

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import ChatRoom from './ChatRoom';

const ROOM_JID = 'room@conference.example.com';
const FOCUS_JID = `${ROOM_JID}/focus`;

/* eslint-disable newline-per-chained-call */

describe('ChatRoom.onClientRequirements', () => {
    let emitted: any[];
    let room: any;

    /**
     * Builds a client-requirements IQ.
     *
     * @param {string} action - The action attribute.
     * @param {Array} features - The missing features to add.
     * @param {string} from - The sender.
     * @returns {Element}
     */
    function createIq(action: string, features: any[], from = FOCUS_JID) {
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
        room = Object.create(ChatRoom.prototype);
        room.focusMucJid = FOCUS_JID;
        room.eventEmitter = {
            emit: (...args: any[]) => emitted.push(args)
        };
    });

    it('emits an event with the missing features', () => {
        room.onClientRequirements(createIq('reject', [ {
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
        room.onClientRequirements(createIq('warn', [ {
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

    it('ignores an IQ from another occupant', () => {
        room.onClientRequirements(createIq('reject', [ {
            'level': 'hard',
            'var': 'feature-1'
        } ], `${ROOM_JID}/attacker`));

        expect(emitted.length).toBe(0);
    });

    it('ignores an IQ from the bare room JID', () => {
        room.onClientRequirements(createIq('reject', [ {
            'level': 'hard',
            'var': 'feature-1'
        } ], ROOM_JID));

        expect(emitted.length).toBe(0);
    });

    it('ignores an IQ when the focus is not known yet', () => {
        room.focusMucJid = null;
        room.onClientRequirements(createIq('reject', [ {
            'level': 'hard',
            'var': 'feature-1'
        } ]));

        expect(emitted.length).toBe(0);
    });

    it('ignores an IQ with no action', () => {
        const iq = createIq('reject', [ {
            'level': 'hard',
            'var': 'feature-1'
        } ]);

        iq.querySelector('client-requirements')?.removeAttribute('action');
        room.onClientRequirements(iq);

        expect(emitted.length).toBe(0);
    });

    it('ignores an IQ with an unknown action', () => {
        room.onClientRequirements(createIq('somethingNew', [ {
            'level': 'hard',
            'var': 'feature-1'
        } ]));

        expect(emitted.length).toBe(0);
    });

    it('ignores a missing-feature with no var or level', () => {
        room.onClientRequirements(createIq('warn', [ {
            'level': 'soft'
        }, {
            'var': 'feature-2'
        }, {
            'level': 'soft',
            'var': 'feature-3'
        } ]));

        expect(emitted.length).toBe(1);
        expect(emitted[0][1].features.length).toBe(1);
        expect(emitted[0][1].features[0].feature).toBe('feature-3');
    });

    it('ignores an IQ when no missing-feature is valid', () => {
        room.onClientRequirements(createIq('reject', [ { 'level': 'hard' } ]));

        expect(emitted.length).toBe(0);
    });

    it('ignores an IQ with no missing-feature elements', () => {
        room.onClientRequirements(createIq('warn', []));

        expect(emitted.length).toBe(0);
    });

    it('ignores an IQ with no client-requirements element', () => {
        room.onClientRequirements($iq({
            from: FOCUS_JID,
            type: 'set'
        }).tree());

        expect(emitted.length).toBe(0);
    });
});
