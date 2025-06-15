import { getLogger } from '@jitsi/logger';

const logger = getLogger(__filename);

/**
 * Manages End-to-End Encryption (E2EE) session states to prevent duplicate initializations.
 */
export default class E2EESessionManager {
    /**
     * Initializes a new E2EE session manager.
     */
    constructor() {
        this._sessions = new Map();
        this._initPromises = new Map();
    }

    /**
     * Gets or creates session data for a participant.
     * @param {string} participantId - The participant ID.
     * @returns {Object} Session data with session and state.
     * @private
     */
    _getOrCreateSessionData(participantId) {
        if (!this._sessions.has(participantId)) {
            this._sessions.set(participantId, {
                session: null,
                state: 'idle' // idle, initializing, active, error
            });
        }
        return this._sessions.get(participantId);
    }

    /**
     * Initializes an E2EE session for a participant, preventing duplicate attempts.
     * @param {string} participantId - The participant ID.
     * @param {Function} initFunction - Async function to initialize the session.
     * @returns {Promise<Object>} The initialized session.
     */
    async initializeSession(participantId, initFunction) {
        const sessionData = this._getOrCreateSessionData(participantId);

        if (sessionData.state === 'active') {
            logger.debug(`Session already active for ${participantId}`);
            return sessionData.session;
        }

        if (sessionData.state === 'initializing') {
            logger.debug(`Waiting for existing initialization for ${participantId}`);
            return this._initPromises.get(participantId);
        }

        sessionData.state = 'initializing';
        const initPromise = (async () => {
            try {
                const session = await initFunction();
                sessionData.session = session;
                sessionData.state = 'active';
                logger.debug(`Session initialized for ${participantId}`);
                return session;
            } catch (error) {
                sessionData.state = 'error';
                logger.error(`Failed to initialize session for ${participantId}:`, error);
                throw error;
            } finally {
                this._initPromises.delete(participantId);
            }
        })();

        this._initPromises.set(participantId, initPromise);
        return initPromise;
    }

    /**
     * Checks if an active session exists for a participant.
     * @param {string} participantId - The participant ID.
     * @returns {boolean} True if an active session exists.
     */
    hasSession(participantId) {
        const sessionData = this._sessions.get(participantId);
        return sessionData?.state === 'active';
    }

    /**
     * Cleans up a session for a participant.
     * @param {string} participantId - The participant ID.
     */
    cleanupSession(participantId) {
        const sessionData = this._sessions.get(participantId);
        if (sessionData) {
            sessionData.session = null;
            sessionData.state = 'idle';
            this._sessions.delete(participantId);
            this._initPromises.delete(participantId);
            logger.debug(`Cleaned up session for ${participantId}`);
        }
    }

    /**
     * Cleans up all sessions.
     */
    cleanupAll() {
        for (const participantId of this._sessions.keys()) {
            this.cleanupSession(participantId);
        }
        logger.debug('All E2EE sessions cleaned up');
    }
}
