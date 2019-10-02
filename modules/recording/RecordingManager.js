import { getLogger } from 'jitsi-meet-logger';

import XMPPEvents from '../../service/xmpp/XMPPEvents';

import JibriSession from './JibriSession';
import recordingXMLUtils from './recordingXMLUtils';

const logger = getLogger(__filename);

/**
 * A class responsible for starting and stopping recording sessions and emitting
 * state updates for them.
 */
class RecordingManager {
    /**
     * Initialize {@code RecordingManager} with other objects that are necessary
     * for starting a recording.
     *
     * @param {ChatRoom} chatRoom - The chat room to handle.
     * @returns {void}
     */
    constructor(chatRoom) {
        /**
         * All known recording sessions from the current conference.
         */
        this._sessions = {};

        this._chatRoom = chatRoom;

        this.onPresence = this.onPresence.bind(this);

        this._chatRoom.eventEmitter.addListener(
            XMPPEvents.PRESENCE_RECEIVED, this.onPresence);
    }

    /**
     * Finds an existing recording session by session ID.
     *
     * @param {string} sessionID - The session ID associated with the recording.
     * @returns {JibriSession|undefined}
     */
    getSession(sessionID) {
        return this._sessions[sessionID];
    }

    /**
     * Callback to invoke to parse through a presence update to find recording
     * related updates (from Jibri participant doing the recording and the
     * focus which controls recording).
     *
     * @param {Object} event - The presence data from the pubsub event.
     * @param {Node} event.presence - An XMPP presence update.
     * @param {boolean} event.fromHiddenDomain - Whether or not the update comes
     * from a participant that is trusted but not visible, as would be the case
     * with the Jibri recorder participant.
     * @returns {void}
     */
    onPresence({ fromHiddenDomain, presence }) {
        if (recordingXMLUtils.isFromFocus(presence)) {
            this._handleFocusPresence(presence);
        } else if (fromHiddenDomain) {
            this._handleJibriPresence(presence);
        }
    }

    /**
     * Start a recording session.
     *
     * @param {Object} options - Configuration for the recording.
     * @param {string} [options.appData] - Data specific to the app/service that
     * the result file will be uploaded.
     * @param {string} [optional] options.broadcastId - The channel on which a
     * live stream will occur.
     * @param {string} options.mode - The mode in which recording should be
     * started. Recognized values are "file" and "stream".
     * @param {string} [optional] options.streamId - The stream key to be used
     * for live stream broadcasting. Required for live streaming.
     * @returns {Promise} A promise for starting a recording, which will pass
     * back the session on success. The promise resolves after receiving an
     * acknowledgment of the start request success or fail.
     */
    startRecording(options) {
        const session = new JibriSession({
            ...options,
            connection: this._chatRoom.connection
        });

        return session.start({
            appData: options.appData,
            broadcastId: options.broadcastId,
            focusMucJid: this._chatRoom.focusMucJid,
            streamId: options.streamId
        })
            .then(() => {
                // Only store the session and emit if the session has not been
                // added already. This is a workaround for the session getting
                // created due to a presence update to announce a "pending"
                // recording being received before JibriSession#start finishes.
                if (!this.getSession(session.getID())) {
                    this._addSession(session);
                    this._emitSessionUpdate(session);
                }

                return session;
            })
            .catch(error => {
                this._emitSessionUpdate(session);

                return Promise.reject(error);
            });
    }

    /**
     * Stop a recording session.
     *
     * @param {string} sessionID - The ID associated with the recording session
     * to be stopped.
     * @returns {Promise} The promise resolves after receiving an
     * acknowledgment of the stop request success or fail.
     */
    stopRecording(sessionID) {
        const session = this.getSession(sessionID);

        if (session) {
            return session.stop({ focusMucJid: this._chatRoom.focusMucJid });
        }

        return Promise.reject(new Error('Could not find session'));
    }

    /**
     * Stores a reference to the passed in JibriSession.
     *
     * @param {string} session - The JibriSession instance to store.
     * @returns {void}
     */
    _addSession(session) {
        this._sessions[session.getID()] = session;
    }

    /**
     * Create a new instance of a recording session and stores a reference to
     * it.
     *
     * @param {string} sessionID - The session ID of the recording in progress.
     * @param {string} status - The current status of the recording session.
     * @param {string} mode - The recording mode of the session.
     * @returns {JibriSession}
     */
    _createSession(sessionID, status, mode) {
        const session = new JibriSession({
            connection: this._chatRoom.connection,
            focusMucJid: this._chatRoom.focusMucJid,
            mode,
            sessionID,
            status
        });

        this._addSession(session);

        return session;
    }

    /**
     * Notifies listeners of an update to a recording session.
     *
     * @param {JibriSession} session - The session that has been updated.
     * @param {string|undefined} initiator - The jid of the initiator of the update.
     */
    _emitSessionUpdate(session, initiator) {
        this._chatRoom.eventEmitter.emit(
            XMPPEvents.RECORDER_STATE_CHANGED, session, initiator);
    }

    /**
     * Parses presence to update an existing JibriSession or to create a new
     * JibriSession.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {void}
     */
    _handleFocusPresence(presence) {
        const jibriStatus = recordingXMLUtils.getFocusRecordingUpdate(presence);

        if (!jibriStatus) {
            return;
        }

        const { error, initiator, recordingMode, sessionID, status } = jibriStatus;

        // We'll look for an existing session or create one (in case we're a
        // participant joining a call with an existing recording going on).
        let session = this.getSession(sessionID);

        // Handle the case where a status update is received in presence but
        // the local participant has joined while the JibriSession has already
        // ended.
        if (!session && status === 'off') {
            logger.warn(
                'Ignoring recording presence update',
                'Received a new session with status off.');

            return;
        }

        // Jicofo sends updates via presence, and any extension in presence
        // is sent until it is explicitly removed.  It's difficult for
        // Jicofo to know when a presence has been sent once, so it won't
        // remove jibri status extension.  This means we may receive the same
        // status update more than once, so check for that here
        if (session
            && session.getStatus() === status
            && session.getError() === error) {
            logger.warn('Ignoring duplicate presence update: ',
                JSON.stringify(jibriStatus));

            return;
        }

        if (!session) {
            session = this._createSession(sessionID, status, recordingMode);
        }

        session.setStatus(status);

        if (error) {
            session.setError(error);
        }

        this._emitSessionUpdate(session, initiator);
    }

    /**
     * Handles updates from the Jibri which can broadcast a YouTube URL that
     * needs to be updated in a JibriSession.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {void}
     */
    _handleJibriPresence(presence) {
        const { liveStreamViewURL, mode, sessionID }
            = recordingXMLUtils.getHiddenDomainUpdate(presence);

        if (!sessionID) {
            logger.warn(
                'Ignoring potential jibri presence due to no session id.');

            return;
        }

        let session = this.getSession(sessionID);

        if (!session) {
            session = this._createSession(sessionID, '', mode);
        }

        session.setLiveStreamViewURL(liveStreamViewURL);

        this._emitSessionUpdate(session);
    }
}

export default RecordingManager;
