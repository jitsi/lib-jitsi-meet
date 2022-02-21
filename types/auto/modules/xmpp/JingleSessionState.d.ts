export declare enum JingleSessionState {
    /**
     * The pending Jingle session state which means the session as defined in
     * XEP-0166(before 'session-invite/session-accept' took place).
     */
    PENDING = "pending",
    /**
     * The active Jingle session state as defined in XEP-0166
     * (after 'session-invite'/'session-accept').
     */
    ACTIVE = "active",
    /**
     * The ended Jingle session state as defined in XEP-0166
     * (after 'session-terminate').
     */
    ENDED = "ended"
}
export declare const PENDING = JingleSessionState.PENDING;
export declare const ACTIVE = JingleSessionState.ACTIVE;
export declare const ENDED = JingleSessionState.ENDED;
