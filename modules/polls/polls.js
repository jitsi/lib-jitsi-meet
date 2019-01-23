import { getLogger } from 'jitsi-meet-logger';
import * as XMPPEvents from '../../service/xmpp/XMPPEvents';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import { Strophe } from 'strophe.js';

const logger = getLogger(__filename);

const MESSAGE_POLL_END = 'poll-end';
const MESSAGE_POLL_STARTED = 'poll-started';
const MESSAGE_POLL_VOTE = 'poll-vote';


/**
 * A module for managing poll session related functionality.
 * This module handles communication with all participants regarding the poll
 * session management. It also keep the record of what poll is going
 * on using the server side prosody-module if it is present.
 */
export default class Polls {

    /**
     * Constructor.
     * @param xmpp - XMPP connection.
     */
    constructor(conference, xmpp) {
        const room = conference.room;

        this.conference = conference;
        this.xmpp = xmpp;

        this.choices = null;
        this.poll = null;
        this.question = null;

        xmpp.addListener(
            XMPPEvents.POLL_MESSAGE_RECEIVED,
            this._onModuleMessageReceived.bind(this));
        room.addListener(
            XMPPEvents.JSON_MESSAGE_RECEIVED,
            this._onEndPointMessageReceived.bind(this));
    }

    /* eslint-disable max-params */
    /**
     * Starts a poll in the conference room.
     * @param roomJid - Ro.
     * @param {Object} poll - Poll object.
     * @param {Object} choices - Array of voting choices.
     * @param {Object} question - Question asked in the poll.
     */
    startPoll(roomjid, poll, choices, question) {
        logger.log(`Poll Start: ${poll} ${choices} ${question}`);

        this._doStartPoll(choices, poll, question);

        // inform participants about the new poll.
        this.conference.sendMessage({
            type: MESSAGE_POLL_STARTED,
            event: {
                choices,
                poll,
                question
            }
        });

        this._savePollInProsodyModule(roomjid);
    }
    /* eslint-enable max-params */

    /**
     * Vote for a choice in the poll.
     * @param {string} choiceID - ID of the voted choice
     * @param {string} userID - ID of user who voted.
     */
    voteInPoll(roomjid, choiceID) {
        logger.log(`Voted for ${choiceID}`);

        const myid = this.conference.myUserId();

        this._doVote(choiceID, myid);

        // inform others about my vote.
        this.conference.sendMessage({
            type: MESSAGE_POLL_VOTE,
            event: {
                choiceID,
                userID: myid
            }
        });

        this._savePollInProsodyModule(roomjid);
    }

    /**
     * End the current poll.
     */
    endPoll(roomjid) {
        this._doEndPoll();

        // inform others, that I ended the poll
        this.conference.sendMessage({
            type: MESSAGE_POLL_END
        });

        this._savePollInProsodyModule(roomjid);
    }

    /**
     * Emit end poll event.
     */
    _doEndPoll() {
        logger.log('Poll has ended');

        this.choices = null;
        this.poll = null;
        this.question = null;

        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.POLL_FINISHED
        );
    }

    /**
     * Emit poll start event.
     * @param {Object} choices - Choices object.
     * @param {Object} poll - Poll object.
     * @param {Object} question - Quesiotn object.
     */
    _doStartPoll(choices, poll, question) {

        this.choices = choices;
        this.poll = poll;
        this.question = question;

        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.POLL_STARTED,
            choices,
            poll,
            question
        );
    }

    /**
     * Emit user voted event.
     * @param {string} choiceID - Choice ID.
     * @param {string} userID - ID of user who voted.
     */
    _doVote(choiceID, userID) {
        if (!this.choices.hasOwnProperty(choiceID)) {
            logger.warn(`Ignoring an invalid choice ID ${choiceID}`);

            return;
        }

        const voteIndex = this.choices[choiceID].votes
            .findIndex(x => x === userID);

        // if vote exist then it is unvote
        if (voteIndex > -1) {
            this.choices[choiceID].votes.splice(voteIndex, 1);
        } else {
            this.choices[choiceID].votes.push(userID);
        }

        this.conference.eventEmitter.emit(
            JitsiConferenceEvents.POLL_VOTE_UPDATED,
            this.choices[choiceID]
        );
    }

    /**
     * Received message from another user.
     * @param {Object} message - Message received.
     */
    _onEndPointMessageReceived(from, message) {
        const myid = this.conference.myUserId();
        const { type } = message;

        logger.info(`Received ${message} from ${from}`);

        if (myid === Strophe.getResourceFromJid(from) || !type) {
            return;
        }

        if (type === MESSAGE_POLL_END) {
            this._doEndPoll();
        } else if (type === MESSAGE_POLL_STARTED) {
            const { event } = message;
            const { choices, poll, question } = event;

            this._doStartPoll(choices, poll, question);
        } else if (type === MESSAGE_POLL_VOTE) {
            const { event } = message;
            const { choiceID, userID } = event;

            this._doVote(choiceID, userID);
        }
    }

    /**
     * Received message from prosody module.
     * @param payload - Poll to notify
     */
    _onModuleMessageReceived(message) {
        console.log(message);

        const { choices, poll, question } = message;

        this._doStartPoll(choices, poll, question);
    }

    /**
     * Save poll state in backend prosody module.
     * @param {string} roomjid - Room JID.
     */
    _savePollInProsodyModule(roomjid) {
        logger.log(`Saved ${this.poll} in room ${roomjid}`);

        // When poll ends, we send empty message to module.
        const message = this.poll === null ? null : {
            choices: this.choices,
            poll: this.poll,
            question: this.question
        };

        this.xmpp.sendPollComponentMessage(roomjid, message);
    }

}
