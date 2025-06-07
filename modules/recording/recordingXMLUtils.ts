/**
 * A collection of utility functions for taking in XML and parsing it to return
 * certain values.
 */

export interface IFocusRecordingUpdate {
    error: string | null;
    initiator: string | null;
    recordingMode: string | null;
    sessionID: string | null;
    status: string | null;
}

export interface IHiddenDomainUpdate {
    liveStreamViewURL: string | null | undefined;
    mode: string | null | undefined;
    sessionID: string | null | undefined;
}

const recordingXMLUtils = {
    /**
     * Parses the presence update of the focus and returns an object with the
     * statuses related to recording.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {Object} The current presence values related to recording.
     */
    getFocusRecordingUpdate(presence: Element | null): IFocusRecordingUpdate | undefined {
        const jibriStatus = presence?.getElementsByTagName('jibri-recording-status')[0];

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
    getHiddenDomainUpdate(presence: Element): IHiddenDomainUpdate {
        const liveStreamViewURL = presence.getElementsByTagName('live-stream-view-url')[0]?.textContent;
        const mode = presence.getElementsByTagName('mode')[0]?.textContent?.toLowerCase();
        const sessionID = presence.getElementsByTagName('session_id')[0]?.textContent;

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
    getSessionIdFromIq(response: Element | null): string | null {
        return response?.getElementsByTagName('jibri')[0]?.getAttribute('session_id') ?? null;
    },

    /**
     * Returns the recording session ID from a presence, if it exists.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {string|undefined} The session ID of the recording session.
     */
    getSessionId(presence: Element): string | null | undefined {
        return presence.getElementsByTagName('session_id')[0]?.textContent;
    },

    /**
     * Returns whether or not a presence is from the focus.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {boolean} True if the presence is from the focus.
     */
    isFromFocus(presence: Element): boolean {
        return presence.getAttribute('from')?.includes('focus') ?? false;
    }
};

export default recordingXMLUtils;
