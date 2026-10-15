import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import Polls, { COMMAND_ANSWER_POLL, COMMAND_NEW_POLL } from './Polls';

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
    it('createPoll sends no options when none are given', () => {
        const { room, sent } = createRoom();
        const polls = new Polls(room as any);

        polls.createPoll('poll1', 'Question?', [ { name: 'A' }, { name: 'B' } ]);

        expect(sent.length).toBe(1);
        expect(sent[0].to).toBe('polls.example.com');
        expect(JSON.parse(sent[0].body)).toEqual({
            answers: [ { name: 'A' }, { name: 'B' } ],
            command: COMMAND_NEW_POLL,
            pollId: 'poll1',
            question: 'Question?',
            type: 'polls'
        });
    });

    it('createPoll sends singleAnswer when it is set', () => {
        const { room, sent } = createRoom();
        const polls = new Polls(room as any);

        polls.createPoll('poll1', 'Question?', [ { name: 'A' }, { name: 'B' } ], { singleAnswer: true });

        expect(JSON.parse(sent[0].body).singleAnswer).toBe(true);
    });

    it('createPoll does not send singleAnswer when it is false', () => {
        const { room, sent } = createRoom();
        const polls = new Polls(room as any);

        polls.createPoll('poll1', 'Question?', [ { name: 'A' }, { name: 'B' } ], { singleAnswer: false });

        expect('singleAnswer' in JSON.parse(sent[0].body)).toBe(false);
    });

    it('passes singleAnswer of a received poll through to the event', () => {
        const { room } = createRoom();
        const polls = new Polls(room as any);
        const payload = {
            answers: [ { name: 'A' } ],
            command: COMMAND_NEW_POLL,
            pollId: 'poll1',
            question: 'Question?',
            singleAnswer: true
        };

        polls._handleMessages(payload);

        expect(room.eventEmitter.emit).toHaveBeenCalledWith(XMPPEvents.POLLS_RECEIVE_EVENT, payload);
    });

    it('answerPoll sends the answers', () => {
        const { room, sent } = createRoom();
        const polls = new Polls(room as any);

        polls.answerPoll('poll1', [ false, true ]);

        expect(JSON.parse(sent[0].body)).toEqual({
            answers: [ false, true ],
            command: COMMAND_ANSWER_POLL,
            pollId: 'poll1',
            type: 'polls'
        });
    });
});
