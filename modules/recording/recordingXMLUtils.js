/**
 * A collection of utility functions for taking in XML and parsing it to return
 * certain values.
 */
export default {
    /**
     * Parses the presence update of the focus and returns an object with the
     * statuses related to recording.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {Object} The current presence values related to recording.
     */
    getFocusRecordingUpdate(presence) {
        const jibriStatus = presence
            && presence.getElementsByTagName('jibri-recording-status')[0];

        if (!jibriStatus) {
            return;
        }

        return {
            error: jibriStatus.getAttribute('failure_reason'),
            initiator: jibriStatus.getAttribute('initiator'),
            recordingMode: jibriStatus.getAttribute('recording_mode'),
            sessionID: jibriStatus.getAttribute('session_id'),
            status: jibriStatus.getAttribute('status')
        };
    },

    /**
     * Parses the presence update from a hidden domain participant and returns
     * an object with the statuses related to recording.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {Object} The current presence values related to recording.
     */
    getHiddenDomainUpdate(presence) {
        const liveStreamViewURLContainer
            = presence.getElementsByTagName('live-stream-view-url')[0];
        const liveStreamViewURL = liveStreamViewURLContainer
            && liveStreamViewURLContainer.textContent;
        const modeContainer
            = presence.getElementsByTagName('mode')[0];
        const mode = modeContainer
            && modeContainer.textContent
            && modeContainer.textContent.toLowerCase();
        const sessionIDContainer
            = presence.getElementsByTagName('session_id')[0];
        const sessionID
            = sessionIDContainer && sessionIDContainer.textContent;

        return {
            liveStreamViewURL,
            mode,
            sessionID
        };
    },

    /**
     * Returns the recording session ID from a successful IQ.
     *
     * @param {Node} response - The response from the IQ.
     * @returns {string} The session ID of the recording session.
     */
    getSessionIdFromIq(response) {
        const jibri = response && response.getElementsByTagName('jibri')[0];

        return jibri && jibri.getAttribute('session_id');
    },

    /**
     * Returns the recording session ID from a presence, if it exists.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {string|undefined} The session ID of the recording session.
     */
    getSessionId(presence) {
        const sessionIdContainer
            = presence.getElementsByTagName('session_id')[0];
        const sessionId = sessionIdContainer && sessionIdContainer.textContent;

        return sessionId;
    },

    /**
     * Returns whether or not a presence is from the focus.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {boolean} True if the presence is from the focus.
     */
    isFromFocus(presence) {
        return presence.getAttribute('from').includes('focus');
    }
};
