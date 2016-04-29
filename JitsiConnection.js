var JitsiConference = require("./JitsiConference");
var XMPP = require("./modules/xmpp/xmpp");

/**
 * Creates new connection object for the Jitsi Meet server side video conferencing service. Provides access to the
 * JitsiConference interface.
 * @param JitsiMeetJS the JitsiMeetJS instance which is initializing the new
 * JitsiConnection instance
 * @param appID identification for the provider of Jitsi Meet video conferencing services.
 * @param token the JWT token used to authenticate with the server(optional)
 * @param options Object with properties / settings related to connection with the server.
 * @constructor
 */
function JitsiConnection(JitsiMeetJS, appID, token, options) {
    /**
     * The {JitsiMeetJS} instance which has initialized this {JitsiConnection}
     * instance.
     * @public
     */
    this.JitsiMeetJS = JitsiMeetJS;
    this.appID = appID;
    this.token = token;
    this.options = options;
    this.xmpp = new XMPP(options, token);
    this.conferences = {};
}

/**
 * Connect the client with the server.
 * @param options {object} connecting options
 * (for example authentications parameters).
 */
JitsiConnection.prototype.connect = function (options) {
    if(!options)
        options = {};

    this.xmpp.connect(options.id, options.password);
}

/**
 * Attach to existing connection. Can be used for optimizations. For example:
 * if the connection is created on the server we can attach to it and start
 * using it.
 *
 * @param options {object} connecting options - rid, sid and jid.
 */
JitsiConnection.prototype.attach = function (options) {
    this.xmpp.attach(options);
}

/**
 * Disconnect the client from the server.
 */
JitsiConnection.prototype.disconnect = function () {
    // XXX Forward any arguments passed to JitsiConnection.disconnect to
    // XMPP.disconnect. For example, the caller of JitsiConnection.disconnect
    // may optionally pass the event which triggered the disconnect in order to
    // provide the implementation with finer-grained context.
    var x = this.xmpp;

    x.disconnect.apply(x, arguments);
}

/**
 * This method allows renewal of the tokens if they are expiring.
 * @param token the new token.
 */
JitsiConnection.prototype.setToken = function (token) {
    this.token = token;
}

/**
 * Creates and joins new conference.
 * @param name the name of the conference; if null - a generated name will be
 * provided from the api
 * @param options Object with properties / settings related to the conference
 * that will be created.
 * @returns {JitsiConference} returns the new conference object.
 */
JitsiConnection.prototype.initJitsiConference = function (name, options) {
    var conference
        = new JitsiConference({name: name, config: options, connection: this});
    this.conferences[name] = conference;
    return conference;
}

/**
 * Subscribes the passed listener to the event.
 * @param event {JitsiConnectionEvents} the connection event.
 * @param listener {Function} the function that will receive the event
 */
JitsiConnection.prototype.addEventListener = function (event, listener) {
    this.xmpp.addListener(event, listener);
}

/**
 * Unsubscribes the passed handler.
 * @param event {JitsiConnectionEvents} the connection event.
 * @param listener {Function} the function that will receive the event
 */
JitsiConnection.prototype.removeEventListener = function (event, listener) {
    this.xmpp.removeListener(event, listener);
}

/**
 * Returns measured connectionTimes.
 */
JitsiConnection.prototype.getConnectionTimes = function () {
    return this.xmpp.connectionTimes;
};

module.exports = JitsiConnection;
