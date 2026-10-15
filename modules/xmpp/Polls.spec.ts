import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import Polls, { COMMAND_CLOSE_POLL } from './Polls';

/**
 * Creates the minimal room that {@link Polls} uses and records the messages sent through it.
 *
 * @returns {Object} The room and the list of sent message bodies.
 */
function createRoom() {
    const sent: Array<{ body: string; to: string; }> = [];
    const room = {
        eventEmitter: { emit: jasmine.createSpy('emit') },
        sendPrivateMessage: (to: string, body: string) => sent.push({ body,
            to }),
        xmpp: {
            addListener: jasmine.createSpy('addListener'),
            pollsComponentAddress: 'polls.example.com',
            removeListener: jasmine.createSpy('removeListener')
        }
    };

    return { room,
        sent };
}

describe('Polls', () => {
    it('closePoll sends a close-poll message', () => {
        const { room, sent } = createRoom();
        const polls = new Polls(room as any);

        polls.closePoll('poll1');

        expect(sent.length).toBe(1);
        expect(sent[0].to).toBe('polls.example.com');
        expect(JSON.parse(sent[0].body)).toEqual({
            command: COMMAND_CLOSE_POLL,
            pollId: 'poll1',
            type: 'polls'
        });
    });

    it('emits the close event for a received close-poll message', () => {
        const { room } = createRoom();
        const polls = new Polls(room as any);
        const payload = {
            command: COMMAND_CLOSE_POLL,
            pollId: 'poll1',
            senderId: 'abcd'
        };

        polls._handleMessages(payload);

        expect(room.eventEmitter.emit).toHaveBeenCalledWith(XMPPEvents.POLLS_CLOSE_EVENT, payload);
    });
});
