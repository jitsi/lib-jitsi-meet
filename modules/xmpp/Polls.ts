import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import ChatRoom from './ChatRoom';
import XMPP from './xmpp';

export const COMMAND_ANSWER_POLL = 'answer-poll';
export const COMMAND_DELETE_POLL = 'delete-poll';
export const COMMAND_NEW_POLL = 'new-poll';
export const COMMAND_OLD_POLLS = 'old-polls';

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
     * Handles a message for polls.
     *
     * @param payload - The polls message payload.
     */
    private _handleMessages(payload: { [key: string]: unknown; command: string; polls?: Array<Record<string, unknown>>; }) {
        switch (payload.command) {
        case COMMAND_NEW_POLL: {
            this._mainRoom.eventEmitter.emit(XMPPEvents.POLLS_RECEIVE_EVENT, payload);

            break;
        }
        case COMMAND_OLD_POLLS: {
            payload?.polls?.forEach((poll: Record<string, unknown>) => {
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
        case COMMAND_DELETE_POLL: {
            this._mainRoom.eventEmitter.emit(XMPPEvents.POLLS_DELETE_EVENT, payload);
            break;
        }
        }
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
     * @param pollId - The unique poll identifier.
     * @param question - The poll question.
     * @param answers - The poll answer options.
     * @param multipleSelection - Whether voters can select multiple answers.
     */
    createPoll(pollId: string, question: string, answers: Array<{ name: string; }>, multipleSelection = false) {
        if (!this.isSupported()) {
            return;
        }

        this._mainRoom.sendPrivateMessage(
            this._xmpp.pollsComponentAddress!,
            JSON.stringify({
                answers,
                command: COMMAND_NEW_POLL,
                multipleSelection,
                pollId,
                question,
                type: 'polls'
            }),
            'json-message',
            true);
    }

    /**
     * Deletes a poll.
     *
     * @param pollId - The unique poll identifier.
     */
    deletePoll(pollId: string) {
        if (!this.isSupported()) {
            return;
        }

        this._mainRoom.sendPrivateMessage(
            this._xmpp.pollsComponentAddress!,
            JSON.stringify({
                command: COMMAND_DELETE_POLL,
                pollId,
                type: 'polls'
            }),
            'json-message',
            true);
    }

    /**
     * Sends answers for a poll.
     *
     * @param pollId - The unique poll identifier.
     * @param answers - Array of boolean values for each answer option.
     */
    answerPoll(pollId: string, answers: Array<boolean>) {
        if (!this.isSupported()) {
            return;
        }

        this._mainRoom.sendPrivateMessage(
            this._xmpp.pollsComponentAddress!,
            JSON.stringify({
                answers,
                command: COMMAND_ANSWER_POLL,
                pollId,
                type: 'polls'
            }),
            'json-message',
            true);
    }
}
