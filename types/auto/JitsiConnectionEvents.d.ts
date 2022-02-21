/**
 * The events for the connection.
 */
export declare enum JitsiConnectionEvents {
    /**
     * Indicates that the connection has been disconnected. The event provides
     * the following parameters to its listeners:
     *
     * @param msg {string} a message associated with the disconnect such as the
     * last (known) error message
     */
    CONNECTION_DISCONNECTED = "connection.connectionDisconnected",
    /**
     * Indicates that the connection has been established. The event provides
     * the following parameters to its listeners:
     *
     * @param id {string} the ID of the local endpoint/participant/peer (within
     * the context of the established connection)
     */
    CONNECTION_ESTABLISHED = "connection.connectionEstablished",
    /**
     * Indicates that the connection has been failed for some reason. The event
     * provides the following parameters to its listeners:
     *
     * @param errType {JitsiConnectionErrors} the type of error associated with
     * the failure
     * @param errReason {string} the error (message) associated with the failure
     * @param credentials {object} the credentials used to connect (if any)
     * @param errReasonDetails {object} an optional object with details about
     * the error, like shard moving, suspending. Used for analytics purposes.
     */
    CONNECTION_FAILED = "connection.connectionFailed",
    /**
     * Indicates that the performed action cannot be executed because the
     * connection is not in the correct state(connected, disconnected, etc.)
     */
    WRONG_STATE = "connection.wrongState",
    /**
     * Indicates that the display name is required over this connection and need to be supplied when
     * joining the room.
     * There are cases like lobby room where display name is required.
     */
    DISPLAY_NAME_REQUIRED = "connection.display_name_required"
}
export declare const CONNECTION_DISCONNECTED = JitsiConnectionEvents.CONNECTION_DISCONNECTED;
export declare const CONNECTION_ESTABLISHED = JitsiConnectionEvents.CONNECTION_ESTABLISHED;
export declare const CONNECTION_FAILED = JitsiConnectionEvents.CONNECTION_FAILED;
export declare const WRONG_STATE = JitsiConnectionEvents.WRONG_STATE;
export declare const DISPLAY_NAME_REQUIRED = JitsiConnectionEvents.DISPLAY_NAME_REQUIRED;
