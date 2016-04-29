/* global $, APP, config, Strophe */

var logger = require("jitsi-meet-logger").getLogger(__filename);
var EventEmitter = require("events");
var Pako = require("pako");
var RTCEvents = require("../../service/RTC/RTCEvents");
var XMPPEvents = require("../../service/xmpp/XMPPEvents");
var JitsiConnectionErrors = require("../../JitsiConnectionErrors");
var JitsiConnectionEvents = require("../../JitsiConnectionEvents");
var RTC = require("../RTC/RTC");

var authenticatedUser = false;

function createConnection(bosh, token) {
    bosh = bosh || '/http-bind';

    // Append token as URL param
    if (token) {
        bosh += (bosh.indexOf('?') == -1 ? '?' : '&') + 'token=' + token;
    }

    return new Strophe.Connection(bosh);
};

//!!!!!!!!!! FIXME: ...
function initStrophePlugins(XMPP) {
    require("./strophe.emuc")(XMPP);
    require("./strophe.jingle")(XMPP, XMPP.eventEmitter);
//    require("./strophe.moderate")(XMPP, eventEmitter);
    require("./strophe.util")();
    require("./strophe.ping")(XMPP, XMPP.eventEmitter);
    require("./strophe.rayo")();
    require("./strophe.logger")();
}

function XMPP(options, token) {
    this.eventEmitter = new EventEmitter();
    this.connection = null;
    this.disconnectInProgress = false;
    this.connectionTimes = {};
    this.forceMuted = false;
    this.options = options;
    initStrophePlugins(this);

    this.connection = createConnection(options.bosh, token);

    // Setup a disconnect on unload as a way to facilitate API consumers. It
    // sounds like they would want that. A problem for them though may be if
    // they wanted to utilize the connected connection in an unload handler of
    // their own. However, it should be fairly easy for them to do that by
    // registering their unload handler before us.
    $(window).on('beforeunload unload', this.disconnect.bind(this));
}

XMPP.prototype.getConnection = function () { return this.connection; };

/**
 * Receive connection status changes and handles them.
 * @password {string} the password passed in connect method
 * @status the connection status
 * @msg message
 */
XMPP.prototype.connectionHandler = function (password, status, msg) {
    var now = window.performance.now();
    this.connectionTimes[Strophe.getStatusString(status).toLowerCase()] = now;
    logger.log("(TIME) Strophe " + Strophe.getStatusString(status) +
        (msg ? "[" + msg + "]" : "") + ":\t", now);
    if (status === Strophe.Status.CONNECTED ||
        status === Strophe.Status.ATTACHED) {
        if (this.options.useStunTurn) {
            this.connection.jingle.getStunAndTurnCredentials();
        }

        logger.info("My Jabber ID: " + this.connection.jid);

        // Schedule ping ?
        var pingJid = this.connection.domain;
        this.connection.ping.hasPingSupport(
            pingJid,
            function (hasPing) {
                if (hasPing)
                    this.connection.ping.startInterval(pingJid);
                else
                    logger.warn("Ping NOT supported by " + pingJid);
            }.bind(this));

        if (password)
            authenticatedUser = true;
        if (this.connection && this.connection.connected &&
            Strophe.getResourceFromJid(this.connection.jid)) {
            // .connected is true while connecting?
//                this.connection.send($pres());
            this.eventEmitter.emit(
                    JitsiConnectionEvents.CONNECTION_ESTABLISHED,
                    Strophe.getResourceFromJid(this.connection.jid));
        }
    } else if (status === Strophe.Status.CONNFAIL) {
        if (msg === 'x-strophe-bad-non-anon-jid') {
            this.anonymousConnectionFailed = true;
        } else {
            this.connectionFailed = true;
        }
        this.lastErrorMsg = msg;
    } else if (status === Strophe.Status.DISCONNECTED) {
        // Stop ping interval
        this.connection.ping.stopInterval();
        this.disconnectInProgress = false;
        if (this.anonymousConnectionFailed) {
            // prompt user for username and password
            this.eventEmitter.emit(JitsiConnectionEvents.CONNECTION_FAILED,
                JitsiConnectionErrors.PASSWORD_REQUIRED);
        } else if(this.connectionFailed) {
            this.eventEmitter.emit(JitsiConnectionEvents.CONNECTION_FAILED,
                JitsiConnectionErrors.OTHER_ERROR,
                msg ? msg : this.lastErrorMsg);
        } else {
            this.eventEmitter.emit(
                    JitsiConnectionEvents.CONNECTION_DISCONNECTED,
                    msg ? msg : this.lastErrorMsg);
        }
    } else if (status === Strophe.Status.AUTHFAIL) {
        // wrong password or username, prompt user
        this.eventEmitter.emit(JitsiConnectionEvents.CONNECTION_FAILED,
            JitsiConnectionErrors.PASSWORD_REQUIRED);

    }
}

XMPP.prototype._connect = function (jid, password) {
    // connection.connect() starts the connection process.
    //
    // As the connection process proceeds, the user supplied callback will
    // be triggered multiple times with status updates. The callback should
    // take two arguments - the status code and the error condition.
    //
    // The status code will be one of the values in the Strophe.Status
    // constants. The error condition will be one of the conditions defined
    // in RFC 3920 or the condition ‘strophe-parsererror’.
    //
    // The Parameters wait, hold and route are optional and only relevant
    // for BOSH connections. Please see XEP 124 for a more detailed
    // explanation of the optional parameters.
    //
    // Connection status constants for use by the connection handler
    // callback.
    //
    //  Status.ERROR - An error has occurred (websockets specific)
    //  Status.CONNECTING - The connection is currently being made
    //  Status.CONNFAIL - The connection attempt failed
    //  Status.AUTHENTICATING - The connection is authenticating
    //  Status.AUTHFAIL - The authentication attempt failed
    //  Status.CONNECTED - The connection has succeeded
    //  Status.DISCONNECTED - The connection has been terminated
    //  Status.DISCONNECTING - The connection is currently being terminated
    //  Status.ATTACHED - The connection has been attached

    this.anonymousConnectionFailed = false;
    this.connectionFailed = false;
    this.lastErrorMsg = undefined;
    this.connection.connect(jid, password,
        this.connectionHandler.bind(this, password));
}

/**
 * Attach to existing connection. Can be used for optimizations. For example:
 * if the connection is created on the server we can attach to it and start
 * using it.
 *
 * @param options {object} connecting options - rid, sid, jid and password.
 */
 XMPP.prototype.attach = function (options) {
    var now = this.connectionTimes["attaching"] = window.performance.now();
    logger.log("(TIME) Strophe Attaching\t:" + now);
    this.connection.attach(options.jid, options.sid, parseInt(options.rid,10)+1,
        this.connectionHandler.bind(this, options.password));
}

XMPP.prototype.connect = function (jid, password) {
    if (!jid) {
        var configDomain
            = this.options.hosts.anonymousdomain || this.options.hosts.domain;
        // Force authenticated domain if room is appended with '?login=true'
        if (this.options.hosts.anonymousdomain
                && window.location.search.indexOf("login=true") !== -1) {
            configDomain = this.options.hosts.domain;
        }
        jid = configDomain || window.location.hostname;
    }
    return this._connect(jid, password);
};

XMPP.prototype.createRoom = function (roomName, options, settings) {
    var roomjid = roomName  + '@' + this.options.hosts.muc;

    if (options.useNicks) {
        if (options.nick) {
            roomjid += '/' + options.nick;
        } else {
            roomjid += '/' + Strophe.getNodeFromJid(this.connection.jid);
        }
    } else {
        var tmpJid = Strophe.getNodeFromJid(this.connection.jid);

        if (!authenticatedUser)
            tmpJid = tmpJid.substr(0, 8);
        roomjid += '/' + tmpJid;
    }

    return this.connection.emuc.createRoom(roomjid, null, options, settings);
}

XMPP.prototype.addListener = function(type, listener) {
    this.eventEmitter.on(type, listener);
};

XMPP.prototype.removeListener = function (type, listener) {
    this.eventEmitter.removeListener(type, listener);
};

/**
 * Sends 'data' as a log message to the focus. Returns true iff a message
 * was sent.
 * @param data
 * @returns {boolean} true iff a message was sent.
 */
XMPP.prototype.sendLogs = function (data) {
    if (!this.connection.emuc.focusMucJid)
        return false;

    var deflate = true;

    var content = JSON.stringify(data);
    if (deflate) {
        content = String.fromCharCode.apply(null, Pako.deflateRaw(content));
    }
    content = Base64.encode(content);
    // XEP-0337-ish
    var message = $msg({to: this.connection.emuc.focusMucJid, type: 'normal'});
    message.c('log', {xmlns: 'urn:xmpp:eventlog', id: 'PeerConnectionStats'});
    message.c('message').t(content).up();
    if (deflate) {
        message.c('tag', {name: "deflated", value: "true"}).up();
    }
    message.up();

    this.connection.send(message);
    return true;
};

// Gets the logs from strophe.jingle.
XMPP.prototype.getJingleLog = function () {
    return this.connection.jingle ? this.connection.jingle.getLog() : {};
};

// Gets the logs from strophe.
XMPP.prototype.getXmppLog = function () {
    return this.connection.logger ? this.connection.logger.log : null;
};

XMPP.prototype.dial = function (to, from, roomName,roomPass) {
    this.connection.rayo.dial(to, from, roomName,roomPass);
};

XMPP.prototype.setMute = function (jid, mute) {
    this.connection.moderate.setMute(jid, mute);
};

XMPP.prototype.eject = function (jid) {
    this.connection.moderate.eject(jid);
};

XMPP.prototype.getSessions = function () {
    return this.connection.jingle.sessions;
};

/**
 * Disconnects this from the XMPP server (if this is connected).
 *
 * @param ev optionally, the event which triggered the necessity to disconnect
 * from the XMPP server (e.g. beforeunload, unload)
 */
XMPP.prototype.disconnect = function (ev) {
    if (this.disconnectInProgress
            || !this.connection
            || !this.connection.connected) {
        this.eventEmitter.emit(JitsiConnectionEvents.WRONG_STATE);
        return;
    }

    this.disconnectInProgress = true;

    // XXX Strophe is asynchronously sending by default. Unfortunately, that
    // means that there may not be enough time to send an unavailable presence
    // or disconnect at all. Switching Strophe to synchronous sending is not
    // much of an option because it may lead to a noticeable delay in navigating
    // away from the current location. As a compromise, we will try to increase
    // the chances of sending an unavailable presence and/or disconecting within
    // the short time span that we have upon unloading by invoking flush() on
    // the connection. We flush() once before disconnect() in order to attemtp
    // to have its unavailable presence at the top of the send queue. We flush()
    // once more after disconnect() in order to attempt to have its unavailable
    // presence sent as soon as possible.
    this.connection.flush();

    if (ev !== null && typeof ev !== 'undefined') {
        var evType = ev.type;

        if (evType == 'beforeunload' || evType == 'unload') {
            // XXX Whatever we said above, synchronous sending is the best
            // (known) way to properly disconnect from the XMPP server.
            // Consequently, it may be fine to have the source code and comment
            // it in or out depending on whether we want to run with it for some
            // time.
            this.connection.options.sync = true;
        }
    }

    this.connection.disconnect();

    if (this.connection.options.sync !== true) {
        this.connection.flush();
    }
};

module.exports = XMPP;
