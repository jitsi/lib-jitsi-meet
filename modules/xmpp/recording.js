/* global $, $iq, config, connection, focusMucJid, messageHandler,
   Toolbar, Util, Promise */
var XMPPEvents = require("../../service/xmpp/XMPPEvents");
var JitsiRecorderErrors = require("../../JitsiRecorderErrors");

var logger = require("jitsi-meet-logger").getLogger(__filename);

function Recording(type, eventEmitter, connection, focusMucJid, jirecon,
    roomjid) {
    this.eventEmitter = eventEmitter;
    this.connection = connection;
    this.state = null;
    this.focusMucJid = focusMucJid;
    this.jirecon = jirecon;
    this.url = null;
    this.type = type;
    this._isSupported
        = ( type === Recording.types.JIRECON && !this.jirecon
            || (type !== Recording.types.JIBRI
                && type !== Recording.types.COLIBRI))
            ? false : true;

    /**
     * The ID of the jirecon recording session. Jirecon generates it when we
     * initially start recording, and it needs to be used in subsequent requests
     * to jirecon.
     */
    this.jireconRid = null;
    this.roomjid = roomjid;
}

Recording.types = {
    COLIBRI: "colibri",
    JIRECON: "jirecon",
    JIBRI: "jibri"
};

Recording.status = {
    ON: "on",
    OFF: "off",
    AVAILABLE: "available",
    UNAVAILABLE: "unavailable",
    PENDING: "pending"
};

Recording.action = {
    START: "start",
    STOP: "stop"
};

Recording.prototype.handleJibriPresence = function (jibri) {
    var attributes = jibri.attributes;
    if(!attributes)
        return;

    var newState = attributes.status;
    logger.log("Handle jibri presence : ", newState);

    if (newState === this.state)
        return;

    if (newState === "undefined") {
        this.state = Recording.status.UNAVAILABLE;
    }
    else if (newState === "off") {
        if (!this.state
            || this.state === "undefined"
            || this.state === Recording.status.UNAVAILABLE)
            this.state = Recording.status.AVAILABLE;
        else
            this.state = Recording.status.OFF;
    }
    else {
        this.state = newState;
    }

    this.eventEmitter.emit(XMPPEvents.RECORDER_STATE_CHANGED, this.state);
};

Recording.prototype.setRecordingJibri = function (state, callback, errCallback,
    options) {
    if (state == this.state){
        errCallback(new Error("Invalid state!"));
    }
    options = options || {};

    // FIXME jibri does not accept IQ without 'url' attribute set ?
    var iq = $iq({to: this.focusMucJid, type: 'set'})
        .c('jibri', {
        "xmlns": 'http://jitsi.org/protocol/jibri',
        "action": (state === Recording.status.ON)
                    ? Recording.action.START
                    : Recording.action.STOP,
        "streamid": options.streamId,
        }).up();

    logger.log('Set jibri recording: ' + state, iq.nodeTree);
    logger.log(iq.nodeTree);
    this.connection.sendIQ(
        iq,
        function (result) {
            logger.log("Result", result);
            callback($(result).find('jibri').attr('state'),
            $(result).find('jibri').attr('url'));
        },
        function (error) {
            logger.log('Failed to start recording, error: ', error);
            errCallback(error);
        });
};

Recording.prototype.setRecordingJirecon =
    function (state, callback, errCallback, options) {

    if (state == this.state){
        errCallback(new Error("Invalid state!"));
    }

    var iq = $iq({to: this.jirecon, type: 'set'})
        .c('recording', {xmlns: 'http://jitsi.org/protocol/jirecon',
            action: (state === Recording.status.ON)
                ? Recording.action.START
                : Recording.action.STOP,
            mucjid: this.roomjid});
    if (state === 'off'){
        iq.attrs({rid: this.jireconRid});
    }

    logger.log('Start recording');
    var self = this;
    this.connection.sendIQ(
        iq,
        function (result) {
            // TODO wait for an IQ with the real status, since this is
            // provisional?
            self.jireconRid = $(result).find('recording').attr('rid');
            logger.log('Recording ' +
                ((state === Recording.status.ON) ? 'started' : 'stopped') +
                '(jirecon)' + result);
            self.state = state;
            if (state === Recording.status.OFF){
                self.jireconRid = null;
            }

            callback(state);
        },
        function (error) {
            logger.log('Failed to start recording, error: ', error);
            errCallback(error);
        });
};

// Sends a COLIBRI message which enables or disables (according to 'state')
// the recording on the bridge. Waits for the result IQ and calls 'callback'
// with the new recording state, according to the IQ.
Recording.prototype.setRecordingColibri =
function (state, callback, errCallback, options) {
    var elem = $iq({to: this.focusMucJid, type: 'set'});
    elem.c('conference', {
        xmlns: 'http://jitsi.org/protocol/colibri'
    });
    elem.c('recording', {state: state, token: options.token});

    var self = this;
    this.connection.sendIQ(elem,
        function (result) {
            logger.log('Set recording "', state, '". Result:', result);
            var recordingElem = $(result).find('>conference>recording');
            var newState = recordingElem.attr('state');

            self.state = newState;
            callback(newState);

            if (newState === 'pending') {
                self.connection.addHandler(function(iq){
                    var state = $(iq).find('recording').attr('state');
                    if (state) {
                        self.state = newState;
                        callback(state);
                    }
                }, 'http://jitsi.org/protocol/colibri', 'iq', null, null, null);
            }
        },
        function (error) {
            logger.warn(error);
            errCallback(error);
        }
    );
};

Recording.prototype.setRecording =
function (state, callback, errCallback, options) {
    switch(this.type){
        case Recording.types.JIRECON:
            this.setRecordingJirecon(state, callback, errCallback, options);
            break;
        case Recording.types.COLIBRI:
            this.setRecordingColibri(state, callback, errCallback, options);
            break;
        case Recording.types.JIBRI:
            this.setRecordingJibri(state, callback, errCallback, options);
            break;
        default:
            logger.error("Unknown recording type!");
            return;
    }
};

/**
 * Starts/stops the recording.
 * @param token token for authentication
 * @param statusChangeHandler {function} receives the new status as argument.
 */
Recording.prototype.toggleRecording = function (options, statusChangeHandler) {
    var oldState = this.state;

    // If the recorder is currently unavailable we throw an error.
    if (oldState === Recording.status.UNAVAILABLE)
        statusChangeHandler("error",
            new Error(JitsiRecorderErrors.RECORDER_UNAVAILABLE));

    // If we're about to turn ON the recording we need either a streamId or
    // an authentication token depending on the recording type. If we don't
    // have any of those we throw an error.
    if ((oldState === Recording.status.OFF
        || oldState === Recording.status.AVAILABLE)
        && ((!options.token && this.type === Recording.types.COLIBRI) ||
        (!options.streamId && this.type === Recording.types.JIBRI))) {
        statusChangeHandler("error",
            new Error(JitsiRecorderErrors.NO_TOKEN));
        logger.error("No token passed!");
        return;
    }

    var newState = (oldState === Recording.status.AVAILABLE
                    || oldState === Recording.status.OFF)
                    ? Recording.status.ON
                    : Recording.status.OFF;

    var self = this;
    logger.log("Toggle recording (old state, new state): ", oldState, newState);
    this.setRecording(newState,
        function (state, url) {
            // If the state is undefined we're going to wait for presence
            // update.
            if (state && state !== oldState) {
                self.state = state;
                self.url = url;
                statusChangeHandler(state);
            }
        }, function (error) {
            statusChangeHandler("error", error);
        }, options);
};

/**
 * Returns true if the recording is supproted and false if not.
 */
Recording.prototype.isSupported = function () {
    return this._isSupported;
};

/**
 * Returns null if the recording is not supported, "on" if the recording started
 * and "off" if the recording is not started.
 */
Recording.prototype.getState = function () {
    return this.state;
};

/**
 * Returns the url of the recorded video.
 */
Recording.prototype.getURL = function () {
    return this.url;
};

module.exports = Recording;
