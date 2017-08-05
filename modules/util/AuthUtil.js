const AuthUtil = {
    /**
     * Creates the URL pointing to JWT token authentication service. It is
     * formatted from the 'urlPattern' argument which can contain the following
     * constants:
     * '{room}' - name of the conference room passed as <tt>roomName</tt>
     * argument to this method.
     * '{roleUpgrade}' - will contain 'true' if the URL will be used for
     * the role upgrade scenario, where user connects from anonymous domain and
     * then gets upgraded to the moderator by logging-in from the popup window.
     *
     * @param urlPattern a URL pattern pointing to the login service
     * @param roomName the name of the conference room for which the user will
     * be authenticated
     * @param {bool} roleUpgrade <tt>true</tt> if the URL will be used for role
     * upgrade scenario, where the user logs-in from the popup window in order
     * to have the moderator rights granted
     *
     * @returns {string|null} the URL pointing to JWT login service or
     * <tt>null</tt> if 'urlPattern' is not a string and the URL can not be
     * constructed.
     */
    getTokenAuthUrl(urlPattern, roomName, roleUpgrade) {
        const url = urlPattern;

        if (typeof url !== 'string') {
            return null;
        }

        return url.replace('{room}', roomName)
            .replace('{roleUpgrade}', roleUpgrade === true);
    }
};

module.exports = AuthUtil;
