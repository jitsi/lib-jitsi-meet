/* eslint-disable newline-per-chained-call */
import { getLogger } from '@jitsi/logger';
import $ from 'jquery';
import { $iq, Strophe } from 'strophe.js';

import Settings from '../settings/Settings';

const AuthenticationEvents
    = require('../../service/authentication/AuthenticationEvents');
const { XMPPEvents } = require('../../service/xmpp/XMPPEvents');
const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

const logger = getLogger(__filename);

/**
 *
 * @param step
 */
function createExpBackoffTimer(step) {
    let count = 1;
    const maxTimeout = 120000;

    return function(reset) {
        // Reset call
        if (reset) {
            count = 1;

            return;
        }

        // Calculate next timeout
        const timeout = Math.pow(2, count - 1);

        count += 1;

        return Math.min(timeout * step, maxTimeout);
    };
}

/**
 *
 * @param roomName
 * @param xmpp
 * @param emitter
 * @param options
 */
export default function Moderator(roomName, xmpp, emitter, options) {
    this.roomName = roomName;
    this.getNextTimeout = createExpBackoffTimer(1000);
    this.getNextErrorTimeout = createExpBackoffTimer(1000);
    this.options = options;

    // External authentication stuff
    this.externalAuthEnabled = false;

    // Whether SIP gateway (jigasi) support is enabled. TODO: use presence so it can be changed based on jigasi
    // availability.
    this.sipGatewayEnabled = false;

    this.eventEmitter = emitter;

    this.connection = xmpp.connection;

    // The JID to which conference-iq requests are sent over XMPP.
    this.targetJid = this.options.hosts?.focus;

    // If not specified default to 'focus.domain'
    if (!this.targetJid) {
        this.targetJid = `focus.${this.options.hosts?.domain}`;
    }

    this.targetUrl = this.options.conferenceRequestUrl;

    // Whether to send conference requests over HTTP or XMPP
    this.mode = this.targetUrl ? 'http' : 'xmpp';
    logger.info(`Using ${this.mode} for conference requests.`);

    // The set of JIDs known to belong to jicofo. Populated from configuration
    // and responses from conference requests.
    this.focusUserJids = new Set();

    if (options.focusUserJid) {
        this.focusUserJids.add(options.focusUserJid);
    }

    // FIXME: Message listener that talks to POPUP window
    /**
     *
     * @param event
     */
    function listener(event) {
        if (event.data && event.data.sessionId) {
            if (event.origin !== window.location.origin) {
                logger.warn(`Ignoring sessionId from different origin: ${event.origin}`);

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

Moderator.prototype.isFocusJid = function(jid) {
    if (!jid) {
        return false;
    }

    for (const focusJid of this.focusUserJids) {
        // jid may be a full JID, and focusUserJids may be bare JIDs
        if (jid.indexOf(`${focusJid}/`) === 0) {
            return true;
        }
    }

    return false;
};

Moderator.prototype.isExternalAuthEnabled = function() {
    return this.externalAuthEnabled;
};

Moderator.prototype.isSipGatewayEnabled = function() {
    return this.sipGatewayEnabled;
};

/**
 * Create a conference request based on the configured options and saved Settings.
 *
 * A conference request has the following format:
 * {
 *   room: "room@example.com",
 *   sessionId: "foo", // optional
 *   machineUdi: "bar", // optional
 *   identity: "baz", // optional
 *   properties: { } // map string to string
 * }
 *
 * It can be encoded in either JSON or and IQ.
 *
 * @returns the created conference request.
 */
Moderator.prototype._createConferenceRequest = function() {

    // Session Id used for authentication
    const { sessionId } = Settings;
    const config = this.options;
    const properties = {};

    if (config.startAudioMuted !== undefined) {
        properties.startAudioMuted = config.startAudioMuted;
    }
    if (config.startVideoMuted !== undefined) {
        properties.startVideoMuted = config.startVideoMuted;
    }

    // this flag determines whether the bridge will include this call in its
    // rtcstats reporting or not. If the site admin hasn't set the flag in
    // config.js, then the client defaults to false (see
    // react/features/rtcstats/functions.js in jitsi-meet). The server-side
    // components default to true to match the pre-existing behavior so we only
    // signal if false.
    const rtcstatsEnabled = config?.analytics?.rtcstatsEnabled ?? false;

    if (!rtcstatsEnabled) {
        properties.rtcstatsEnabled = false;
    }

    const conferenceRequest = {
        properties,
        machineUid: Settings.machineId,
        room: this.roomName
    };

    if (sessionId) {
        conferenceRequest.sessionId = sessionId;
    }

    return conferenceRequest;
};

/**
 * Create a conference request and encode it as an IQ.
 */
Moderator.prototype._createConferenceIq = function() {
    const conferenceRequest = this._createConferenceRequest();

    // Generate create conference IQ
    const elem = $iq({ to: this.targetJid,
        type: 'set' });

    elem.c('conference', {
        xmlns: 'http://jitsi.org/protocol/focus',
        room: this.roomName,
        'machine-uid': conferenceRequest.machineUid
    });

    if (conferenceRequest.sessionId) {
        elem.attrs({ 'session-id': conferenceRequest.sessionId });
    }

    for (const k in conferenceRequest.properties) {
        if (conferenceRequest.properties.hasOwnProperty(k)) {
            elem.c(
                'property', {
                    name: k,
                    value: conferenceRequest.properties[k]
                }).up();
        }
    }

    return elem;
};

Moderator.prototype._parseConferenceIq = function(resultIq) {
    const conferenceRequest = { properties: {} };

    conferenceRequest.focusJid = $(resultIq).find('conference').attr('focusjid');
    conferenceRequest.sessionId = $(resultIq).find('conference').attr('session-id');
    conferenceRequest.identity = $(resultIq).find('>conference').attr('identity');
    conferenceRequest.ready = $(resultIq).find('conference').attr('ready') === 'true';
    conferenceRequest.vnode = $(resultIq).find('conference').attr('vnode');

    if ($(resultIq).find('>conference>property[name=\'authentication\'][value=\'true\']').length > 0) {
        conferenceRequest.properties.authentication = 'true';
    }

    if ($(resultIq).find('>conference>property[name=\'externalAuth\'][value=\'true\']').length > 0) {
        conferenceRequest.properties.externalAuth = 'true';
    }

    // Check if jicofo has jigasi support enabled.
    if ($(resultIq).find('>conference>property[name=\'sipGatewayEnabled\'][value=\'true\']').length > 0) {
        conferenceRequest.properties.sipGatewayEnabled = 'true';
    }

    return conferenceRequest;
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
Moderator.prototype.sendConferenceRequest = function() {
    return new Promise(resolve => {
        if (this.mode === 'xmpp') {
            logger.info(`Sending conference request over XMPP to ${this.targetJid}`);

            this.connection.sendIQ(
                this._createConferenceIq(),
                result => this._handleIqSuccess(result, resolve),
                error => this._handleIqError(error, resolve));

            // XXX We're pressed for time here because we're beginning a complex
            // and/or lengthy conference-establishment process which supposedly
            // involves multiple RTTs. We don't have the time to wait for Strophe to
            // decide to send our IQ.
            this.connection.flush();
        } else {
            logger.info(`Sending conference request over HTTP to ${this.targetUrl}`);
            fetch(this.targetUrl, {
                method: 'POST',
                body: JSON.stringify(this._createConferenceRequest()),
                headers: { 'Content-Type': 'application/json' }
            })
            .then(response => {
                if (!response.ok) {
                    response.text().then(text => {
                        logger.warn(`Received HTTP ${response.status} ${response.statusText}. Body: ${text}`);
                        const sessionError = response.status === 400 && text.indexOf('400 invalid-session') > 0;
                        const notAuthorized = response.status === 403;

                        this._handleError(sessionError, notAuthorized, resolve);
                    })
                    .catch(error => {
                        logger.warn(`Error: ${error}`);
                        this._handleError();
                    });

                    // _handleError has either scheduled a retry or fired an event indicating failure.
                    return;
                }
                response.json().then(resultJson => {
                    this._handleSuccess(resultJson, resolve);
                });
            })
            .catch(error => {
                logger.warn(`Error: ${error}`);
                this._handleError();
            });
        }
    });
};

Moderator.prototype._handleSuccess = function(conferenceRequest, callback) {

    // Reset the error timeout (because we haven't failed here).
    this.getNextErrorTimeout(true);

    if (conferenceRequest.focusJid) {
        logger.info(`Adding focus JID: ${conferenceRequest.focusJid}`);
        this.focusUserJids.add(conferenceRequest.focusJid);
    } else {
        logger.warn('Conference request response contained no focusJid.');
    }

    const authenticationEnabled = conferenceRequest.properties.authentication === 'true';

    logger.info(`Authentication enabled: ${authenticationEnabled}`);

    this.externalAuthEnabled = conferenceRequest.properties.externalAuth === 'true';
    logger.info(`External authentication enabled: ${this.externalAuthEnabled}`);

    if (!this.externalAuthEnabled && conferenceRequest.sessionId) {
        logger.info(`Received sessionId: ${conferenceRequest.sessionId}`);
        Settings.sessionId = conferenceRequest.sessionId;
    }

    this.eventEmitter.emit(AuthenticationEvents.IDENTITY_UPDATED, authenticationEnabled, conferenceRequest.identity);

    this.sipGatewayEnabled = conferenceRequest.properties.sipGatewayEnabled;
    logger.info(`Sip gateway enabled: ${this.sipGatewayEnabled}`);

    if (conferenceRequest.ready) {
        // Reset the non-error timeout (because we've succeeded here).
        this.getNextTimeout(true);

        if (conferenceRequest.vnode) {
            logger.warn(`Redirected to: ${conferenceRequest.vnode} with focusJid ${conferenceRequest.focusJid} }`);

            this.eventEmitter.emit(XMPPEvents.REDIRECTED, conferenceRequest.vnode, conferenceRequest.focusJid);

            return;
        }

        logger.info('Conference-request successful, ready to join the MUC.');
        callback();
    } else {
        const waitMs = this.getNextTimeout();

        // This was a successful response, but the "ready" flag is not set. Retry after a timeout.
        logger.info(`Not ready yet, will retry in ${waitMs} ms.`);
        window.setTimeout(
            () => this.sendConferenceRequest().then(callback),
            waitMs);
    }
};

Moderator.prototype._handleError = function(sessionError, notAuthorized, callback) {
    // If the session is invalid, remove and try again without session ID to get
    // a new one
    if (sessionError) {
        logger.info('Session expired! - removing');
        Settings.sessionId = undefined;
    }

    // Not authorized to create new room
    if (notAuthorized) {
        logger.warn('Unauthorized to start the conference');
        this.eventEmitter.emit(XMPPEvents.AUTHENTICATION_REQUIRED);

        return;
    }

    const waitMs = this.getNextErrorTimeout();

    if (sessionError && waitMs < 60000) {
        // If the session is invalid, retry a limited number of times and then fire an error.
        logger.info(`Invalid session, will retry after ${waitMs} ms.`);
        this.getNextTimeout(true);
        window.setTimeout(() => this.sendConferenceRequest().then(callback), waitMs);
    } else {
        const errmsg = 'Failed to get a successful response, giving up.';
        const error = new Error(errmsg);

        logger.error(errmsg, error);
        GlobalOnErrorHandler.callErrorHandler(error);

        // This is a "fatal" error and the user of the lib should handle it accordingly.
        // TODO: change the event name to something accurate.
        this.eventEmitter.emit(XMPPEvents.FOCUS_DISCONNECTED);
    }
};

/**
 * Invoked by {@link #sendConferenecRequest} upon its request receiving an
 * error result.
 *
 * @param error - the error result of the request that {@link sendConferenceRequest} sent
 * @param {Function} callback - the function to be called back upon the
 * successful allocation of the conference focus
 */
Moderator.prototype._handleIqError = function(error, callback) {

    // The reservation system only works over XMPP. Handle the error separately.
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

    const invalidSession
        = Boolean($(error).find('>error>session-invalid').length
            || $(error).find('>error>not-acceptable').length);

    // Not authorized to create new room
    const notAuthorized = $(error).find('>error>not-authorized').length > 0;

    if (notAuthorized && Strophe.getDomainFromJid(error.getAttribute('to')) !== this.options.hosts.anonymousdomain) {
        // FIXME "is external" should come either from the focus or
        // config.js
        this.externalAuthEnabled = true;
    }

    this._handleError(invalidSession, notAuthorized, callback);
};

/**
 * Invoked by {@link #sendConferenecRequest} upon its request receiving a
 * success (i.e. non-error) result.
 *
 * @param result - the success (i.e. non-error) result of the request that {@link #sendConferenecRequest} sent
 * @param {Function} callback - the function to be called back upon the
 * successful allocation of the conference focus
 */
Moderator.prototype._handleIqSuccess = function(
        result,
        callback) {
    // Setup config options
    const conferenceRequest = this._parseConferenceIq(result);

    this._handleSuccess(conferenceRequest, callback);
};

Moderator.prototype.authenticate = function() {
    return new Promise((resolve, reject) => {
        this.connection.sendIQ(
            this._createConferenceIq(),
            result => {
                const sessionId = $(result).find('conference').attr('session-id');

                if (sessionId) {
                    logger.info(`Received sessionId:  ${sessionId}`);
                    Settings.sessionId = sessionId;
                } else {
                    logger.warn('Response did not contain a session-id');
                }

                resolve();
            },
            errorIq => reject({
                error: $(errorIq).find('iq>error :first').prop('tagName'),
                message: $(errorIq).find('iq>error>text').text()
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
    const iq = $iq({ to: this.targetJid,
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
    const iq = $iq({ to: this.targetJid,
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
