import { getLogger } from 'jitsi-meet-logger';

import XMPPEvents from '../../service/xmpp/XMPPEvents';

import JibriQueue from './JibriQueue';
import JibriSession from './JibriSession';
import recordingConstats from './recordingConstants';
import recordingXMLUtils from './recordingXMLUtils';

const STATUS = recordingConstats.status;

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
         * All known recording active sessions from the current conference.
         *
         * NOTE: Sessions that are with waiting-in-queue status are not included here!
         */
        this._sessions = {};

        /**
         * All known recording queues from the current conference.
         */
        this._queues = {};

        this._chatRoom = chatRoom;

        this.onPresence = this.onPresence.bind(this);

        this._chatRoom.eventEmitter.addListener(
            XMPPEvents.PRESENCE_RECEIVED, this.onPresence);
    }

    /**
     * Finds an existing recording session by session ID.
     *
     * NOTE: Sessions that are with waiting-in-queue status are not included here!
     *
     * @param {string} sessionID - The session ID associated with the recording.
     * @returns {JibriSession|undefined}
     */
    getActiveSession(sessionID) {
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
     * Obtains token from a jibri queue if configured. The token will be used to start the recording.
     *
     * @param {string} jibriQueueComponentAddress - The address of the jibri queue component.
     * @param {JibriSession} session - The JibriSession instance that will receive the token.
     * @returns {Promise<{isCanceledByUser: boolean, token: string}>} - Resolves with the token and
     * a flag that indicates if the user has cancelled the process.
     */
    _obtainToken(jibriQueueComponentAddress, session) {
        if (typeof jibriQueueComponentAddress === 'undefined') {
            return Promise.resolve({
                isCanceledByUser: false
            });
        }

        const connection = this._chatRoom.connection;
        const queue = new JibriQueue({
            connection,
            jibriQueueComponentAddress,
            roomJID: this._chatRoom.roomjid
        });

        return new Promise((resolve, reject) => {
            queue.on('token', token => {
                this._removeQueue(queue.id);
                resolve({
                    isCanceledByUser: false,
                    token
                });
            });
            queue.on('metrics', metrics => {
                session.updateQueueMetrics(metrics);
                this._emitSessionUpdate(session);
            });
            queue.on('will-leave', () => {
                this._removeQueue(queue.id);
                session.setStatus(STATUS.QUEUE_LEFT);
                this._emitSessionUpdate(session);
                resolve({
                    isCanceledByUser: true
                });
            });

            queue.join().then(() => {
                const queueID = queue.id;

                this._queues[queueID] = queue;
                session.setQueueID(queueID);
                session.setStatus(STATUS.WAITING_IN_QUEUE);
                this._emitSessionUpdate(session);
            })
            .catch(error => {
                session.setError('Can\'t join the jibri queue.');
                reject(error);
            });
        });
    }

    /**
     * Start a recording session.
     *
     * @param {Object} options - Configuration for the recording.
     * @param {string} [options.appData] - Data specific to the app/service that
     * the result file will be uploaded.
     * @param {string} [optional] options.broadcastId - The channel on which a
     * live stream will occur.
     * @param {string} [options.jibriQueueComponentAddress] - The address of the jibri queue component.
     * @param {string} options.mode - The mode in which recording should be
     * started. Recognized values are "file" and "stream".
     * @param {string} [optional] options.streamId - The stream key to be used
     * for live stream broadcasting. Required for live streaming.
     * @returns {Promise} A promise for starting a recording, which will pass
     * back the session on success. The promise resolves after receiving an
     * acknowledgment of the start request success or fail.
     */
    startRecording(options) {
        const { jibriQueueComponentAddress } = options;
        const connection = this._chatRoom.connection;
        const session = new JibriSession({
            ...options,
            connection
        });

        return this._obtainToken(jibriQueueComponentAddress, session).then(({ isCanceledByUser, token }) => {
            if (isCanceledByUser) {
                return Promise.resolve();
            }

            return session.start({
                appData: options.appData,
                broadcastId: options.broadcastId,
                focusMucJid: this._chatRoom.focusMucJid,
                streamId: options.streamId,
                token
            })
            .then(() => {
                // Only store the session and emit if the session has not been
                // added already. This is a workaround for the session getting
                // created due to a presence update to announce a "pending"
                // recording being received before JibriSession#start finishes.
                if (!this.getActiveSession(session.getID())) {
                    this._addSession(session);
                    this._emitSessionUpdate(session);
                }

                return session;
            });
        })
        .catch(error => {
            // Clears the
            session.setStatus(undefined);
            this._emitSessionUpdate(session);

            return Promise.reject(error);
        });
    }

    /**
     * Stop a recording session.
     *
     * @param {string} sessionID - The ID associated with the recording session
     * to be stopped.
     * @param {string} queueID - The ID of the queue associated with the recording session.
     * @returns {Promise} The promise resolves after receiving an
     * acknowledgment of the stop request success or fail.
     */
    stopRecording(sessionID, queueID) {
        if (sessionID) {
            const session = this.getActiveSession(sessionID);

            if (session) {
                return session.stop({ focusMucJid: this._chatRoom.focusMucJid });
            }
        } else if (queueID) {
            const queue = this._queues[queueID];

            if (queue) {
                return queue.leave();
            }
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
        let session = this.getActiveSession(sessionID);

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

        let session = this.getActiveSession(sessionID);

        if (!session) {
            session = this._createSession(sessionID, '', mode);
        }

        session.setLiveStreamViewURL(liveStreamViewURL);

        this._emitSessionUpdate(session);
    }

    /**
     * Removes a queue from the list of queues.
     *
     * @param {number} id - The ID of the queue.
     * @returns {void}
     */
    _removeQueue(id) {
        const queue = this._queues[id];

        delete this._queues[id];

        if (queue) {
            queue.dispose();
        }
    }
}

export default RecordingManager;
