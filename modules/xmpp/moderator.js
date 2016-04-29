/* global $, $iq, Promise, Strophe */

var logger = require("jitsi-meet-logger").getLogger(__filename);
var XMPPEvents = require("../../service/xmpp/XMPPEvents");

var AuthenticationEvents
    = require("../../service/authentication/AuthenticationEvents");

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

function Moderator(roomName, xmpp, emitter, settings, options) {
    this.roomName = roomName;
    this.xmppService = xmpp;
    this.getNextTimeout = createExpBackoffTimer(1000);
    this.getNextErrorTimeout = createExpBackoffTimer(1000);
    // External authentication stuff
    this.externalAuthEnabled = false;
    this.settings = settings;
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
            settings.setSessionId(event.data.sessionId);
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
    if (resource === 'focus' && !this.xmppService.sessionTerminated) {
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
    var sessionId = this.settings.getSessionId();
    var machineUID = this.settings.getUserId();

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
    if (this.options.connection.hosts !== undefined
        && this.options.connection.hosts.bridge !== undefined) {
        elem.c(
            'property', {
                name: 'bridge',
                value: this.options.connection.hosts.bridge
            }).up();
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
    if (this.options.conference.adaptiveLastN !== undefined) {
        elem.c(
            'property', {
                name: 'adaptiveLastN',
                value: this.options.conference.adaptiveLastN
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
    // TODO: re-enable once rtx is stable
    //if (this.options.conference.disableRtx !== undefined) {
        elem.c(
            'property', {
                name: 'disableRtx',
                //value: this.options.conference.disableRtx
                value: true
            }).up();
    //}
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
    elem.up();
    return elem;
};


Moderator.prototype.parseSessionId =  function (resultIq) {
    var sessionId = $(resultIq).find('conference').attr('session-id');
    if (sessionId) {
        logger.info('Received sessionId:  ' + sessionId);
        this.settings.setSessionId(sessionId);
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

    console.info(
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
    var self = this;
    this.connection.sendIQ(
        this.createConferenceIq(),
        function (result) {
            self._allocateConferenceFocusSuccess(result, callback);
        },
        function (error) {
            self._allocateConferenceFocusError(error, callback);
        });
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
    var self = this;

    // If the session is invalid, remove and try again without session ID to get
    // a new one
    var invalidSession = $(error).find('>error>session-invalid').length;
    if (invalidSession) {
        logger.info("Session expired! - removing");
        self.settings.clearSessionId();
    }
    if ($(error).find('>error>graceful-shutdown').length) {
        self.eventEmitter.emit(XMPPEvents.GRACEFUL_SHUTDOWN);
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
        self.eventEmitter.emit(
                XMPPEvents.RESERVATION_ERROR, errorCode, errorMsg);
        return;
    }
    // Not authorized to create new room
    if ($(error).find('>error>not-authorized').length) {
        logger.warn("Unauthorized to start the conference", error);
        var toDomain = Strophe.getDomainFromJid(error.getAttribute('to'));
        if (toDomain !== self.options.connection.hosts.anonymousdomain) {
            //FIXME "is external" should come either from the focus or config.js
            self.externalAuthEnabled = true;
        }
        self.eventEmitter.emit(
                XMPPEvents.AUTHENTICATION_REQUIRED,
                function () {
                    self.allocateConferenceFocus(callback);
                });
        return;
    }
    var waitMs = self.getNextErrorTimeout();
    logger.error("Focus error, retry after " + waitMs, error);
    // Show message
    var focusComponent = self.getFocusComponent();
    var retrySec = waitMs / 1000;
    //FIXME: message is duplicated ? Do not show in case of session invalid
    // which means just a retry
    if (!invalidSession) {
        self.eventEmitter.emit(
                XMPPEvents.FOCUS_DISCONNECTED, focusComponent, retrySec);
    }
    // Reset response timeout
    self.getNextTimeout(true);
    window.setTimeout(
            function () {
                self.allocateConferenceFocus(callback);
            },
            waitMs);
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
        var self = this;
        window.setTimeout(
                function () {
                    self.allocateConferenceFocus(callback);
                },
                waitMs);
    }
};

Moderator.prototype.authenticate = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
        self.connection.sendIQ(
            self.createConferenceIq(),
            function (result) {
                self.parseSessionId(result);
                resolve();
            }, function (error) {
                var code = $(error).find('>error').attr('code');
                reject(error, code);
            }
        );
    });
};

Moderator.prototype.getLoginUrl =  function (urlCallback, failureCallback) {
    var iq = $iq({to: this.getFocusComponent(), type: 'get'});
    iq.c('login-url', {
        xmlns: 'http://jitsi.org/protocol/focus',
        room: this.roomName,
        'machine-uid': this.settings.getUserId()
    });
    this.connection.sendIQ(
        iq,
        function (result) {
            var url = $(result).find('login-url').attr('url');
            url = url = decodeURIComponent(url);
            if (url) {
                logger.info("Got auth url: " + url);
                urlCallback(url);
            } else {
                logger.error(
                    "Failed to get auth url from the focus", result);
                failureCallback(result);
            }
        },
        function (error) {
            logger.error("Get auth url error", error);
            failureCallback(error);
        }
    );
};

Moderator.prototype.getPopupLoginUrl = function (urlCallback, failureCallback) {
    var iq = $iq({to: this.getFocusComponent(), type: 'get'});
    iq.c('login-url', {
        xmlns: 'http://jitsi.org/protocol/focus',
        room: this.roomName,
        'machine-uid': this.settings.getUserId(),
        popup: true
    });
    this.connection.sendIQ(
        iq,
        function (result) {
            var url = $(result).find('login-url').attr('url');
            url = url = decodeURIComponent(url);
            if (url) {
                logger.info("Got POPUP auth url:  " + url);
                urlCallback(url);
            } else {
                logger.error(
                    "Failed to get POPUP auth url from the focus", result);
               failureCallback(result);
            }
        },
        function (error) {
            logger.error('Get POPUP auth url error', error);
            failureCallback(error);
        }
    );
};

Moderator.prototype.logout =  function (callback) {
    var iq = $iq({to: this.getFocusComponent(), type: 'set'});
    var sessionId = this.settings.getSessionId();
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
            this.settings.clearSessionId();
            callback(logoutUrl);
        }.bind(this),
        function (error) {
            logger.error("Logout error", error);
        }
    );
};

module.exports = Moderator;
