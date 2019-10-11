import { $iq } from 'strophe.js';

import recordingXMLUtils from './recordingXMLUtils';

/**
 * Represents a recording session.
 */
export default class JibriSession {
    /**
     * Initializes a new JibriSession instance.
     *
     * @constructor
     */
    constructor(options = {}) {
        this._connection = options.connection;
        this._mode = options.mode;

        this._setSessionID(options.sessionID);
        this.setStatus(options.status);
    }

    /**
     * Returns the error related to the session instance, if any.
     *
     * @returns {string|undefined}
     */
    getError() {
        return this._error;
    }

    /**
     * Returns the session ID of the session instance.
     *
     * @returns {string|undefined}
     */
    getID() {
        return this._sessionID;
    }

    /**
     * Returns the initiator of the session instance.
     *
     * @returns {JitsiParticipant|undefined} The participant that started the session.
     */
    getInitiator() {
        return this._initiator;
    }

    /**
     * Returns the streaming URL of the session.
     *
     * @returns {string|undefined}
     */
    getLiveStreamViewURL() {
        return this._liveStreamViewURL;
    }

    /**
     * Returns the current status of the session.
     *
     * @returns {string|undefined}
     */
    getStatus() {
        return this._status;
    }

    /**
     * Returns the jid of the participant that stopped the session.
     *
     * @returns {JitsiParticipant|undefined} The participant that stopped the session.
     */
    getTerminator() {
        return this._terminator;
    }

    /**
     * Returns the current recording mode of the session, such as "file".
     *
     * @returns {string}
     */
    getMode() {
        return this._mode;
    }

    /**
     * Sets the last known error message related to the session.
     *
     * @param {string} error - The error string explaining why the session
     * entered an error state.
     * @returns {void}
     */
    setError(error) {
        this._error = error;
    }

    /**
     * Sets the last live stream URL for the session instance. Usually this is
     * a YouTube URL and usually this is only set for "stream" sessions.
     *
     * @param {string} url - The live stream URL associated with the session.
     * @returns {void}
     */
    setLiveStreamViewURL(url) {
        this._liveStreamViewURL = url;
    }

    /**
     * Sets the last known status for this recording session.
     *
     * @param {string} status - The new status to set.
     * @returns {void}
     */
    setStatus(status) {
        this._status = status;
    }

    /**
     * Sets the creator's jid of the session.
     * @param {JitsiParticipant} participant - The creator of the session.
     */
    setInitiator(participant) {
        this._initiator = participant;
    }

    /**
     * Sets the jid of the participant that stopped the session.
     * @param {JitsiParticipant} participant  - The participant's jid,
     * that stopped the session.
     */
    setTerminator(participant) {
        this._terminator = participant;
    }

    /**
     * Sends a message to start the actual recording.
     *
     * @param {Object} options - Additional arguments for starting the
     * recording.
     * @param {string} [options.appData] - Data specific to the app/service that
     * the result file will be uploaded.
     * @param {string} [options.broadcastId] - The broadcast ID of an
     * associated YouTube stream, used for knowing the URL from which the stream
     * can be viewed.
     * @param {string} options.focusMucJid - The JID of the focus participant
     * that controls recording.
     * @param {streamId} options.streamId - Necessary for live streaming, this
     * is the the stream key needed to start a live streaming session with the
     * streaming service provider.
     * @returns Promise
     */
    start({ appData, broadcastId, focusMucJid, streamId }) {
        return new Promise((resolve, reject) => {
            this._connection.sendIQ(
                this._createIQ({
                    action: 'start',
                    appData,
                    focusMucJid,
                    broadcastId,
                    streamId
                }),
                result => {
                    // All users will eventually receive the 'pending' status
                    // from the backend, but for the user initiating the session
                    // it's better to give some instant feedback that recording
                    // is starting so fire 'pending' here manually.
                    this.setStatus('pending');
                    this._setSessionID(
                        recordingXMLUtils.getSessionIdFromIq(result));

                    resolve();
                },
                error => {
                    this._setErrorFromIq(error);

                    reject(error);
                });
        });
    }

    /**
     * Sends a message to actually stop the recording session.
     *
     * @param {Object} options - Additional arguments for stopping the
     * recording.
     * @param {Object} options.focusMucJid - The JID of the focus participant
     * that controls recording.
     * @returns Promise
     */
    stop({ focusMucJid }) {
        return new Promise((resolve, reject) => {
            this._connection.sendIQ(
                this._createIQ({
                    action: 'stop',
                    focusMucJid
                }),
                resolve,
                reject);
        });
    }

    /**
     * Generates the message to change the status of the recording session.
     *
     * @param {string} status - The new status to which the recording session
     * should transition.
     * @param {string} [options.appData] - Data specific to the app/service that
     * the result file will be uploaded.
     * @param {string} [options.broadcastId] - The broadcast ID of an
     * associated YouTube stream, used for knowing the URL from which the stream
     * can be viewed.
     * @param {string} options.focusMucJid - The JID of the focus participant
     * that controls recording.
     * @param {streamId} options.streamId - Necessary for live streaming, this
     * is the the stream key needed to start a live streaming session with the
     * streaming service provider.
     * @returns Object - The XMPP IQ message.
     */
    _createIQ({ action, appData, broadcastId, focusMucJid, streamId }) {
        return $iq({
            to: focusMucJid,
            type: 'set'
        })
        .c('jibri', {
            'xmlns': 'http://jitsi.org/protocol/jibri',
            'action': action,
            'app_data': appData,
            'recording_mode': this._mode,
            'streamid': streamId,
            'you_tube_broadcast_id': broadcastId
        })
        .up();
    }

    /**
     * Handles the error from an iq and stores the error.
     *
     * @param {Node} errorIq - The error response from an Iq.
     * @private
     * @returns {void}
     */
    _setErrorFromIq(errorIq) {
        const error = errorIq.getElementsByTagName('error')[0];

        this.setError(error.children[0].tagName);
    }

    /**
     * Sets the known session ID for this recording session.
     *
     * @param {string} sessionID
     * @private
     * @returns {void}
     */
    _setSessionID(sessionID) {
        this._sessionID = sessionID;
    }
}
