/* eslint-disable newline-per-chained-call */
import { getLogger } from '@jitsi/logger';
import $ from 'jquery';
import { $iq } from 'strophe.js';

import { CONNECTION_REDIRECTED } from '../../JitsiConnectionEvents';
import FeatureFlags from '../flags/FeatureFlags';
import Settings from '../settings/Settings';
import Listenable from '../util/Listenable';

const AuthenticationEvents
    = require('../../service/authentication/AuthenticationEvents');
const { XMPPEvents } = require('../../service/xmpp/XMPPEvents');

const logger = getLogger(__filename);

/**
 * Exponential backoff timer.
 * @param step the step to use.
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
 * The moderator/focus responsible for direct communication with jicofo
 */
export default class Moderator extends Listenable {
    /**
     * Constructs moderator.
     * @param xmpp The xmpp.
     */
    constructor(xmpp) {
        super();

        this.getNextTimeout = createExpBackoffTimer(1000);
        this.getNextErrorTimeout = createExpBackoffTimer(1000);
        this.options = xmpp.options;

        // Whether SIP gateway (jigasi) support is enabled. TODO: use presence so it can be changed based on jigasi
        // availability.
        this.sipGatewayEnabled = false;

        this.xmpp = xmpp;
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

        if (this.options.focusUserJid) {
            this.focusUserJids.add(this.options.focusUserJid);
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

    /**
     * Check whether the supplied jid is a known jid for focus.
     * @param jid
     * @returns {boolean}
     */
    isFocusJid(jid) {
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
    }

    /**
     * Is sip gw enabled.
     * @returns {boolean}
     */
    isSipGatewayEnabled() {
        return this.sipGatewayEnabled;
    }

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
     * @param roomJid - The room jid for which to send conference request.
     *
     * @returns the created conference request.
     */
    _createConferenceRequest(roomJid) {
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
        // components default to true to match the pre-existing behavior, so we only
        // signal if false.
        const rtcstatsEnabled = config?.analytics?.rtcstatsEnabled ?? false;

        if (!rtcstatsEnabled) {
            properties.rtcstatsEnabled = false;
        }

        const conferenceRequest = {
            properties,
            machineUid: Settings.machineId,
            room: roomJid
        };

        if (sessionId) {
            conferenceRequest.sessionId = sessionId;
        }

        if (FeatureFlags.isJoinAsVisitorSupported() && !config.iAmRecorder && !config.iAmSipGateway) {
            conferenceRequest.properties['visitors-version'] = 1;

            if (this.options.preferVisitor) {
                conferenceRequest.properties.visitor = true;
            }
        }

        return conferenceRequest;
    }

    /**
     * Create a conference request and encode it as an IQ.
     *
     * @param roomJid - The room jid for which to send conference request.
     */
    _createConferenceIq(roomJid) {
        const conferenceRequest = this._createConferenceRequest(roomJid);

        // Generate create conference IQ
        const elem = $iq({
            to: this.targetJid,
            type: 'set'
        });

        elem.c('conference', {
            xmlns: 'http://jitsi.org/protocol/focus',
            room: roomJid,
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
                    })
                    .up();
            }
        }

        return elem;
    }

    /**
     * Parses a conference IQ.
     * @param resultIq the result IQ that is received.
     * @returns {{properties: {}}} Returns an object with the parsed properties.
     * @private
     */
    _parseConferenceIq(resultIq) {
        const conferenceRequest = { properties: {} };

        conferenceRequest.focusJid = $(resultIq)
            .find('conference')
            .attr('focusjid');
        conferenceRequest.sessionId = $(resultIq)
            .find('conference')
            .attr('session-id');
        conferenceRequest.identity = $(resultIq)
            .find('>conference')
            .attr('identity');
        conferenceRequest.ready = $(resultIq)
            .find('conference')
            .attr('ready') === 'true';
        conferenceRequest.vnode = $(resultIq)
            .find('conference')
            .attr('vnode');

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
    }

    // FIXME We need to show the fact that we're waiting for the focus to the user
    // (or that the focus is not available)
    /**
     * Allocates the conference focus.
     * @param roomJid - The room jid for which to send conference request.
     * @returns {Promise} - Resolved when Jicofo allows to join the room. It's never
     * rejected, and it'll keep on pinging Jicofo forever.
     */
    sendConferenceRequest(roomJid) {
        // there is no point of sending conference iq when in visitor mode (disableFocus)
        // when we have sent early the conference request via http
        // we want to skip sending it here, or visitors can loop
        if (this.conferenceRequestSent) {
            return Promise.resolve();
        }

        // to mark whether we have already sent a conference request
        this.conferenceRequestSent = false;

        return new Promise(resolve => {
            if (this.mode === 'xmpp') {
                logger.info(`Sending conference request over XMPP to ${this.targetJid}`);

                this.connection.sendIQ(
                    this._createConferenceIq(roomJid),
                    result => this._handleIqSuccess(roomJid, result, resolve),
                    error => this._handleIqError(roomJid, error, resolve));

                // XXX We're pressed for time here because we're beginning a complex
                // and/or lengthy conference-establishment process which supposedly
                // involves multiple RTTs. We don't have the time to wait for Strophe to
                // decide to send our IQ.
                this.connection.flush();
            } else {
                logger.info(`Sending conference request over HTTP to ${this.targetUrl}`);
                fetch(this.targetUrl, {
                    method: 'POST',
                    body: JSON.stringify(this._createConferenceRequest(roomJid)),
                    headers: { 'Content-Type': 'application/json' }
                })
                    .then(response => {
                        if (!response.ok) {
                            response.text()
                                .then(text => {
                                    logger.warn(`Received HTTP ${response.status} ${
                                        response.statusText}. Body: ${text}`);
                                    const sessionError = response.status === 400
                                        && text.indexOf('400 invalid-session') > 0;
                                    const notAuthorized = response.status === 403;

                                    this._handleError(roomJid, sessionError, notAuthorized, resolve);
                                })
                                .catch(error => {
                                    logger.warn(`Error: ${error}`);
                                    this._handleError(roomJid);
                                });

                            // _handleError has either scheduled a retry or fired an event indicating failure.
                            return;
                        }
                        response.json()
                            .then(resultJson => {
                                this._handleSuccess(roomJid, resultJson, resolve);
                            });
                    })
                    .catch(error => {
                        logger.warn(`Error: ${error}`);
                        this._handleError(roomJid);
                    });
            }
        }).then(() => {
            this.conferenceRequestSent = true;
        });
    }

    /**
     * Handles success response for conference IQ.
     * @param roomJid
     * @param conferenceRequest
     * @param callback
     * @private
     */
    _handleSuccess(roomJid, conferenceRequest, callback) {
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

        if (conferenceRequest.sessionId) {
            logger.info(`Received sessionId: ${conferenceRequest.sessionId}`);
            Settings.sessionId = conferenceRequest.sessionId;
        }

        this.eventEmitter.emit(
            AuthenticationEvents.IDENTITY_UPDATED, authenticationEnabled, conferenceRequest.identity);

        this.sipGatewayEnabled = conferenceRequest.properties.sipGatewayEnabled;
        logger.info(`Sip gateway enabled: ${this.sipGatewayEnabled}`);

        if (conferenceRequest.ready) {
            // Reset the non-error timeout (because we've succeeded here).
            this.getNextTimeout(true);

            // we want to ignore redirects when this is jibri (record/live-stream or a sip jibri)
            if (conferenceRequest.vnode && !this.options.iAmRecorder && !this.options.iAmSipGateway) {
                logger.warn(`Redirected to: ${conferenceRequest.vnode} with focusJid ${conferenceRequest.focusJid}`);

                this.xmpp.eventEmitter.emit(CONNECTION_REDIRECTED, conferenceRequest.vnode, conferenceRequest.focusJid);

                return;
            }

            logger.info('Conference-request successful, ready to join the MUC.');
            callback();
        } else {
            const waitMs = this.getNextTimeout();

            // This was a successful response, but the "ready" flag is not set. Retry after a timeout.
            logger.info(`Not ready yet, will retry in ${waitMs} ms.`);
            window.setTimeout(
                () => this.sendConferenceRequest(roomJid)
                    .then(callback),
                waitMs);
        }
    }

    /**
     * Handles error response for conference IQ.
     * @param roomJid
     * @param sessionError
     * @param notAuthorized
     * @param callback
     * @private
     */
    _handleError(roomJid, sessionError, notAuthorized, callback) {
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
            window.setTimeout(() => this.sendConferenceRequest(roomJid)
                .then(callback), waitMs);
        } else {
            logger.error('Failed to get a successful response, giving up.');

            // This is a "fatal" error and the user of the lib should handle it accordingly.
            // TODO: change the event name to something accurate.
            this.eventEmitter.emit(XMPPEvents.FOCUS_DISCONNECTED);
        }
    }

    /**
     * Invoked by {@link #sendConferenceRequest} upon its request receiving an xmpp error result.
     *
     * @param roomJid - The room jid used to send conference request.
     * @param error - the error result of the request that {@link sendConferenceRequest} sent
     * @param {Function} callback - the function to be called back upon the
     * successful allocation of the conference focus
     */
    _handleIqError(roomJid, error, callback) {
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

        const invalidSession = Boolean($(error).find('>error>session-invalid').length
                || $(error).find('>error>not-acceptable').length);

        // Not authorized to create new room
        const notAuthorized = $(error).find('>error>not-authorized').length > 0;

        this._handleError(roomJid, invalidSession, notAuthorized, callback);
    }

    /**
     * Invoked by {@link #sendConferenecRequest} upon its request receiving a
     * success (i.e. non-error) result.
     *
     * @param roomJid - The room jid used to send conference request.
     * @param result - the success (i.e. non-error) result of the request that {@link #sendConferenecRequest} sent
     * @param {Function} callback - the function to be called back upon the
     * successful allocation of the conference focus
     */
    _handleIqSuccess(roomJid, result, callback) {
        // Setup config options
        const conferenceRequest = this._parseConferenceIq(result);

        this._handleSuccess(roomJid, conferenceRequest, callback);
    }

    /**
     * Authenticate by sending a conference IQ.
     * @param roomJid The room jid.
     * @returns {Promise<unknown>}
     */
    authenticate(roomJid) {
        return new Promise((resolve, reject) => {
            this.connection.sendIQ(
                this._createConferenceIq(roomJid),
                result => {
                    const sessionId = $(result)
                        .find('conference')
                        .attr('session-id');

                    if (sessionId) {
                        logger.info(`Received sessionId:  ${sessionId}`);
                        Settings.sessionId = sessionId;
                    } else {
                        logger.warn('Response did not contain a session-id');
                    }

                    resolve();
                },
                errorIq => reject({
                    error: $(errorIq)
                        .find('iq>error :first')
                        .prop('tagName'),
                    message: $(errorIq)
                        .find('iq>error>text')
                        .text()
                })
            );
        });
    }

    /**
     * Logout by sending conference IQ.
     * @param callback
     */
    logout(callback) {
        const iq = $iq({
            to: this.targetJid,
            type: 'set'
        });
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
                logger.info('Log out OK', result);
                Settings.sessionId = undefined;
                callback();
            },
            error => {
                logger.error('Logout error', error);
            }
        );
    }
}
