/* global $ */

import { getLogger } from 'jitsi-meet-logger';
import { $iq } from 'strophe.js';

const XMPPEvents = require('../../service/xmpp/XMPPEvents');
const JitsiRecorderErrors = require('../../JitsiRecorderErrors');
const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

const logger = getLogger(__filename);

/**
 * Extracts the error details from given error element/node.
 *
 * @param {Element|Object} errorIqNode - Either DOM element or the structure
 * from ChatRoom packet2JSON.
 * @return {{
 *     code: string,
 *     type: string,
 *     message: string
 * }}
 */
function getJibriErrorDetails(errorIqNode) {
    if (typeof errorIqNode.querySelector === 'function') {
        const error = errorIqNode.querySelector('error');
        const errorText = error && error.querySelector('text');

        return error && {
            code: error.attributes.code && error.attributes.code.value,
            type: error.attributes.type && error.attributes.type.value,
            message: errorText && errorText.textContent
        };
    }

    let error = null;

    for (const child of errorIqNode.children) {
        if (child.tagName === 'error') {
            error = child;
            break;
        }
    }

    if (!error) {
        return null;
    }

    let errorText = null;

    for (const errorChild of error.children) {
        if (errorChild.tagName === 'text') {
            errorText = errorChild.value;
            break;
        }
    }

    return {
        code: error.attributes.code,
        type: error.attributes.type,
        message: errorText
    };
}

/* eslint-disable max-params */

/**
 *
 * @param type
 * @param eventEmitter
 * @param connection
 * @param focusMucJid
 * @param jirecon
 * @param roomjid
 */
export default function Recording(
        type,
        eventEmitter,
        connection,
        focusMucJid,
        jirecon,
        roomjid) {
    this.eventEmitter = eventEmitter;
    this.connection = connection;
    this.state = null;
    this.focusMucJid = focusMucJid;
    this.jirecon = jirecon;
    this.url = null;
    this.type = type;
    this._isSupported
        = !(
            (type === Recording.types.JIRECON && !this.jirecon)
                || (type !== Recording.types.JIBRI
                    && type !== Recording.types.JIBRI_FILE
                    && type !== Recording.types.COLIBRI));

    /**
     * The ID of the jirecon recording session. Jirecon generates it when we
     * initially start recording, and it needs to be used in subsequent requests
     * to jirecon.
     */
    this.jireconRid = null;
    this.roomjid = roomjid;
}

/* eslint-enable max-params */

Recording.types = {
    COLIBRI: 'colibri',
    JIRECON: 'jirecon',
    JIBRI: 'jibri',
    JIBRI_FILE: 'jibri_file'
};

Recording.status = {
    ON: 'on',
    OFF: 'off',
    AVAILABLE: 'available',
    UNAVAILABLE: 'unavailable',
    PENDING: 'pending',
    RETRYING: 'retrying',
    ERROR: 'error',
    BUSY: 'busy',
    FAILED: 'failed'
};

Recording.action = {
    START: 'start',
    STOP: 'stop'
};

Recording.prototype.handleJibriPresence = function(jibri) {
    const attributes = jibri.attributes;

    if (!attributes) {
        return;
    }

    const newState = attributes.status;
    const errorDetails = getJibriErrorDetails(jibri);

    logger.log(`Handle Jibri presence : ${newState}`, errorDetails);

    if (newState === this.state) {
        return;
    }

    if (newState === 'undefined') {
        this.state = Recording.status.UNAVAILABLE;
    } else if (newState === Recording.status.OFF) {
        if (!this.state
            || this.state === 'undefined'
            || this.state === Recording.status.UNAVAILABLE) {
            this.state = Recording.status.AVAILABLE;
        } else {
            this.state = Recording.status.OFF;
        }
    } else {
        this.state = newState;
    }

    this.eventEmitter.emit(XMPPEvents.RECORDER_STATE_CHANGED, this.state);
};

/* eslint-disable max-params */

Recording.prototype.setRecordingJibri = function(
        state,
        callback,
        errCallback,
        options = {}) {
    if (state === this.state) {
        errCallback(JitsiRecorderErrors.INVALID_STATE);
    }

    // FIXME jibri does not accept IQ without 'url' attribute set ?
    const iq
        = $iq({
            to: this.focusMucJid,
            type: 'set'
        })
            .c('jibri', {
                'xmlns': 'http://jitsi.org/protocol/jibri',
                'action':
                    state === Recording.status.ON
                        ? Recording.action.START
                        : Recording.action.STOP,
                'recording_mode':
                    this.type === Recording.types.JIBRI_FILE
                        ? 'file'
                        : 'stream',
                'streamid':
                    this.type === Recording.types.JIBRI
                        ? options.streamId
                        : undefined
            })
            .up();

    logger.log(`Set jibri recording: ${state}`, iq.nodeTree);
    logger.log(iq.nodeTree);
    this.connection.sendIQ(
        iq,
        result => {
            logger.log('Result', result);

            const jibri = $(result).find('jibri');

            callback(jibri.attr('state'), jibri.attr('url'));
        },
        error => {
            logger.log(
                'Failed to start recording, error: ',
                getJibriErrorDetails(error));
            errCallback(error);
        });
};

/* eslint-enable max-params */

Recording.prototype.setRecordingJirecon
    = function(state, callback, errCallback) {
        if (state === this.state) {
            errCallback(new Error('Invalid state!'));
        }

        const iq
            = $iq({
                to: this.jirecon,
                type: 'set'
            })
                .c('recording', { xmlns: 'http://jitsi.org/protocol/jirecon',
                    action: state === Recording.status.ON
                        ? Recording.action.START
                        : Recording.action.STOP,
                    mucjid: this.roomjid });

        if (state === Recording.status.OFF) {
            iq.attrs({ rid: this.jireconRid });
        }

        logger.log('Start recording');
        const self = this;

        this.connection.sendIQ(
            iq,
            result => {
                // TODO wait for an IQ with the real status, since this is
                // provisional?
                // eslint-disable-next-line newline-per-chained-call
                self.jireconRid = $(result).find('recording').attr('rid');

                const stateStr
                    = state === Recording.status.ON ? 'started' : 'stopped';

                logger.log(`Recording ${stateStr}(jirecon)${result}`);

                self.state = state;
                if (state === Recording.status.OFF) {
                    self.jireconRid = null;
                }

                callback(state);
            },
            error => {
                logger.log('Failed to start recording, error: ', error);
                errCallback(error);
            });
    };

/* eslint-disable max-params */

// Sends a COLIBRI message which enables or disables (according to 'state')
// the recording on the bridge. Waits for the result IQ and calls 'callback'
// with the new recording state, according to the IQ.
Recording.prototype.setRecordingColibri = function(
        state,
        callback,
        errCallback,
        options) {
    const elem = $iq({
        to: this.focusMucJid,
        type: 'set'
    });

    elem.c('conference', {
        xmlns: 'http://jitsi.org/protocol/colibri'
    });
    elem.c('recording', {
        state,
        token: options.token
    });

    const self = this;

    this.connection.sendIQ(
        elem,
        result => {
            logger.log('Set recording "', state, '". Result:', result);
            const recordingElem = $(result).find('>conference>recording');
            const newState = recordingElem.attr('state');

            self.state = newState;
            callback(newState);

            if (newState === 'pending') {
                self.connection.addHandler(iq => {
                    // eslint-disable-next-line newline-per-chained-call
                    const s = $(iq).find('recording').attr('state');

                    if (s) {
                        self.state = newState;
                        callback(s);
                    }
                }, 'http://jitsi.org/protocol/colibri', 'iq', null, null, null);
            }
        },
        error => {
            logger.warn(error);
            errCallback(error);
        }
    );
};

/* eslint-enable max-params */

Recording.prototype.setRecording = function(...args) {
    switch (this.type) {
    case Recording.types.JIRECON:
        this.setRecordingJirecon(...args);
        break;
    case Recording.types.COLIBRI:
        this.setRecordingColibri(...args);
        break;
    case Recording.types.JIBRI:
    case Recording.types.JIBRI_FILE:
        this.setRecordingJibri(...args);
        break;
    default: {
        const errmsg = 'Unknown recording type!';

        GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
        logger.error(errmsg);
        break;
    }
    }
};

/**
 * Starts/stops the recording.
 * @param {Object} options
 * @param {string} options.token token for authentication
 * @param {string} options.streamId the stream ID to be used with Jibri in
 * the streaming mode.
 * @param statusChangeHandler {function} receives the new status as argument.
 */
Recording.prototype.toggleRecording = function(
        options = { },
        statusChangeHandler) {
    const oldState = this.state;

    // If the recorder is currently unavailable we throw an error.
    if (oldState === Recording.status.UNAVAILABLE
        || oldState === Recording.status.FAILED) {
        statusChangeHandler(
            Recording.status.FAILED,
            JitsiRecorderErrors.RECORDER_UNAVAILABLE);
    } else if (oldState === Recording.status.BUSY) {
        statusChangeHandler(
            Recording.status.BUSY,
            JitsiRecorderErrors.RECORDER_BUSY);
    }

    // If we're about to turn ON the recording we need either a streamId or
    // an authentication token depending on the recording type. If we don't
    // have any of those we throw an error.
    if ((oldState === Recording.status.OFF
                || oldState === Recording.status.AVAILABLE)
            && ((!options.token && this.type === Recording.types.COLIBRI)
                || (!options.streamId
                    && this.type === Recording.types.JIBRI))) {
        statusChangeHandler(
            Recording.status.FAILED,
            JitsiRecorderErrors.NO_TOKEN);
        logger.error('No token passed!');

        return;
    }

    const newState
        = oldState === Recording.status.AVAILABLE
                || oldState === Recording.status.OFF
            ? Recording.status.ON
            : Recording.status.OFF;

    const self = this;

    logger.log('Toggle recording (old state, new state): ', oldState, newState);
    this.setRecording(
        newState,
        (state, url) => {
            // If the state is undefined we're going to wait for presence
            // update.
            if (state && state !== oldState) {
                self.state = state;
                self.url = url;
                statusChangeHandler(state);
            }
        },
        error => statusChangeHandler(Recording.status.FAILED, error),
        options);
};

/**
 * Returns true if the recording is supproted and false if not.
 */
Recording.prototype.isSupported = function() {
    return this._isSupported;
};

/**
 * Returns null if the recording is not supported, "on" if the recording started
 * and "off" if the recording is not started.
 */
Recording.prototype.getState = function() {
    return this.state;
};

/**
 * Returns the url of the recorded video.
 */
Recording.prototype.getURL = function() {
    return this.url;
};
