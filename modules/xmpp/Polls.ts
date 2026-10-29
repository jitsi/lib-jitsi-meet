import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import ChatRoom from './ChatRoom';
import XMPP from './xmpp';

export const COMMAND_ANSWER_POLL = 'answer-poll';
export const COMMAND_NEW_POLL = 'new-poll';
export const COMMAND_OLD_POLLS = 'old-polls';

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
     * Sends answers for a poll.
     *
     * @param pollId
     * @param answers
     */
    answerPoll(pollId: string, answers: Array<boolean>) {
        this._mainRoom.sendPrivateMessage(
            this._xmpp.pollsComponentAddress,
            JSON.stringify({
                answers,
                command: COMMAND_ANSWER_POLL,
                pollId,
                type: 'polls'
            }),
            'json-message',
            true);
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
        }
    }
}
