/* eslint-disable */

import { $build, Strophe } from 'strophe.js';

/**
* StropheJS - Stream Management XEP-0198
*
* This plugin implements stream management ACK capabilities of the specs XEP-0198.
* Note: Resumption is not supported in this current implementation.
*
* Reference: http://xmpp.org/extensions/xep-0198.html
*
* @class streamManagement
*/
Strophe.addConnectionPlugin('streamManagement', {

	/**
	* @property {Boolean} logging: Set to true to enable logging regarding out of sync stanzas.
	*/
	logging: false,

	/**
	* @property {Boolean} autoSendCountOnEveryIncomingStanza: Set to true to send an 'a' response after every stanza.
	* @default false
	* @public
	*/
	autoSendCountOnEveryIncomingStanza: false,

	/**
	* @property {Integer} requestResponseInterval: Set this value to send a request for counter on very interval
	* number of stanzas sent. Set to 0 to disable.
	* @default 5
	* @public
	*/
	requestResponseInterval: 5,

	/**
	* @property {Pointer} _c: Strophe connection instance.
	* @private
	*/
	_c: null,

	/**
	* @property {String} _NS XMPP Namespace.
	* @private
	*/
	_NS: 'urn:xmpp:sm:3',

	/**
	* @property {Boolean} _isStreamManagementEnabled
	* @private
	*/
	_isStreamManagementEnabled: false,

	/**
	* @property {Integer} _serverProcesssedStanzasCounter: Keeps count of stanzas confirmed processed by the server.
	* The server is the source of truth of this value. It is the 'h' attribute on the latest 'a' element received
	* from the server.
	* @private
	*/
	_serverProcesssedStanzasCounter: null,

	/**
	* @property {Integer} _clientProcessedStanzasCounter: Counter of stanzas received by the client from the server.
	* Client is the source of truth of this value. It is the 'h' attribute in the 'a' sent from the client to
	* the server.
	* @private
	*/
	_clientProcessedStanzasCounter: null,

	/**
	* @property {Integer} _clientSentStanzasCounter
	* @private
	*/
	_clientSentStanzasCounter: null,

	/**
	* Stores a reference to Strophe connection xmlOutput function to wrap counting functionality.
	* @method _originalXMLOutput
	* @type {Handler}
	* @private
	*/
	_originalXMLOutput: null,

	/**
	* @property {Handler} _requestHandler: Stores reference to handler that process count request from server.
	* @private
	*/
	_requestHandler: null,

	/**
	* @property {Handler} _incomingHandler: Stores reference to handler that processes incoming stanzas count.
	* @private
	*/
	_incomingHandler: null,

	/**
	* @property {Integer} _requestResponseIntervalCount: Counts sent stanzas since last response request.
	*/
	_requestResponseIntervalCount: 0,

	/**
	 * @property {boolean} _isSupported: indicates whether or not the server has advertised support for the stream
	 * management namespace.
	 */
	_isSupported: false,

	/**
	* @property {Queue} _unacknowledgedStanzas: Maintains a list of packet ids for stanzas which have yet to be acknowledged.
	*/
	_unacknowledgedStanzas: [],

	/**
	* @property {Array} _acknowledgedStanzaListeners: Stores callbacks for each stanza acknowledged by the server.
	* Provides the packet id of the stanza as a parameter.
	* @private
	*/
	_acknowledgedStanzaListeners: [],

	addAcknowledgedStanzaListener: function(listener) {
		this._acknowledgedStanzaListeners.push(listener);
	},

	enable: function(resume) {
		if (!this._isSupported) {
			throw new Error('The server doesn\'t support urn:xmpp:sm:3 namespace');
		} else if (this._connectionStatus !== Strophe.Status.CONNECTED) {
			throw new Error('enable() can only be called in the CONNECTED state');
		}
		this._c.send($build('enable', { xmlns: this._NS, resume }));
		this._c.flush();
		this._c.pause();
	},

	getResumeToken: function() {
		return this._resumeToken;
	},

	isSupported() {
		return this._isSupported;
	},

	resume: function() {
		if (!this.getResumeToken()) {
			throw new Error('No resume token');
		}
		if (this._connectionStatus !== Strophe.Status.DISCONNECTED) {
			throw new Error('resume() can only be called in the DISCONNECTED state');
		}

		this._c.options.explicitResourceBinding = true;
		this._resuming = true;

		this._originalConnect.apply(this._c, this._connectArgs);
	},

	requestAcknowledgement: function() {
		if (this._connectionStatus !== Strophe.Status.CONNECTED) {
			throw new Error('requestAcknowledgement() can only be called in the CONNECTED state');
		}
		this._requestResponseIntervalCount = 0;
		this._c.send($build('r', { xmlns: this._NS }));
	},

	getOutgoingCounter: function() {
		return this._clientSentStanzasCounter;
	},

	getIncomingCounter: function() {
		return this._clientProcessedStanzasCounter;
	},

	init: function(conn) {
		this._c = conn;
		Strophe.addNamespace('SM', this._NS);

		// Storing original xmlOutput function to use additional logic
		this._originalXMLOutput = this._c.xmlOutput;
		this._c.xmlOutput = this.xmlOutput.bind(this);

		this._originalConnect = this._c.connect;
		this._c.connect = this._interceptConnectArgs.bind(this);

		this._originalOnStreamFeaturesAfterSASL = this._c._onStreamFeaturesAfterSASL;
		this._c._onStreamFeaturesAfterSASL = this._onStreamFeaturesAfterSASL.bind(this);

		this._originalDoDisconnect = this._c._doDisconnect;
		this._c._doDisconnect = this._interceptDoDisconnect.bind(this);

		this._originalDisconnect = this._c.disconnect;
		this._c.disconnect = this._interceptDisconnect.bind(this);
	},

	_interceptDisconnect: function() {
		this._resumeToken = undefined;
		this._originalDisconnect.apply(this._c, arguments);
	},

	_interceptDoDisconnect: function() {
		if (this.getResumeToken()
				&& !this._resuming
				&& this._c.connected && !this._c.disconnecting) {
			this._resumeState = {
				handlers: this._c.handlers,
				timedHandlers: this._c.timedHandlers,
				removeTimeds: this._c.removeTimeds,
				removeHandlers: this._c.removeHandlers,
				addTimeds: this._c.addTimeds,
				addHandlers: this._c.addHandlers
			};
			this._storedJid = this._c.jid;

			this.logging && Strophe.debug('SM stored resume state, handler count: ' + this._resumeState.handlers.length);
		}

		// Remove any queued stanzas from the buffer that have failed to send while the socket was closed,
		// as they would interfere with the resume flow. They will be resent anyway.
		this._c._data = [];

		this._originalDoDisconnect.apply(this._c, arguments);
	},

	_interceptConnectArgs: function() {
		this._connectArgs = arguments;

		this._originalConnect.apply(this._c, arguments);
	},

	_onStreamFeaturesAfterSASL: function(elem) {
		this._isSupported = elem.getElementsByTagNameNS(this._NS, "sm").length > 0;

		return this._originalOnStreamFeaturesAfterSASL.apply(this._c, arguments);
	},

	statusChanged: function (status) {
		this._connectionStatus = status;
		if (!this.getResumeToken()
			&& (status === Strophe.Status.CONNECTED || status === Strophe.Status.DISCONNECTED)) {
			this.logging && Strophe.debug('SM reset state');

			this._serverProcesssedStanzasCounter = 0;
			this._clientProcessedStanzasCounter = 0;

			this._clientSentStanzasCounter = 0;

			this._isStreamManagementEnabled = false;
			this._requestResponseIntervalCount = 0;

			// FIXME not described in JSDocs
			this._resuming = false;

			if (status === Strophe.Status.DISCONNECTED) {
				this._isSupported = false;
			}

			this._unacknowledgedStanzas = [];

			if (this._requestHandler) {
				this._c.deleteHandler(this._requestHandler);
			}

			if (this._incomingHandler) {
				this._c.deleteHandler(this._incomingHandler);
			}

			this._requestHandler = this._c.addHandler(this._handleServerRequestHandler.bind(this), this._NS, 'r');
			this._ackHandler = this._c.addHandler(this._handleServerAck.bind(this), this._NS, 'a');
			this._incomingHandler = this._c.addHandler(this._incomingStanzaHandler.bind(this));

			// FIXME handler instances stored, but never used
			this._enabledHandler = this._c._addSysHandler(this._handleEnabled.bind(this), this._NS, 'enabled');
			this._resumeFailedHandler = this._c._addSysHandler(this._handleResumeFailed.bind(this), this._NS, 'failed');
			this._resumedHandler =  this._c._addSysHandler(this._handleResumed.bind(this), this._NS,'resumed');

		} else if (status === Strophe.Status.BINDREQUIRED)  {
			this._c.jid = this._storedJid;

			// Restore Strophe handlers
			for (const h of (this._resumeState.handlers || [])
					.concat(this._resumeState.addHandlers || [])) {
				this._c._addSysHandler(h.handler, h.ns, h.name, h.type, h.id);
			}
			for (const h of (this._resumeState.timedHandlers || [])
					.concat(this._resumeState.addTimeds)) {
				this._c.addTimedHandler(h.period, h.handler);
			}
			for (const h of (this._resumeState.removeTimeds || [])
					.concat(this._resumeState.removeHandlers || [])) {
				this._c.deleteTimedHandler(h);
			}

			// FIXME check conditions if there's session ID and if enabled
			this._c.send($build('resume', {
				xmlns: this._NS,
				h: this._clientProcessedStanzasCounter,
				previd: this._resumeToken
			}));
			this._c.flush();
		} else if (status === Strophe.Status.ERROR) {
			this.logging && Strophe.debug('SM cleared resume token on error');
			this._resumeToken = undefined;
		}
	},

	/**
	* This method overrides the send method implemented by Strophe.Connection
	* to count outgoing stanzas
	*
	* @method Send
	* @public
	*/
	xmlOutput: function(elem) {
		if (Strophe.isTagEqual(elem, 'iq') ||
			Strophe.isTagEqual(elem, 'presence') ||
			Strophe.isTagEqual(elem, 'message')) {
			this._increaseSentStanzasCounter(elem);
		}

		return this._originalXMLOutput.call(this._c, elem);
	},

	_handleEnabled: function(elem) {
		this._isStreamManagementEnabled = true;
		// FIXME fail if requested, but not enabled
		this._resumeToken = elem.getAttribute('resume') === 'true' && elem.getAttribute('id');

		this._c.resume();

		return true;
	},

	_handleResumeFailed: function(elem) {
		const error = elem && (
			(elem.firstElementChild && elem.firstElementChild.tagName)
			|| (elem.firstChild && elem.firstChild.tagName));

		this._c._changeConnectStatus(Strophe.Status.ERROR, error, elem);
		this._c._doDisconnect();

		return true;
	},

	_handleResumed: function(elem) {
		// FIXME check if in the correct state
		var handledCount = parseInt(elem.getAttribute('h'));
		this._handleAcknowledgedStanzas(handledCount, this._serverProcesssedStanzasCounter);

		this._resuming = false;
		this._c.do_bind = false; // No need to bind our resource anymore
		this._c.authenticated = true;
		this._c.restored = true;

		if (this._unacknowledgedStanzas.length > 0) {
			this.logging && Strophe.debug('SM Sending unacknowledged stanzas', this._unacknowledgedStanzas);
			for(const stanza of this._unacknowledgedStanzas) {
				this._c.send(stanza);
			}
		} else {
			this.logging && Strophe.debug('SM No unacknowledged stanzas', this._unacknowledgedStanzas);
		}

		this._c._changeConnectStatus(Strophe.Status.CONNECTED, null);

		return true;
	},

	_incomingStanzaHandler: function(elem) {
		if (Strophe.isTagEqual(elem, 'iq') || Strophe.isTagEqual(elem, 'presence') || Strophe.isTagEqual(elem, 'message'))  {
			this._increaseReceivedStanzasCounter();

			if (this.autoSendCountOnEveryIncomingStanza) {
				this._answerProcessedStanzas();
			}
		}

		return true;
	},

	_handleAcknowledgedStanzas: function(reportedHandledCount, lastKnownHandledCount) {
		var delta = reportedHandledCount - lastKnownHandledCount;

		if (delta < 0) {
			this._throwError('New reported stanza count lower than previous. New: ' + reportedHandledCount + ' - Previous: ' + lastKnownHandledCount);
		}

		if (delta > this._unacknowledgedStanzas.length) {
			this._throwError('Higher reported acknowledge count than unacknowledged stanzas. Reported Acknowledge Count: ' + delta + ' - Unacknowledge Stanza Count: ' + this._unacknowledgedStanzas.length + ' - New: ' + reportedHandledCount + ' - Previous: ' + lastKnownHandledCount);
		}

		for(var i = 0; i < delta; i++) {
			var stanza = this._unacknowledgedStanzas.shift();
			for (var j = 0; j < this._acknowledgedStanzaListeners.length; j++) {
				this._acknowledgedStanzaListeners[j](stanza);
			}
		}

		if (this.logging && this._unacknowledgedStanzas.length > 0) {
			Strophe.warn('SM Unacknowledged stanzas', this._unacknowledgedStanzas);
		}

		this._serverProcesssedStanzasCounter = reportedHandledCount;

		if (this.requestResponseInterval > 0) {
			this._requestResponseIntervalCount = 0;
		}
	},

	_handleServerRequestHandler: function() {
		this._answerProcessedStanzas();

		return true;
	},

	_handleServerAck: function(elem){
		var handledCount = parseInt(elem.getAttribute('h'));
		this._handleAcknowledgedStanzas(handledCount, this._serverProcesssedStanzasCounter);

		return true;
	},

	_answerProcessedStanzas: function() {
		if (this._isStreamManagementEnabled) {
			this._c.send($build('a', { xmlns: this._NS, h: this._clientProcessedStanzasCounter }));
		}
	},

	_increaseSentStanzasCounter: function(elem) {
		if (this._isStreamManagementEnabled) {
			if (this._unacknowledgedStanzas.indexOf(elem) !== -1) {

				return;
			}

			this._unacknowledgedStanzas.push(elem);
			this._clientSentStanzasCounter++;

			if (this.requestResponseInterval > 0) {
				this._requestResponseIntervalCount++;

				if (this._requestResponseIntervalCount === this.requestResponseInterval) {
					// FIXME Can not call send from onIdle.
					setTimeout(() => {
						if (this._connectionStatus === Strophe.Status.CONNECTED) {
							this.requestAcknowledgement();
						}
					}, 1);
				}
			}
		}
	},

	_increaseReceivedStanzasCounter: function() {
		if (this._isStreamManagementEnabled) {
			this._clientProcessedStanzasCounter++;
		}
	},

	_throwError: function(msg) {
		Strophe.error(msg);
		throw new Error(msg);
	}

});
