import { EventEmitter } from 'events';

import { RTCEvents } from '../../service/RTC/RTCEvents';

import BridgeChannel from './BridgeChannel';

describe('BridgeChannel', () => {
    let bridgeChannel: BridgeChannel;
    let channel: any;
    let emitter: EventEmitter;
    let received: any[];

    /**
     * Delivers a bridge message over the fake data channel.
     *
     * @param {object} message - The colibri message.
     * @returns {void}
     */
    function receive(message: object): void {
        channel.onmessage({ data: JSON.stringify(message) });
    }

    beforeEach(() => {
        emitter = new EventEmitter();
        received = [];

        // The peerconnection hands out a bare object, so the handlers BridgeChannel installs on it can be
        // driven directly.
        const peerconnection = {
            createDataChannel: () => {
                channel = {};

                return channel;
            }
        };

        bridgeChannel = new BridgeChannel(peerconnection as any, null, emitter, {} as any);
    });

    it('uses the data channel mode', () => {
        expect(bridgeChannel.mode).toBe('datachannel');
    });

    describe('SyntheticSourceSendingChangeEvent', () => {
        const event = {
            colibriClass: 'SyntheticSourceSendingChangeEvent',
            sending: true,
            sourceName: 'agent-0dae1739-a0',
            timestamp: 480000
        };

        beforeEach(() => {
            emitter.on(RTCEvents.TRANSLATED_SOURCE_SENDING_CHANGED, change => received.push(change));
        });

        it('forwards the kind when the bridge sends one', () => {
            receive({ ...event, kind: 'agent' });

            expect(received).toEqual([ {
                kind: 'agent',
                sending: true,
                sourceName: 'agent-0dae1739-a0',
                timestamp: 480000
            } ]);
        });

        it('omits the kind when the bridge does not send one', () => {
            receive(event);

            expect(received.length).toBe(1);
            expect('kind' in received[0]).toBe(false);
            expect(received[0]).toEqual({
                sending: true,
                sourceName: 'agent-0dae1739-a0',
                timestamp: 480000
            });
        });

        it('drops an unknown kind but still forwards the event', () => {
            receive({ ...event, kind: 'bot' });

            expect(received.length).toBe(1);
            expect('kind' in received[0]).toBe(false);
        });

        it('drops a malformed event', () => {
            receive({ ...event, kind: 'agent', sending: 'yes' });

            expect(received).toEqual([]);
        });
    });

    describe('AudioSourcesMap', () => {
        it('is forwarded whole, including the per-source kinds', () => {
            const message = {
                colibriClass: 'AudioSourcesMap',
                mappedSources: [
                    { kind: 'translation', owner: 'abcdef12', rtx: '-1', source: 'abcdef12-a0.en', ssrc: 1234 },
                    { owner: 'abcdef12', rtx: '-1', source: 'abcdef12-a0', ssrc: 5678 }
                ]
            };

            emitter.on(RTCEvents.AUDIO_SSRCS_REMAPPED, msg => received.push(msg));
            receive(message);

            expect(received).toEqual([ message ]);
        });
    });
});
