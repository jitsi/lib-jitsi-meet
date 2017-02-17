/* global $, $iq, Promise, Strophe */

var logger = require("jitsi-meet-logger").getLogger(__filename);
var XMPPEvents = require("../../service/xmpp/XMPPEvents");
var AuthenticationEvents
    = require("../../service/authentication/AuthenticationEvents");
var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");
import Settings from "../settings/Settings";

function createExpBackoffTimer(step) {
    var count = 1;
    return function (reset) {
        // Reset call
        if (reset) {
            count = 1;
            return;
        }
        // Calculate next timeout
        var timeout = Math.pow(2, count - 1);
        count += 1;
        return timeout * step;
    };
}

function Moderator(roomName, xmpp, emitter, options) {
    this.roomName = roomName;
    this.xmppService = xmpp;
    this.getNextTimeout = createExpBackoffTimer(1000);
    this.getNextErrorTimeout = createExpBackoffTimer(1000);
    // External authentication stuff
    this.externalAuthEnabled = false;
    this.options = options;

    // Sip gateway can be enabled by configuring Jigasi host in config.js or
    // it will be enabled automatically if focus detects the component through
    // service discovery.
    this.sipGatewayEnabled = this.options.connection.hosts &&
        this.options.connection.hosts.call_control !== undefined;

    this.eventEmitter = emitter;

    this.connection = this.xmppService.connection;
    this.focusUserJid;
    //FIXME:
    // Message listener that talks to POPUP window
    function listener(event) {
        if (event.data && event.data.sessionId) {
            if (event.origin !== window.location.origin) {
                logger.warn("Ignoring sessionId from different origin: " +
                    event.origin);
                return;
            }
            Settings.setSessionId(event.data.sessionId);
            // After popup is closed we will authenticate
        }
    }
    // Register
    if (window.addEventListener) {
        window.addEventListener("message", listener, false);
    } else {
        window.attachEvent("onmessage", listener);
    }
}

Moderator.prototype.isExternalAuthEnabled =  function () {
    return this.externalAuthEnabled;
};

Moderator.prototype.isSipGatewayEnabled =  function () {
    return this.sipGatewayEnabled;
};


Moderator.prototype.onMucMemberLeft =  function (jid) {
    logger.info("Someone left is it focus ? " + jid);
    var resource = Strophe.getResourceFromJid(jid);
    if (resource === 'focus') {
        logger.info(
            "Focus has left the room - leaving conference");
        this.eventEmitter.emit(XMPPEvents.FOCUS_LEFT);
    }
};


Moderator.prototype.setFocusUserJid =  function (focusJid) {
    if (!this.focusUserJid) {
        this.focusUserJid = focusJid;
        logger.info("Focus jid set to:  " + this.focusUserJid);
    }
};


Moderator.prototype.getFocusUserJid =  function () {
    return this.focusUserJid;
};

Moderator.prototype.getFocusComponent =  function () {
    // Get focus component address
    var focusComponent = this.options.connection.hosts.focus;
    // If not specified use default:  'focus.domain'
    if (!focusComponent) {
        focusComponent = 'focus.' + this.options.connection.hosts.domain;
    }
    return focusComponent;
};

Moderator.prototype.createConferenceIq =  function () {
    // Generate create conference IQ
    var elem = $iq({to: this.getFocusComponent(), type: 'set'});

    // Session Id used for authentication
    var sessionId = Settings.getSessionId();
    var machineUID = Settings.getMachineId();

    logger.info(
            "Session ID: " + sessionId + " machine UID: " + machineUID);

    elem.c('conference', {
        xmlns: 'http://jitsi.org/protocol/focus',
        room: this.roomName,
        'machine-uid': machineUID
    });

    if (sessionId) {
        elem.attrs({ 'session-id': sessionId});
    }
    if (this.options.connection.enforcedBridge !== undefined) {
        elem.c(
            'property', {
                name: 'enforcedBridge',
                value: this.options.connection.enforcedBridge
            }).up();
    }
    // Tell the focus we have Jigasi configured
    if (this.options.connection.hosts !== undefined &&
        this.options.connection.hosts.call_control !== undefined) {
        elem.c(
            'property', {
                name: 'call_control',
                value: this.options.connection.hosts.call_control
            }).up();
    }
    if (this.options.conference.channelLastN !== undefined) {
        elem.c(
            'property', {
                name: 'channelLastN',
                value: this.options.conference.channelLastN
            }).up();
    }
    if (this.options.conference.disableAdaptiveSimulcast !== undefined ||
        this.options.conference.disableSimulcast) {
        // disableSimulcast implies disableAdaptiveSimulcast.
        var value = this.options.conference.disableSimulcast ? true :
            this.options.conference.disableAdaptiveSimulcast;
        elem.c(
            'property', {
                name: 'disableAdaptiveSimulcast',
                value: value
            }).up();
    }
    if (this.options.conference.disableRtx !== undefined) {
        elem.c(
            'property', {
                name: 'disableRtx',
                value: this.options.conference.disableRtx
            }).up();
    }
    elem.c(
        'property', {
            name: 'enableLipSync',
            value: false !== this.options.connection.enableLipSync
        }).up();
    if (this.options.conference.audioPacketDelay !== undefined) {
        elem.c(
            'property', {
                name: 'audioPacketDelay',
                value: this.options.conference.audioPacketDelay
            }).up();
    }
    if (this.options.conference.startBitrate) {
        elem.c(
            'property', {
                name: 'startBitrate',
                value: this.options.conference.startBitrate
            }).up();
    }
    if (this.options.conference.minBitrate) {
        elem.c(
            'property', {
                name: 'minBitrate',
                value: this.options.conference.minBitrate
            }).up();
    }
    if (this.options.conference.openSctp !== undefined) {
        elem.c(
            'property', {
                name: 'openSctp',
                value: this.options.conference.openSctp
            }).up();
    }
    if (this.options.conference.startAudioMuted !== undefined) {
        elem.c(
            'property', {
                name: 'startAudioMuted',
                value: this.options.conference.startAudioMuted
            }).up();
    }
    if (this.options.conference.startVideoMuted !== undefined) {
        elem.c(
            'property', {
                name: 'startVideoMuted',
                value: this.options.conference.startVideoMuted
            }).up();
    }
    if (this.options.conference.stereo !== undefined) {
        elem.c(
            'property', {
                name: 'stereo',
                value: this.options.conference.stereo
            }).up();
    }

    elem.c(
        'property', {
            name: 'simulcastMode',
            value: 'rewriting'
        }).up();

    if (this.options.conference.useRoomAsSharedDocumentName !== undefined) {
        elem.c(
            'property', {
                name: 'useRoomAsSharedDocumentName',
                value: this.options.conference.useRoomAsSharedDocumentName
            }).up();
    }
    elem.up();
    return elem;
};


Moderator.prototype.parseSessionId =  function (resultIq) {
    var sessionId = $(resultIq).find('conference').attr('session-id');
    if (sessionId) {
        logger.info('Received sessionId:  ' + sessionId);
        Settings.setSessionId(sessionId);
    }
};

Moderator.prototype.parseConfigOptions =  function (resultIq) {

    this.setFocusUserJid(
        $(resultIq).find('conference').attr('focusjid'));

    var authenticationEnabled
        = $(resultIq).find(
            '>conference>property' +
            '[name=\'authentication\'][value=\'true\']').length > 0;

    logger.info("Authentication enabled: " + authenticationEnabled);

    this.externalAuthEnabled = $(resultIq).find(
            '>conference>property' +
            '[name=\'externalAuth\'][value=\'true\']').length > 0;

    logger.info(
        'External authentication enabled: ' + this.externalAuthEnabled);

    if (!this.externalAuthEnabled) {
        // We expect to receive sessionId in 'internal' authentication mode
        this.parseSessionId(resultIq);
    }

    var authIdentity = $(resultIq).find('>conference').attr('identity');

    this.eventEmitter.emit(AuthenticationEvents.IDENTITY_UPDATED,
        authenticationEnabled, authIdentity);

    // Check if focus has auto-detected Jigasi component(this will be also
    // included if we have passed our host from the config)
    if ($(resultIq).find(
        '>conference>property' +
        '[name=\'sipGatewayEnabled\'][value=\'true\']').length) {
        this.sipGatewayEnabled = true;
    }

    logger.info("Sip gateway enabled:  " + this.sipGatewayEnabled);
};

// FIXME We need to show the fact that we're waiting for the focus to the user
// (or that the focus is not available)
/**
 * Allocates the conference focus.
 *
 * @param {Function} callback - the function to be called back upon the
 * successful allocation of the conference focus
 */
Moderator.prototype.allocateConferenceFocus =  function (callback) {
    // Try to use focus user JID from the config
    this.setFocusUserJid(this.options.connection.focusUserJid);
    // Send create conference IQ
    this.connection.sendIQ(
        this.createConferenceIq(),
        result => this._allocateConferenceFocusSuccess(result, callback),
        error => this._allocateConferenceFocusError(error, callback));
    // XXX We're pressed for time here because we're beginning a complex and/or
    // lengthy conference-establishment process which supposedly involves
    // multiple RTTs. We don't have the time to wait for Strophe to decide to
    // send our IQ.
    this.connection.flush();
};

/**
 * Invoked by {@link #allocateConferenceFocus} upon its request receiving an
 * error result.
 *
 * @param error - the error result of the request that
 * {@link #allocateConferenceFocus} sent
 * @param {Function} callback - the function to be called back upon the
 * successful allocation of the conference focus
 */
Moderator.prototype._allocateConferenceFocusError = function (error, callback) {
    // If the session is invalid, remove and try again without session ID to get
    // a new one
    var invalidSession = $(error).find('>error>session-invalid').length;
    if (invalidSession) {
        logger.info("Session expired! - removing");
        Settings.clearSessionId();
    }
    if ($(error).find('>error>graceful-shutdown').length) {
        this.eventEmitter.emit(XMPPEvents.GRACEFUL_SHUTDOWN);
        return;
    }
    // Check for error returned by the reservation system
    var reservationErr = $(error).find('>error>reservation-error');
    if (reservationErr.length) {
        // Trigger error event
        var errorCode = reservationErr.attr('error-code');
        var errorTextNode = $(error).find('>error>text');
        var errorMsg;
        if (errorTextNode) {
            errorMsg = errorTextNode.text();
        }
        this.eventEmitter.emit(
                XMPPEvents.RESERVATION_ERROR, errorCode, errorMsg);
        return;
    }
    // Not authorized to create new room
    if ($(error).find('>error>not-authorized').length) {
        logger.warn("Unauthorized to start the conference", error);
        var toDomain = Strophe.getDomainFromJid(error.getAttribute('to'));
        if (toDomain !== this.options.connection.hosts.anonymousdomain) {
            //FIXME "is external" should come either from the focus or config.js
            this.externalAuthEnabled = true;
        }
        this.eventEmitter.emit(XMPPEvents.AUTHENTICATION_REQUIRED);
        return;
    }
    var waitMs = this.getNextErrorTimeout();
    var errmsg = "Focus error, retry after "+ waitMs;
    GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
    logger.error(errmsg, error);
    // Show message
    var focusComponent = this.getFocusComponent();
    var retrySec = waitMs / 1000;
    //FIXME: message is duplicated ? Do not show in case of session invalid
    // which means just a retry
    if (!invalidSession) {
        this.eventEmitter.emit(
                XMPPEvents.FOCUS_DISCONNECTED, focusComponent, retrySec);
    }
    // Reset response timeout
    this.getNextTimeout(true);
    window.setTimeout( () => this.allocateConferenceFocus(callback), waitMs);
};

/**
 * Invoked by {@link #allocateConferenceFocus} upon its request receiving a
 * success (i.e. non-error) result.
 *
 * @param result - the success (i.e. non-error) result of the request that
 * {@link #allocateConferenceFocus} sent
 * @param {Function} callback - the function to be called back upon the
 * successful allocation of the conference focus
 */
Moderator.prototype._allocateConferenceFocusSuccess = function (
        result,
        callback) {
    // Setup config options
    this.parseConfigOptions(result);

    // Reset the error timeout (because we haven't failed here).
    this.getNextErrorTimeout(true);
    if ('true' === $(result).find('conference').attr('ready')) {
        // Reset the non-error timeout (because we've succeeded here).
        this.getNextTimeout(true);
        // Exec callback
        callback();
    } else {
        var waitMs = this.getNextTimeout();
        logger.info("Waiting for the focus... " + waitMs);
        window.setTimeout(() => this.allocateConferenceFocus(callback),
            waitMs);
    }
};

Moderator.prototype.authenticate = function () {
    return new Promise((resolve, reject) => {
        this.connection.sendIQ(
            this.createConferenceIq(),
            result => {
                this.parseSessionId(result);
                resolve();
            }, error => {
                var code = $(error).find('>error').attr('code');
                reject(error, code);
            }
        );
    });
};

Moderator.prototype.getLoginUrl = function (urlCallback, failureCallback) {
    this._getLoginUrl(/* popup */ false, urlCallback, failureCallback);
};

/**
 *
 * @param {boolean} popup false for {@link Moderator#getLoginUrl} or true for
 * {@link Moderator#getPopupLoginUrl}
 * @param urlCb
 * @param failureCb
 */
Moderator.prototype._getLoginUrl = function (popup, urlCb, failureCb) {
    var iq = $iq({to: this.getFocusComponent(), type: 'get'});
    var attrs = {
        xmlns: 'http://jitsi.org/protocol/focus',
        room: this.roomName,
        'machine-uid': Settings.getMachineId()
    };
    var str = 'auth url'; // for logger
    if (popup) {
       attrs.popup = true;
       str = 'POPUP ' + str;
    }
    iq.c('login-url', attrs);
    /**
     * Implements a failure callback which reports an error message and an error
     * through (1) GlobalOnErrorHandler, (2) logger, and (3) failureCb.
     *
     * @param {string} errmsg the error messsage to report
     * @param {*} error the error to report (in addition to errmsg)
     */
    function reportError(errmsg, err) {
        GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
        logger.error(errmsg, err);
        failureCb(err);
    }
    this.connection.sendIQ(
        iq,
        function (result) {
            var url = $(result).find('login-url').attr('url');
            url = decodeURIComponent(url);
            if (url) {
                logger.info('Got ' + str + ': ' + url);
                urlCb(url);
            } else {
                reportError('Failed to get ' + str + ' from the focus', result);
            }
        },
        reportError.bind(undefined, 'Get ' + str + ' error')
    );
};

Moderator.prototype.getPopupLoginUrl = function (urlCallback, failureCallback) {
    this._getLoginUrl(/* popup */ true, urlCallback, failureCallback);
};

Moderator.prototype.logout =  function (callback) {
    var iq = $iq({to: this.getFocusComponent(), type: 'set'});
    var sessionId = Settings.getSessionId();
    if (!sessionId) {
        callback();
        return;
    }
    iq.c('logout', {
        xmlns: 'http://jitsi.org/protocol/focus',
        'session-id': sessionId
    });
    this.connection.sendIQ(
        iq,
        function (result) {
            var logoutUrl = $(result).find('logout').attr('logout-url');
            if (logoutUrl) {
                logoutUrl = decodeURIComponent(logoutUrl);
            }
            logger.info("Log out OK, url: " + logoutUrl, result);
            Settings.clearSessionId();
            callback(logoutUrl);
        }.bind(this),
        function (error) {
            var errmsg = "Logout error";
            GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
            logger.error(errmsg, error);
        }
    );
};

module.exports = Moderator;
