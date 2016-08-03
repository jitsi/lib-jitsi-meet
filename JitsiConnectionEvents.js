/**
 * Enumeration with the events for the connection.
 * @type {{string: string}}
 */
var JitsiConnnectionEvents = {
    /**
     * Indicates that the connection has been failed for some reason. The event
     * proivdes the following parameters to its listeners:
     *
     * @param err {string} the error (message) associated with the failure
     */
    CONNECTION_FAILED: "connection.connectionFailed",
    /**
     * Indicates that the connection has been established. The event provides
     * the following parameters to its listeners:
     *
     * @param id {string} the ID of the local endpoint/participant/peer (within
     * the context of the established connection)
     */
    CONNECTION_ESTABLISHED: "connection.connectionEstablished",
    /**
     * Indicates that the connection has been disconnected. The event provides
     * the following parameters to its listeners:
     *
     * @param msg {string} a message associated with the disconnect such as the
     * last (known) error message
     */
    CONNECTION_DISCONNECTED: "connection.connectionDisconnected",
    /**
     * Indicates that the perfomed action cannot be executed because the
     * connection is not in the correct state(connected, disconnected, etc.)
     */
    WRONG_STATE: "connection.wrongState"
};

module.exports = JitsiConnnectionEvents;
