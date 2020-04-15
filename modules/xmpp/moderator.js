/* global $, Promise */

const logger = require('jitsi-meet-logger').getLogger(__filename);

import { $iq, Strophe } from 'strophe.js';

const XMPPEvents = require('../../service/xmpp/XMPPEvents');
const AuthenticationEvents
    = require('../../service/authentication/AuthenticationEvents');
const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

import Settings from '../settings/Settings';

/**
 *
 * @param step
 */
function createExpBackoffTimer(step) {
    let count = 1;

    return function(reset) {
        // Reset call
        if (reset) {
            count = 1;

            return;
        }

        // Calculate next timeout
        const timeout = Math.pow(2, count - 1);

        count += 1;

        return timeout * step;
    };
}

/* eslint-disable max-params */

/**
 *
 * @param roomName
 * @param xmpp
 * @param emitter
 * @param options
 */
export default function Moderator(roomName, xmpp, emitter, options) {
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
    this.sipGatewayEnabled
        = this.options.connection.hosts
            && this.options.connection.hosts.call_control !== undefined;

    this.eventEmitter = emitter;

    this.connection = this.xmppService.connection;

    // FIXME: Message listener that talks to POPUP window
    /**
     *
     * @param event
     */
    function listener(event) {
        if (event.data && event.data.sessionId) {
            if (event.origin !== window.location.origin) {
                logger.warn(
                    `Ignoring sessionId from different origin: ${
                        event.origin}`);

                return;
            }
            Settings.sessionId = event.data.sessionId;

            // After popup is closed we will authenticate
        }
    }

    // Register
    if (window.addEventListener) {
        window.addEventListener('message', listener, false);
    } else {
        window.attachEvent('onmessage', listener);
    }
}

/* eslint-enable max-params */

Moderator.prototype.isExternalAuthEnabled = function() {
    return this.externalAuthEnabled;
};

Moderator.prototype.isSipGatewayEnabled = function() {
    return this.sipGatewayEnabled;
};

Moderator.prototype.onMucMemberLeft = function(jid) {
    logger.info(`Someone left is it focus ? ${jid}`);
    const resource = Strophe.getResourceFromJid(jid);

    if (resource === 'focus') {
        logger.info(
            'Focus has left the room - leaving conference');
        this.eventEmitter.emit(XMPPEvents.FOCUS_LEFT);
    }
};

Moderator.prototype.setFocusUserJid = function(focusJid) {
    if (!this.focusUserJid) {
        this.focusUserJid = focusJid;
        logger.info(`Focus jid set to:  ${this.focusUserJid}`);
    }
};

Moderator.prototype.getFocusUserJid = function() {
    return this.focusUserJid;
};

Moderator.prototype.getFocusComponent = function() {
    // Get focus component address
    let focusComponent = this.options.connection.hosts.focus;

    // If not specified use default:  'focus.domain'

    if (!focusComponent) {
        focusComponent = `focus.${this.options.connection.hosts.domain}`;
    }

    return focusComponent;
};

Moderator.prototype.createConferenceIq = function() {
    // Generate create conference IQ
    const elem = $iq({ to: this.getFocusComponent(),
        type: 'set' });

    // Session Id used for authentication
    const { sessionId } = Settings;
    const machineUID = Settings.machineId;
    const config = this.options.conference;

    logger.info(`Session ID: ${sessionId} machine UID: ${machineUID}`);

    elem.c('conference', {
        xmlns: 'http://jitsi.org/protocol/focus',
        room: this.roomName,
        'machine-uid': machineUID
    });

    if (sessionId) {
        elem.attrs({ 'session-id': sessionId });
    }
    if (this.options.connection.enforcedBridge !== undefined) {
        elem.c(
            'property', {
                name: 'enforcedBridge',
                value: this.options.connection.enforcedBridge
            }).up();
    }

    // Tell the focus we have Jigasi configured
    if (this.options.connection.hosts !== undefined
        && this.options.connection.hosts.call_control !== undefined) {
        elem.c(
            'property', {
                name: 'call_control',
                value: this.options.connection.hosts.call_control
            }).up();
    }
    if (config.channelLastN !== undefined) {
        elem.c(
            'property', {
                name: 'channelLastN',
                value: config.channelLastN
            }).up();
    }
    elem.c(
        'property', {
            name: 'disableRtx',
            value: Boolean(config.disableRtx)
        }).up();

    if (config.enableTcc !== undefined) {
        elem.c(
                'property', {
                    name: 'enableTcc',
                    value: Boolean(config.enableTcc)
                }).up();
    }
    if (config.enableRemb !== undefined) {
        elem.c(
                'property', {
                    name: 'enableRemb',
                    value: Boolean(config.enableRemb)
                }).up();
    }
    if (config.minParticipants !== undefined) {
        elem.c(
                'property', {
                    name: 'minParticipants',
                    value: config.minParticipants
                }).up();
    }

    elem.c(
        'property', {
            name: 'enableLipSync',
            value: this.options.connection.enableLipSync === true
        }).up();
    if (config.audioPacketDelay !== undefined) {
        elem.c(
            'property', {
                name: 'audioPacketDelay',
                value: config.audioPacketDelay
            }).up();
    }
    if (config.startBitrate) {
        elem.c(
            'property', {
                name: 'startBitrate',
                value: config.startBitrate
            }).up();
    }
    if (config.minBitrate) {
        elem.c(
            'property', {
                name: 'minBitrate',
                value: config.minBitrate
            }).up();
    }
    if (config.testing && config.testing.octo
        && typeof config.testing.octo.probability === 'number') {
        if (Math.random() < config.testing.octo.probability) {
            elem.c(
                'property', {
                    name: 'octo',
                    value: true
                }).up();
        }
    }

    let openSctp;

    switch (this.options.conference.openBridgeChannel) {
    case 'datachannel':
    case true:
    case undefined:
        openSctp = true;
        break;
    case 'websocket':
        openSctp = false;
        break;
    }

    elem.c(
        'property', {
            name: 'openSctp',
            value: openSctp
        }).up();

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


Moderator.prototype.parseSessionId = function(resultIq) {
    // eslint-disable-next-line newline-per-chained-call
    const sessionId = $(resultIq).find('conference').attr('session-id');

    if (sessionId) {
        logger.info(`Received sessionId:  ${sessionId}`);
        Settings.sessionId = sessionId;
    }
};

Moderator.prototype.parseConfigOptions = function(resultIq) {
    // eslint-disable-next-line newline-per-chained-call
    this.setFocusUserJid($(resultIq).find('conference').attr('focusjid'));

    const authenticationEnabled
        = $(resultIq).find(
            '>conference>property'
            + '[name=\'authentication\'][value=\'true\']').length > 0;

    logger.info(`Authentication enabled: ${authenticationEnabled}`);

    this.externalAuthEnabled = $(resultIq).find(
        '>conference>property'
            + '[name=\'externalAuth\'][value=\'true\']').length > 0;

    logger.info(
        `External authentication enabled: ${this.externalAuthEnabled}`);

    if (!this.externalAuthEnabled) {
        // We expect to receive sessionId in 'internal' authentication mode
        this.parseSessionId(resultIq);
    }

    // eslint-disable-next-line newline-per-chained-call
    const authIdentity = $(resultIq).find('>conference').attr('identity');

    this.eventEmitter.emit(AuthenticationEvents.IDENTITY_UPDATED,
        authenticationEnabled, authIdentity);

    // Check if focus has auto-detected Jigasi component(this will be also
    // included if we have passed our host from the config)
    if ($(resultIq).find(
        '>conference>property'
        + '[name=\'sipGatewayEnabled\'][value=\'true\']').length) {
        this.sipGatewayEnabled = true;
    }

    logger.info(`Sip gateway enabled:  ${this.sipGatewayEnabled}`);
};

// FIXME We need to show the fact that we're waiting for the focus to the user
// (or that the focus is not available)
/**
 * Allocates the conference focus.
 *
 * @param {Function} callback - the function to be called back upon the
 * successful allocation of the conference focus
 * @returns {Promise} - Resolved when Jicofo allows to join the room. It's never
 * rejected and it'll keep on pinging Jicofo forever.
 */
Moderator.prototype.allocateConferenceFocus = function() {
    return new Promise(resolve => {
        // Try to use focus user JID from the config
        this.setFocusUserJid(this.options.connection.focusUserJid);

        // Send create conference IQ
        this.connection.sendIQ(
            this.createConferenceIq(),
            result => this._allocateConferenceFocusSuccess(result, resolve),
            error => this._allocateConferenceFocusError(error, resolve));

        // XXX We're pressed for time here because we're beginning a complex
        // and/or lengthy conference-establishment process which supposedly
        // involves multiple RTTs. We don't have the time to wait for Strophe to
        // decide to send our IQ.
        this.connection.flush();
    });
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
Moderator.prototype._allocateConferenceFocusError = function(error, callback) {
    // If the session is invalid, remove and try again without session ID to get
    // a new one
    const invalidSession
        = $(error).find('>error>session-invalid').length
            || $(error).find('>error>not-acceptable').length;

    if (invalidSession) {
        logger.info('Session expired! - removing');
        Settings.sessionId = undefined;
    }
    if ($(error).find('>error>graceful-shutdown').length) {
        this.eventEmitter.emit(XMPPEvents.GRACEFUL_SHUTDOWN);

        return;
    }

    // Check for error returned by the reservation system
    const reservationErr = $(error).find('>error>reservation-error');

    if (reservationErr.length) {
        // Trigger error event
        const errorCode = reservationErr.attr('error-code');
        const errorTextNode = $(error).find('>error>text');
        let errorMsg;

        if (errorTextNode) {
            errorMsg = errorTextNode.text();
        }
        this.eventEmitter.emit(
            XMPPEvents.RESERVATION_ERROR,
            errorCode,
            errorMsg);

        return;
    }

    // Not authorized to create new room
    if ($(error).find('>error>not-authorized').length) {
        logger.warn('Unauthorized to start the conference', error);
        const toDomain = Strophe.getDomainFromJid(error.getAttribute('to'));

        if (toDomain !== this.options.connection.hosts.anonymousdomain) {
            // FIXME "is external" should come either from the focus or
            // config.js
            this.externalAuthEnabled = true;
        }
        this.eventEmitter.emit(XMPPEvents.AUTHENTICATION_REQUIRED);

        return;
    }
    const waitMs = this.getNextErrorTimeout();
    const errmsg = `Focus error, retry after ${waitMs}`;

    GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
    logger.error(errmsg, error);

    // Show message
    const focusComponent = this.getFocusComponent();
    const retrySec = waitMs / 1000;

    // FIXME: message is duplicated ? Do not show in case of session invalid
    // which means just a retry

    if (!invalidSession) {
        this.eventEmitter.emit(
            XMPPEvents.FOCUS_DISCONNECTED,
            focusComponent,
            retrySec);
    }

    // Reset response timeout
    this.getNextTimeout(true);
    window.setTimeout(
        () => this.allocateConferenceFocus().then(callback),
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
Moderator.prototype._allocateConferenceFocusSuccess = function(
        result,
        callback) {
    // Setup config options
    this.parseConfigOptions(result);

    // Reset the error timeout (because we haven't failed here).
    this.getNextErrorTimeout(true);

    // eslint-disable-next-line newline-per-chained-call
    if ($(result).find('conference').attr('ready') === 'true') {
        // Reset the non-error timeout (because we've succeeded here).
        this.getNextTimeout(true);

        // Exec callback
        callback();
    } else {
        const waitMs = this.getNextTimeout();

        logger.info(`Waiting for the focus... ${waitMs}`);
        window.setTimeout(
            () => this.allocateConferenceFocus().then(callback),
            waitMs);
    }
};

Moderator.prototype.authenticate = function() {
    return new Promise((resolve, reject) => {
        this.connection.sendIQ(
            this.createConferenceIq(),
            result => {
                this.parseSessionId(result);
                resolve();
            },
            errorIq => reject({
                error: $(errorIq).find('iq>error :first')
                    .prop('tagName'),
                message: $(errorIq).find('iq>error>text')
                    .text()
            })
        );
    });
};

Moderator.prototype.getLoginUrl = function(urlCallback, failureCallback) {
    this._getLoginUrl(/* popup */ false, urlCallback, failureCallback);
};

/**
 *
 * @param {boolean} popup false for {@link Moderator#getLoginUrl} or true for
 * {@link Moderator#getPopupLoginUrl}
 * @param urlCb
 * @param failureCb
 */
Moderator.prototype._getLoginUrl = function(popup, urlCb, failureCb) {
    const iq = $iq({ to: this.getFocusComponent(),
        type: 'get' });
    const attrs = {
        xmlns: 'http://jitsi.org/protocol/focus',
        room: this.roomName,
        'machine-uid': Settings.machineId
    };
    let str = 'auth url'; // for logger

    if (popup) {
        attrs.popup = true;
        str = `POPUP ${str}`;
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
        result => {
            // eslint-disable-next-line newline-per-chained-call
            let url = $(result).find('login-url').attr('url');

            url = decodeURIComponent(url);
            if (url) {
                logger.info(`Got ${str}: ${url}`);
                urlCb(url);
            } else {
                reportError(`Failed to get ${str} from the focus`, result);
            }
        },
        reportError.bind(undefined, `Get ${str} error`)
    );
};

Moderator.prototype.getPopupLoginUrl = function(urlCallback, failureCallback) {
    this._getLoginUrl(/* popup */ true, urlCallback, failureCallback);
};

Moderator.prototype.logout = function(callback) {
    const iq = $iq({ to: this.getFocusComponent(),
        type: 'set' });
    const { sessionId } = Settings;

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
        result => {
            // eslint-disable-next-line newline-per-chained-call
            let logoutUrl = $(result).find('logout').attr('logout-url');

            if (logoutUrl) {
                logoutUrl = decodeURIComponent(logoutUrl);
            }
            logger.info(`Log out OK, url: ${logoutUrl}`, result);
            Settings.sessionId = undefined;
            callback(logoutUrl);
        },
        error => {
            const errmsg = 'Logout error';

            GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
            logger.error(errmsg, error);
        }
    );
};
