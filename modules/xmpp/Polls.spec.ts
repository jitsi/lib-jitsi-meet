import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import Polls, { COMMAND_ANSWER_POLL, COMMAND_CLOSE_POLL, COMMAND_NEW_POLL, POLLS_REPLY_TIMEOUT } from './Polls';

/**
 * Creates the minimal room that {@link Polls} uses and records the messages sent through it.
 *
 * @returns {Object} The room, the list of sent messages and a function that delivers a stanza to the handlers.
 */
function createRoom() {
    const sent: Array<{ body: string; id?: string; to: string; }> = [];
    const handlers = new Set<{ callback: (msg: Element) => boolean; id: string; }>();
    const room = {
        connection: {
            addHandler: (callback: (msg: Element) => boolean, _ns: null, _name: string, _type: string, id: string) => {
                const handler = { callback,
                    id };

                handlers.add(handler);

                return handler;
            },
            deleteHandler: (handler: { callback: (msg: Element) => boolean; id: string; }) => handlers.delete(handler)
        },
        eventEmitter: { emit: jasmine.createSpy('emit') },
        sendPrivateMessage: (
                to: string, body: string, _el: string, _direct: boolean, _replyTo: undefined, id?: string) =>
            sent.push({ body,
                id,
                to }),
        xmpp: {
            addListener: jasmine.createSpy('addListener'),
            pollsComponentAddress: 'polls.example.com',
            removeListener: jasmine.createSpy('removeListener')
        }
    };

    /**
     * Delivers an error reply from the polls component to the handler waiting for the given id.
     *
     * @param {string} id - The id of the rejected message.
     * @param {string} condition - The error condition.
     * @returns {void}
     */
    function replyWithError(id: string, condition: string) {
        const msg = new DOMParser().parseFromString(
            `<message type="error" id="${id}"><error type="cancel"><${condition} `
                + 'xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></message>', 'text/xml').documentElement;

        for (const handler of handlers) {
            if (handler.id === id && !handler.callback(msg)) {
                handlers.delete(handler);
            }
        }
    }

    return { handlers,
        replyWithError,
        room,
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

    it('createPoll sends the poll without singleAnswer when options is null', () => {
        const { room, sent } = createRoom();
        const polls = new Polls(room as any);

        polls.createPoll('poll1', 'Question?', [ { name: 'A' }, { name: 'B' } ], null as any);

        expect(sent.length).toBe(1);
        expect('singleAnswer' in JSON.parse(sent[0].body)).toBe(false);
    });

    it('createPoll sends singleAnswer only when it is true', () => {
        const { room, sent } = createRoom();
        const polls = new Polls(room as any);

        polls.createPoll('poll1', 'Question?', [ { name: 'A' }, { name: 'B' } ], { singleAnswer: 'false' } as any);
        polls.createPoll('poll2', 'Question?', [ { name: 'A' }, { name: 'B' } ], { singleAnswer: 1 } as any);

        expect(sent.length).toBe(2);
        expect(sent.some(({ body }) => 'singleAnswer' in JSON.parse(body))).toBe(false);
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

    describe('replies of the polls component', () => {
        beforeEach(() => jasmine.clock().install());
        afterEach(() => jasmine.clock().uninstall());

        it('rejects closePoll with the condition of the error reply', async () => {
            const { handlers, replyWithError, room, sent } = createRoom();
            const polls = new Polls(room as any);
            const result = polls.closePoll('poll1');

            replyWithError(sent[0].id, 'not-allowed');

            await expectAsync(result).toBeRejectedWithError('not-allowed');
            expect(handlers.size).toBe(0);
        });

        it('rejects answerPoll with the condition of the error reply', async () => {
            const { replyWithError, room, sent } = createRoom();
            const polls = new Polls(room as any);
            const result = polls.answerPoll('poll1', [ true ]);

            replyWithError(sent[0].id, 'not-allowed');

            await expectAsync(result).toBeRejectedWithError('not-allowed');
        });

        it('ignores an error reply to another message', async () => {
            const { replyWithError, room, sent } = createRoom();
            const polls = new Polls(room as any);
            const first = polls.closePoll('poll1');

            const second = polls.closePoll('poll2');

            replyWithError(sent[1].id, 'not-allowed');
            jasmine.clock().tick(POLLS_REPLY_TIMEOUT);

            await expectAsync(first).toBeResolved();
            await expectAsync(second).toBeRejectedWithError('not-allowed');
        });

        it('resolves and removes its handler when there is no error reply in time', async () => {
            const { handlers, room } = createRoom();
            const polls = new Polls(room as any);
            const result = polls.closePoll('poll1');

            expect(handlers.size).toBe(1);
            jasmine.clock().tick(POLLS_REPLY_TIMEOUT);

            await expectAsync(result).toBeResolved();
            expect(handlers.size).toBe(0);
        });

        it('sends each message with its own id', () => {
            const { room, sent } = createRoom();
            const polls = new Polls(room as any);

            polls.closePoll('poll1');
            polls.answerPoll('poll1', [ true ]);

            expect(sent[0].id).toBeTruthy();
            expect(sent[1].id).toBeTruthy();
            expect(sent[0].id).not.toBe(sent[1].id);
        });
    });
});
