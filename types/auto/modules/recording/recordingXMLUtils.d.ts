declare namespace _default {
    /**
     * Parses the presence update of the focus and returns an object with the
     * statuses related to recording.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {Object} The current presence values related to recording.
     */
    function getFocusRecordingUpdate(presence: Node): any;
    /**
     * Parses the presence update of the focus and returns an object with the
     * statuses related to recording.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {Object} The current presence values related to recording.
     */
    function getFocusRecordingUpdate(presence: Node): any;
    /**
     * Parses the presence update from a hidden domain participant and returns
     * an object with the statuses related to recording.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {Object} The current presence values related to recording.
     */
    function getHiddenDomainUpdate(presence: Node): any;
    /**
     * Parses the presence update from a hidden domain participant and returns
     * an object with the statuses related to recording.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {Object} The current presence values related to recording.
     */
    function getHiddenDomainUpdate(presence: Node): any;
    /**
     * Returns the recording session ID from a successful IQ.
     *
     * @param {Node} response - The response from the IQ.
     * @returns {string} The session ID of the recording session.
     */
    function getSessionIdFromIq(response: Node): string;
    /**
     * Returns the recording session ID from a successful IQ.
     *
     * @param {Node} response - The response from the IQ.
     * @returns {string} The session ID of the recording session.
     */
    function getSessionIdFromIq(response: Node): string;
    /**
     * Returns the recording session ID from a presence, if it exists.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {string|undefined} The session ID of the recording session.
     */
    function getSessionId(presence: Node): string;
    /**
     * Returns the recording session ID from a presence, if it exists.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {string|undefined} The session ID of the recording session.
     */
    function getSessionId(presence: Node): string;
    /**
     * Returns whether or not a presence is from the focus.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {boolean} True if the presence is from the focus.
     */
    function isFromFocus(presence: Node): boolean;
    /**
     * Returns whether or not a presence is from the focus.
     *
     * @param {Node} presence - An XMPP presence update.
     * @returns {boolean} True if the presence is from the focus.
     */
    function isFromFocus(presence: Node): boolean;
}
export default _default;
