/**
 * A collection of utility functions for taking in XML and parsing it to return
 * certain values.
 */

import { findFirst } from '../util/XMLUtils';

export interface IFocusRecordingUpdate {
    error?: string;
    initiator?: string;
    recordingMode?: string;
    sessionID?: string;
    status?: string;
}

export interface IHiddenDomainUpdate {
    liveStreamViewURL?: string;
    mode?: string;
    sessionID?: string;
}

/**
 * Parses the presence update of the focus and returns an object with the
 * statuses related to recording.
 *
 * @param {Element} presence - An XMPP presence update.
 * @returns {Optional<Object>} The current presence values related to recording.
 */
export function getFocusRecordingUpdate(presence: Element): Optional<IFocusRecordingUpdate> {
    const jibriStatus = findFirst(presence, ':scope>jibri-recording-status');

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
}

/**
 * Parses the presence update from a hidden domain participant and returns
 * an object with the statuses related to recording.
 *
 * @param {Element} presence - An XMPP presence update.
 * @returns {Object} The current presence values related to recording.
 */
export function getHiddenDomainUpdate(presence: Element): IHiddenDomainUpdate {
    const liveStreamViewURL = findFirst(presence, ':scope>live-stream-view-url')?.textContent;
    const mode = findFirst(presence, ':scope>mode')?.textContent?.toLowerCase();
    const sessionID = findFirst(presence, ':scope>session_id')?.textContent;

    return {
        liveStreamViewURL,
        mode,
        sessionID
    };
}

/**
 * Returns the recording session ID from a successful IQ.
 *
 * @param {Element} response - The response from the IQ.
 * @returns {string} The session ID of the recording session.
 */
export function getSessionIdFromIq(response: Element): Nullable<string> {
    return findFirst(response, ':scope>jibri')?.getAttribute('session_id') ?? null;
}
