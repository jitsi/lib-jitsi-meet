export enum AuthenticationEvents {
    /**
     * Event callback arguments:
     * function(authenticationEnabled, userIdentity)
     * authenticationEnabled - indicates whether authentication has been enabled
     *                         in this session
     * userIdentity - if user has been logged in then it contains user name. If
     *                contains 'null' or 'undefined' then user is not logged in.
     */
    IDENTITY_UPDATED = 'authentication.identity_updated'
};

export const IDENTITY_UPDATED = AuthenticationEvents.IDENTITY_UPDATED;

// TODO: this was a pre-ES6 module using module.exports = AuthenticationEvents which doesn't translate well
// it is used in a number of places and should be updated to use the named export

export default AuthenticationEvents;
