import { getLogger } from '@jitsi/logger';
import { v4 as uuidv4 } from 'uuid';

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import { getFirstChildElement, getText } from '../util/XMLUtils';

import ChatRoom from './ChatRoom';
import XMPP from './xmpp';

export const COMMAND_ANSWER_POLL = 'answer-poll';
export const COMMAND_CLOSE_POLL = 'close-poll';
export const COMMAND_NEW_POLL = 'new-poll';
export const COMMAND_OLD_POLLS = 'old-polls';

/**
 * How long to wait for an error reply from the polls component. It does not acknowledge an accepted message, so
 * one that is not rejected within this time is taken as accepted.
 */
export const POLLS_REPLY_TIMEOUT = 5000;

const logger = getLogger('xmpp:Polls');

/**
 * Options of a new poll.
 */
export interface IPollOptions {

    /**
     * Whether a voter can choose only one answer. When not set, a voter can choose any number of answers.
     */
    singleAnswer?: boolean;
}

export default class Polls {
    private _mainRoom: ChatRoom;
    private _xmpp: XMPP;

    /**
     * Constructs polls for a room.
     *
     * @param {ChatRoom} room the main room.
     */
    constructor(room: ChatRoom) {
        this._mainRoom = room;
        this._xmpp = room.xmpp;

        this._handleMessages = this._handleMessages.bind(this);
        this._mainRoom.xmpp.addListener(XMPPEvents.POLLS_EVENT, this._handleMessages);
    }

    /**
     * Whether polls is supported on backend.
     *
     * @returns {boolean} whether polls is supported on backend.
     */
    isSupported() {
        return Boolean(this._xmpp.pollsComponentAddress);
    }

    /**
     * Stops listening for events.
     */
    dispose() {
        this._mainRoom.xmpp.removeListener(XMPPEvents.POLLS_EVENT, this._handleMessages);
    }

    /**
     * Creates and sends a new poll.
     *
     * @param pollId
     * @param question
     * @param answers
     * @param options - The options of the poll.
     */
    createPoll(
            pollId: string,
            question: string,
            answers: Array<{ name: string; }>,
            options: IPollOptions = {}) {
        this._mainRoom.sendPrivateMessage(
            this._xmpp.pollsComponentAddress,
            JSON.stringify({
                answers: answers,
                command: COMMAND_NEW_POLL,
                pollId,
                question,

                // Only sent when set, so a poll without options keeps the message it had before.
                ...options?.singleAnswer === true ? { singleAnswer: true } : {},
                type: 'polls'
            }),
            'json-message',
            true);
    }

    /**
     * Closes a poll, thus it does not take answers anymore. The server accepts it from the creator of the poll and
     * from a moderator.
     *
     * @param pollId - The id of the poll.
     * @returns {Promise<void>} Rejected with the error condition (e.g. 'not-allowed' when the local participant is
     * neither the creator nor a moderator) when the polls component rejects the close, resolved otherwise. See
     * {@link POLLS_REPLY_TIMEOUT}.
     */
    closePoll(pollId: string): Promise<void> {
        return this._sendWithReply({
            command: COMMAND_CLOSE_POLL,
            pollId,
            type: 'polls'
        });
    }

    /**
     * Sends answers for a poll.
     *
     * @param pollId
     * @param answers
     * @returns {Promise<void>} Rejected with the error condition (e.g. 'not-allowed' for a closed poll) when the
     * polls component rejects the answers, resolved otherwise. See {@link POLLS_REPLY_TIMEOUT}.
     */
    answerPoll(pollId: string, answers: Array<boolean>): Promise<void> {
        return this._sendWithReply({
            answers,
            command: COMMAND_ANSWER_POLL,
            pollId,
            type: 'polls'
        });
    }

    /**
     * Sends a message to the polls component and waits for an error reply to it.
     *
     * @param data - The message.
     * @returns {Promise<void>} Rejected with the error condition of the reply, resolved when there is no reply
     * within {@link POLLS_REPLY_TIMEOUT}.
     */
    _sendWithReply(data: object): Promise<void> {
        const { connection } = this._mainRoom;
        const id = uuidv4();

        return new Promise((resolve, reject) => {
            const handler = connection.addHandler((msg: Element) => {
                const error = getFirstChildElement(msg, 'error');
                const condition = getFirstChildElement(error)?.tagName ?? 'undefined-condition';

                logger.warn(`The polls component rejected ${id}: ${condition} ${getText(getFirstChildElement(error, 'text'))}`);
                reject(new Error(condition));

                return false;
            }, null, 'message', 'error', id, this._xmpp.pollsComponentAddress);

            // After a rejection this resolves nothing and deletes a handler that is already gone.
            setTimeout(() => {
                connection.deleteHandler(handler);
                resolve();
            }, POLLS_REPLY_TIMEOUT);

            this._mainRoom.sendPrivateMessage(
                this._xmpp.pollsComponentAddress,
                JSON.stringify(data),
                'json-message',
                true,
                undefined,
                id);
        });
    }

    /**
     * Handles a message for polls.
     *
     * @param {object} payload - Arbitrary data.
     */
    _handleMessages(payload) {
        switch (payload.command) {
        case COMMAND_NEW_POLL:
            this._mainRoom.eventEmitter.emit(XMPPEvents.POLLS_RECEIVE_EVENT, payload);

            break;
        case COMMAND_OLD_POLLS: {
            payload?.polls?.forEach((poll: any) => {
                this._mainRoom.eventEmitter.emit(XMPPEvents.POLLS_RECEIVE_EVENT, {
                    history: true,
                    ...poll
                });
            });
            break;
        }
        case COMMAND_ANSWER_POLL: {
            this._mainRoom.eventEmitter.emit(XMPPEvents.POLLS_ANSWER_EVENT, payload);
            break;
        }
        case COMMAND_CLOSE_POLL: {
            this._mainRoom.eventEmitter.emit(XMPPEvents.POLLS_CLOSE_EVENT, payload);
            break;
        }
        }
    }
}
