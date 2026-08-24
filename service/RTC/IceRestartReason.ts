/**
 * The reason an in-place ICE restart of the JVB session was requested. Used only for local logging and
 * telemetry (analytics, RTCStats) - it is not sent to the bridge or to jicofo, which only see a plain
 * ice-restart request with no reason attached.
 */
export enum IceRestartReason {

    /**
     * Requested explicitly through the public API, for example from the browser console
     * (`APP.conference._room.restartJvbIce()`), with no reason given.
     */
    API = 'api',

    /**
     * The existing ICE connection failed and the reactive recovery flow requested a restart.
     */
    ICE_FAILED = 'ice-failed',

    /**
     * The client proactively requested a restart after detecting a network change (mobile only).
     */
    NETWORK_CHANGE = 'network-change'
}
