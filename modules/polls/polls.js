/**
 * A module for managing poll session related functionality.
 * This module handles communication with all participants regarding the poll
 * session management. It also keep the record of what poll is going
 * on using the server side prosody-module if it is present.
 */
export default class Polls {

    /**
     * Constructor.
     * @param conference
     * @param xmpp - XMPP connection.
     */
    constructor(conference, xmpp) {
        this.xmpp = xmpp;
        this.conference = conference;
    }

    /**
     * Send message indicating start of the poll.
     *
     * @param roomJid - Room ID.
     * @param event - New poll event.
     */
    startPoll(roomJid, event) {
        this._sendMessage(roomJid, event);
    }

    /**
     * Send message indicating a user vote in
     * the current poll.
     * @param roomJid - Room ID.
     * @param event - Poll voting event.
     */
    voteInPoll(roomJid, event) {
        this._sendMessage(roomJid, event);
    }

    /**
     * Send message indicating end of current poll.
     * @param roomJid - Room ID.
     * @param event - Poll end event
     */
    endPoll(roomJid, event) {
        this._sendMessage(roomJid, event);
    }

    /**
     * Send message to participants and poll component.
     * @param roomJid - Room ID.
     * @param {*} event - Poll event.
     */
    _sendMessage(roomJid, event) {
        this.conference.sendMessage(event);
        this.xmpp.sendPollComponentMessage(roomJid, event);
    }
}
