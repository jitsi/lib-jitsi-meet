/* global $, $iq */

import {getLogger} from "jitsi-meet-logger";
const logger = getLogger(__filename);
var JingleSession = require("./JingleSession");
var TraceablePeerConnection = require("./TraceablePeerConnection");
var SDPDiffer = require("./SDPDiffer");
var SDPUtil = require("./SDPUtil");
var SDP = require("./SDP");
var async = require("async");
var XMPPEvents = require("../../service/xmpp/XMPPEvents");
var RTCBrowserType = require("../RTC/RTCBrowserType");
import RTC from "../RTC/RTC";
var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");
var Statistics = require("../statistics/statistics");

import * as JingleSessionState from "./JingleSessionState";

/**
 * Constant tells how long we're going to wait for IQ response, before timeout
 * error is  triggered.
 * @type {number}
 */
var IQ_TIMEOUT = 10000;

// Jingle stuff
function JingleSessionPC(me, sid, peerjid, connection,
                         media_constraints, ice_config, service, eventEmitter) {
    JingleSession.call(this, me, sid, peerjid, connection,
                       media_constraints, ice_config, service, eventEmitter);
    this.localSDP = null;

    this.lasticecandidate = false;
    this.closed = false;

    this.addssrc = [];
    this.removessrc = [];
    this.modifyingLocalStreams = false;
    this.modifiedSSRCs = {};

    /**
     * The local ICE username fragment for this session.
     */
    this.localUfrag = null;

    /**
     * The remote ICE username fragment for this session.
     */
    this.remoteUfrag = null;

    /**
     * A map that stores SSRCs of remote streams. And is used only locally
     * We store the mapping when jingle is received, and later is used
     * onaddstream webrtc event where we have only the ssrc
     * FIXME: This map got filled and never cleaned and can grow durring long
     * conference
     * @type {{}} maps SSRC number to jid
     */
    this.ssrcOwners = {};

    this.jingleOfferIq = null;
    this.webrtcIceUdpDisable = !!this.service.options.webrtcIceUdpDisable;
    this.webrtcIceTcpDisable = !!this.service.options.webrtcIceTcpDisable;
    /**
     * Flag used to enforce ICE failure through the URL parameter for
     * the automatic testing purpose.
     * @type {boolean}
     */
    this.failICE = !!this.service.options.failICE;

    this.modifySourcesQueue = async.queue(this._modifySources.bind(this), 1);
}

JingleSessionPC.prototype = Object.create(JingleSession.prototype);
JingleSessionPC.prototype.constructor = JingleSessionPC;


JingleSessionPC.prototype.doInitialize = function () {
    var self = this;
    this.lasticecandidate = false;
    // True if reconnect is in progress
    this.isreconnect = false;
    // Set to true if the connection was ever stable
    this.wasstable = false;

    this.peerconnection = new TraceablePeerConnection(
            this.connection.jingle.ice_config,
            RTC.getPCConstraints(),
            this);

    this.peerconnection.onicecandidate = function (ev) {
        if (!ev) {
            // There was an incomplete check for ev before which left the last
            // line of the function unprotected from a potential throw of an
            // exception. Consequently, it may be argued that the check is
            // unnecessary. Anyway, I'm leaving it and making the check
            // complete.
            return;
        }
        // XXX this is broken, candidate is not parsed.
        var candidate = ev.candidate;
        if (candidate) {
            // Discard candidates of disabled protocols.
            var protocol = candidate.protocol;
            if (typeof protocol === 'string') {
                protocol = protocol.toLowerCase();
                if (protocol === 'tcp' || protocol ==='ssltcp') {
                    if (self.webrtcIceTcpDisable)
                        return;
                } else if (protocol == 'udp') {
                    if (self.webrtcIceUdpDisable)
                        return;
                }
            }
        }
        self.sendIceCandidate(candidate);
    };
    this.peerconnection.onaddstream = function (event) {
        self.remoteStreamAdded(event.stream);
    };
    this.peerconnection.onremovestream = function (event) {
        self.remoteStreamRemoved(event.stream);
    };
    // Note there is a change in the spec about closed:
    // This value moved into the RTCPeerConnectionState enum in the May 13, 2016
    // draft of the specification, as it reflects the state of the
    // RTCPeerConnection, not the signaling connection. You now detect a
    // closed connection by checking for connectionState to be "closed" instead.
    // I suppose at some point this will be moved to onconnectionstatechange
    this.peerconnection.onsignalingstatechange = function () {
        if (!(self && self.peerconnection)) return;
        if (self.peerconnection.signalingState === 'stable') {
            self.wasstable = true;
        } else if (
            (self.peerconnection.signalingState === 'closed'
                || self.peerconnection.connectionState === 'closed')
            && !self.closed) {
                self.room.eventEmitter.emit(XMPPEvents.SUSPEND_DETECTED);
        }
    };
    /**
     * The oniceconnectionstatechange event handler contains the code to execute
     * when the iceconnectionstatechange event, of type Event, is received by
     * this RTCPeerConnection. Such an event is sent when the value of
     * RTCPeerConnection.iceConnectionState changes.
     */
    this.peerconnection.oniceconnectionstatechange = function () {
        if (!(self && self.peerconnection)) return;
        var now = window.performance.now();
        self.room.connectionTimes["ice.state." +
            self.peerconnection.iceConnectionState] = now;
        logger.log("(TIME) ICE " + self.peerconnection.iceConnectionState +
                    ":\t", now);
        Statistics.analytics.sendEvent(
            'ice.' + self.peerconnection.iceConnectionState, {value: now});
        self.room.eventEmitter.emit(
            XMPPEvents.ICE_CONNECTION_STATE_CHANGED,
            self.peerconnection.iceConnectionState);
        switch (self.peerconnection.iceConnectionState) {
            case 'connected':

                // Informs interested parties that the connection has been restored.
                if (self.peerconnection.signalingState === 'stable' && self.isreconnect)
                    self.room.eventEmitter.emit(XMPPEvents.CONNECTION_RESTORED);
                self.isreconnect = false;

                break;
            case 'disconnected':
                if(self.closed)
                    break;
                self.isreconnect = true;
                // Informs interested parties that the connection has been interrupted.
                if (self.wasstable)
                    self.room.eventEmitter.emit(XMPPEvents.CONNECTION_INTERRUPTED);
                break;
            case 'failed':
                self.room.eventEmitter.emit(XMPPEvents.CONNECTION_ICE_FAILED,
                    self.peerconnection);
                break;
        }
    };
    this.peerconnection.onnegotiationneeded = function () {
        self.room.eventEmitter.emit(XMPPEvents.PEERCONNECTION_READY, self);
    };
};

JingleSessionPC.prototype.sendIceCandidate = function (candidate) {
    var self = this;
    if (candidate && !this.lasticecandidate) {
        var ice = SDPUtil.iceparams(this.localSDP.media[candidate.sdpMLineIndex], this.localSDP.session);
        var jcand = SDPUtil.candidateToJingle(candidate.candidate);
        if (!(ice && jcand)) {
            var errorMesssage = "failed to get ice && jcand";
            GlobalOnErrorHandler.callErrorHandler(new Error(errorMesssage));
            logger.error(errorMesssage);
            return;
        }
        ice.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';

        if (this.usedrip) {
            if (this.drip_container.length === 0) {
                // start 20ms callout
                window.setTimeout(function () {
                    if (self.drip_container.length === 0) return;
                    self.sendIceCandidates(self.drip_container);
                    self.drip_container = [];
                }, 20);
            }
            this.drip_container.push(candidate);
        } else {
            self.sendIceCandidates([candidate]);
        }
    } else {
        logger.log('sendIceCandidate: last candidate.');
        // FIXME: remember to re-think in ICE-restart
        this.lasticecandidate = true;
    }
};

JingleSessionPC.prototype.sendIceCandidates = function (candidates) {
    logger.log('sendIceCandidates', candidates);
    var cand = $iq({to: this.peerjid, type: 'set'})
        .c('jingle', {xmlns: 'urn:xmpp:jingle:1',
            action: 'transport-info',
            initiator: this.initiator,
            sid: this.sid});
    for (var mid = 0; mid < this.localSDP.media.length; mid++) {
        var cands = candidates.filter(function (el) { return el.sdpMLineIndex == mid; });
        var mline = SDPUtil.parse_mline(this.localSDP.media[mid].split('\r\n')[0]);
        if (cands.length > 0) {
            var ice = SDPUtil.iceparams(this.localSDP.media[mid], this.localSDP.session);
            ice.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';
            cand.c('content', {creator: this.initiator == this.me ? 'initiator' : 'responder',
                name: (cands[0].sdpMid? cands[0].sdpMid : mline.media)
            }).c('transport', ice);
            for (var i = 0; i < cands.length; i++) {
                var candidate = SDPUtil.candidateToJingle(cands[i].candidate);
                // Mangle ICE candidate if 'failICE' test option is enabled
                if (this.service.options.failICE) {
                    candidate.ip = "1.1.1.1";
                }
                cand.c('candidate', candidate).up();
            }
            // add fingerprint
            var fingerprint_line = SDPUtil.find_line(this.localSDP.media[mid], 'a=fingerprint:', this.localSDP.session);
            if (fingerprint_line) {
                var tmp = SDPUtil.parse_fingerprint(fingerprint_line);
                tmp.required = true;
                cand.c(
                    'fingerprint',
                    {xmlns: 'urn:xmpp:jingle:apps:dtls:0'})
                    .t(tmp.fingerprint);
                delete tmp.fingerprint;
                cand.attrs(tmp);
                cand.up();
            }
            cand.up(); // transport
            cand.up(); // content
        }
    }
    // might merge last-candidate notification into this, but it is called alot later. See webrtc issue #2340
    //logger.log('was this the last candidate', this.lasticecandidate);
    this.connection.sendIQ(
        cand, null, this.newJingleErrorHandler(cand, function (error) {
            GlobalOnErrorHandler.callErrorHandler(
                new Error("Jingle error: " + JSON.stringify(error)));
        }), IQ_TIMEOUT);
};

JingleSessionPC.prototype.readSsrcInfo = function (contents) {
    var self = this;
    $(contents).each(function (idx, content) {
        var ssrcs = $(content).find('description>source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');
        ssrcs.each(function () {
            var ssrc = this.getAttribute('ssrc');
            $(this).find('>ssrc-info[xmlns="http://jitsi.org/jitmeet"]').each(
                function () {
                    var owner = this.getAttribute('owner');
                    self.ssrcOwners[ssrc] = owner;
                }
            );
        });
    });
};

/**
 * Does accept incoming Jingle 'session-initiate' and should send
 * 'session-accept' in result.
 * @param jingleOffer jQuery selector pointing to the jingle element of
 *        the offer IQ
 * @param success callback called when we accept incoming session successfully
 *        and receive RESULT packet to 'session-accept' sent.
 * @param failure function(error) called if for any reason we fail to accept
 *        the incoming offer. 'error' argument can be used to log some details
 *        about the error.
 */
JingleSessionPC.prototype.acceptOffer = function(jingleOffer,
                                                 success, failure) {
    this.state = JingleSessionState.ACTIVE;
    this.setOfferCycle(jingleOffer,
        function() {
            // setOfferCycle succeeded, now we have self.localSDP up to date
            // Let's send an answer !
            // FIXME we may not care about RESULT packet for session-accept
            // then we should either call 'success' here immediately or
            // modify sendSessionAccept method to do that
            this.sendSessionAccept(this.localSDP, success, failure);
        }.bind(this),
        failure);
};

/**
 * This is a setRemoteDescription/setLocalDescription cycle which starts at
 * converting Strophe Jingle IQ into remote offer SDP. Once converted
 * setRemoteDescription, createAnswer and setLocalDescription calls follow.
 * @param jingleOfferIq jQuery selector pointing to the jingle element of
 *        the offer IQ
 * @param success callback called when sRD/sLD cycle finishes successfully.
 * @param failure callback called with an error object as an argument if we fail
 *        at any point during setRD, createAnswer, setLD.
 */
JingleSessionPC.prototype.setOfferCycle = function (jingleOfferIq,
                                                          success,
                                                          failure) {
    this.jingleOfferIq = jingleOfferIq;
    this.modifySourcesQueue.push(success, function (error) {
        if(!error)
            return;
        if (failure)
            failure(error);
        JingleSessionPC.onJingleFatalError(this, error);
    }.bind(this));
};

/**
 * Modifies the values of the setup attributes (defined by
 * {@link http://tools.ietf.org/html/rfc4145#section-4}) of a specific SDP
 * answer in order to overcome a delay of 1 second in the connection
 * establishment between Chrome and Videobridge.
 *
 * @param {SDP} offer - the SDP offer to which the specified SDP answer is
 * being prepared to respond
 * @param {SDP} answer - the SDP to modify
 * @private
 */
JingleSessionPC._fixAnswerRFC4145Setup = function (offer, answer) {
    if (!RTCBrowserType.isChrome()) {
        // It looks like Firefox doesn't agree with the fix (at least in its
        // current implementation) because it effectively remains active even
        // after we tell it to become passive. Apart from Firefox which I tested
        // after the fix was deployed, I tested Chrome only. In order to prevent
        // issues with other browsers, limit the fix to Chrome for the time
        // being.
        return;
    }

    // XXX Videobridge is the (SDP) offerer and WebRTC (e.g. Chrome) is the
    // answerer (as orchestrated by Jicofo). In accord with
    // http://tools.ietf.org/html/rfc5245#section-5.2 and because both peers
    // are ICE FULL agents, Videobridge will take on the controlling role and
    // WebRTC will take on the controlled role. In accord with
    // https://tools.ietf.org/html/rfc5763#section-5, Videobridge will use the
    // setup attribute value of setup:actpass and WebRTC will be allowed to
    // choose either the setup attribute value of setup:active or
    // setup:passive. Chrome will by default choose setup:active because it is
    // RECOMMENDED by the respective RFC since setup:passive adds additional
    // latency. The case of setup:active allows WebRTC to send a DTLS
    // ClientHello as soon as an ICE connectivity check of its succeeds.
    // Unfortunately, Videobridge will be unable to respond immediately because
    // may not have WebRTC's answer or may have not completed the ICE
    // connectivity establishment. Even more unfortunate is that in the
    // described scenario Chrome's DTLS implementation will insist on
    // retransmitting its ClientHello after a second (the time is in accord
    // with the respective RFC) and will thus cause the whole connection
    // establishment to exceed at least 1 second. To work around Chrome's
    // idiosyncracy, don't allow it to send a ClientHello i.e. change its
    // default choice of setup:active to setup:passive.
    if (offer && answer
            && offer.media && answer.media
            && offer.media.length == answer.media.length) {
        answer.media.forEach(function (a, i) {
            if (SDPUtil.find_line(
                    offer.media[i],
                    'a=setup:actpass',
                    offer.session)) {
                answer.media[i]
                    = a.replace(/a=setup:active/g, 'a=setup:passive');
            }
        });
        answer.raw = answer.session + answer.media.join('');
    }
};

/**
 * Although it states "replace transport" it does accept full Jingle offer
 * which should contain new ICE transport details.
 * @param jingleOfferElem an element Jingle IQ that contains new offer and
 *        transport info.
 * @param success callback called when we succeed to accept new offer.
 * @param failure function(error) called when we fail to accept new offer.
 */
JingleSessionPC.prototype.replaceTransport = function (jingleOfferElem,
                                                       success,
                                                       failure) {

    // We need to first set an offer without the 'data' section to have the SCTP
    // stack cleaned up. After that the original offer is set to have the SCTP
    // connection established with the new bridge.
    this.room.eventEmitter.emit(XMPPEvents.ICE_RESTARTING);
    var originalOffer = jingleOfferElem.clone();
    jingleOfferElem.find(">content[name='data']").remove();

    var self = this;
    // First set an offer without the 'data' section
    this.setOfferCycle(
        jingleOfferElem,
        function() {
            // Now set the original offer(with the 'data' section)
            self.setOfferCycle(originalOffer,
                function () {
                    // Set local description OK, now localSDP up to date
                    self.sendTransportAccept(self.localSDP, success, failure);
                },
                failure);
        },
        failure
    );
};

/**
 * Sends Jingle 'session-accept' message.
 * @param localSDP the 'SDP' object with local session description
 * @param success callback called when we recive 'RESULT' packet for
 *        'session-accept'
 * @param failure function(error) called when we receive an error response or
 *        when the request has timed out.
 */
JingleSessionPC.prototype.sendSessionAccept = function (localSDP,
                                                        success, failure) {
    var accept = $iq({to: this.peerjid,
        type: 'set'})
        .c('jingle', {xmlns: 'urn:xmpp:jingle:1',
            action: 'session-accept',
            initiator: this.initiator,
            responder: this.responder,
            sid: this.sid });
    if (this.webrtcIceTcpDisable) {
        localSDP.removeTcpCandidates = true;
    }
    if (this.webrtcIceUdpDisable) {
        localSDP.removeUdpCandidates = true;
    }
    if (this.failICE) {
        localSDP.failICE = true;
    }
    localSDP.toJingle(
        accept,
        this.initiator == this.me ? 'initiator' : 'responder',
        null);
    this.fixJingle(accept);

    // Calling tree() to print something useful
    accept = accept.tree();
    logger.info("Sending session-accept", accept);
    var self = this;
    this.connection.sendIQ(accept,
        success,
        this.newJingleErrorHandler(accept, function (error) {
            failure(error);
            // 'session-accept' is a critical timeout and we'll have to restart
            self.room.eventEmitter.emit(XMPPEvents.SESSION_ACCEPT_TIMEOUT);
        }),
        IQ_TIMEOUT);
    // XXX Videobridge needs WebRTC's answer (ICE ufrag and pwd, DTLS
    // fingerprint and setup) ASAP in order to start the connection
    // establishment.
    //
    // FIXME Flushing the connection at this point triggers an issue with BOSH
    // request handling in Prosody on slow connections.
    //
    // The problem is that this request will be quite large and it may take time
    // before it reaches Prosody. In the meantime Strophe may decide to send
    // the next one. And it was observed that a small request with
    // 'transport-info' usually follows this one. It does reach Prosody before
    // the previous one was completely received. 'rid' on the server is
    // increased and Prosody ignores the request with 'session-accept'. It will
    // never reach Jicofo and everything in the request table is lost. Removing
    // the flush does not guarantee it will never happen, but makes it much less
    // likely('transport-info' is bundled with 'session-accept' and any
    // immediate requests).
    //
    // this.connection.flush();
};

/**
 * Sends Jingle 'transport-accept' message which is a response to
 * 'transport-replace'.
 * @param localSDP the 'SDP' object with local session description
 * @param success callback called when we receive 'RESULT' packet for
 *        'transport-replace'
 * @param failure function(error) called when we receive an error response or
 *        when the request has timed out.
 */
JingleSessionPC.prototype.sendTransportAccept = function(localSDP, success,
                                                         failure) {
    var self = this;
    var tAccept = $iq({to: this.peerjid, type: 'set'})
        .c('jingle', {xmlns: 'urn:xmpp:jingle:1',
            action: 'transport-accept',
            initiator: this.initiator,
            sid: this.sid});

    localSDP.media.forEach(function(medialines, idx){
        var mline = SDPUtil.parse_mline(medialines.split('\r\n')[0]);
        tAccept.c('content',
            { creator: self.initiator == self.me ? 'initiator' : 'responder',
              name: mline.media
            }
        );
        localSDP.transportToJingle(idx, tAccept);
        tAccept.up();
    });

    // Calling tree() to print something useful to the logger
    tAccept = tAccept.tree();
    console.info("Sending transport-accept: ", tAccept);

    self.connection.sendIQ(tAccept,
        success,
        self.newJingleErrorHandler(tAccept, failure),
        IQ_TIMEOUT);
};

/**
 * Sends Jingle 'transport-reject' message which is a response to
 * 'transport-replace'.
 * @param success callback called when we receive 'RESULT' packet for
 *        'transport-replace'
 * @param failure function(error) called when we receive an error response or
 *        when the request has timed out.
 */
JingleSessionPC.prototype.sendTransportReject = function(success, failure) {
    // Send 'transport-reject', so that the focus will
    // know that we've failed
    var tReject = $iq({to: this.peerjid, type: 'set'})
        .c('jingle', {xmlns: 'urn:xmpp:jingle:1',
            action: 'transport-reject',
            initiator: this.initiator,
            sid: this.sid});

    tReject = tReject.tree();
    logger.info("Sending 'transport-reject", tReject);

    this.connection.sendIQ(tReject,
        success,
        this.newJingleErrorHandler(tReject, failure),
        IQ_TIMEOUT);
};

/**
 * @inheritDoc
 */
JingleSessionPC.prototype.terminate = function (reason,  text,
                                                success, failure) {
    this.state = JingleSessionState.ENDED;

    var term = $iq({to: this.peerjid,
        type: 'set'})
        .c('jingle', {xmlns: 'urn:xmpp:jingle:1',
            action: 'session-terminate',
            initiator: this.initiator,
            sid: this.sid})
        .c('reason')
        .c(reason || 'success');

    if (text) {
        term.up().c('text').t(text);
    }

    // Calling tree() to print something useful
    term = term.tree();
    logger.info("Sending session-terminate", term);

    this.connection.sendIQ(
        term, success, this.newJingleErrorHandler(term, failure), IQ_TIMEOUT);

    // this should result in 'onTerminated' being called by strope.jingle.js
    this.connection.jingle.terminate(this.sid);
};

JingleSessionPC.prototype.onTerminated = function (reasonCondition,
                                                   reasonText) {
    this.state = 'ended';

    // Do something with reason and reasonCondition when we start to care
    //this.reasonCondition = reasonCondition;
    //this.reasonText = reasonText;
    logger.info("Session terminated", this, reasonCondition, reasonText);

    this.close();
};

/**
 * Handles a Jingle source-add message for this Jingle session.
 * @param elem An array of Jingle "content" elements.
 */
JingleSessionPC.prototype.addSource = function (elem) {
    var self = this;
    // FIXME: dirty waiting
    if (!this.peerconnection.localDescription)
    {
        logger.warn("addSource - localDescription not ready yet");
        setTimeout(function()
            {
                self.addSource(elem);
            },
            200
        );
        return;
    }

    logger.log('addssrc', new Date().getTime());
    logger.log('ice', this.peerconnection.iceConnectionState);

    this.readSsrcInfo(elem);

    var sdp = new SDP(this.peerconnection.remoteDescription.sdp);
    var mySdp = new SDP(this.peerconnection.localDescription.sdp);

    $(elem).each(function (idx, content) {
        var name = $(content).attr('name');
        var lines = '';
        $(content).find('ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]').each(function() {
            var semantics = this.getAttribute('semantics');
            var ssrcs = $(this).find('>source').map(function () {
                return this.getAttribute('ssrc');
            }).get();

            if (ssrcs.length) {
                lines += 'a=ssrc-group:' + semantics + ' ' + ssrcs.join(' ') + '\r\n';
            }
        });
        var tmp = $(content).find('source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]'); // can handle both >source and >description>source
        tmp.each(function () {
            var ssrc = $(this).attr('ssrc');
            if(mySdp.containsSSRC(ssrc)){
                /**
                 * This happens when multiple participants change their streams at the same time and
                 * ColibriFocus.modifySources have to wait for stable state. In the meantime multiple
                 * addssrc are scheduled for update IQ. See
                 */
                logger.warn("Got add stream request for my own ssrc: "+ssrc);
                return;
            }
            if (sdp.containsSSRC(ssrc)) {
                logger.warn("Source-add request for existing SSRC: " + ssrc);
                return;
            }
            $(this).find('>parameter').each(function () {
                lines += 'a=ssrc:' + ssrc + ' ' + $(this).attr('name');
                if ($(this).attr('value') && $(this).attr('value').length)
                    lines += ':' + $(this).attr('value');
                lines += '\r\n';
            });
        });
        sdp.media.forEach(function(media, idx) {
            if (!SDPUtil.find_line(media, 'a=mid:' + name))
                return;
            sdp.media[idx] += lines;
            if (!self.addssrc[idx]) self.addssrc[idx] = '';
            self.addssrc[idx] += lines;
        });
        sdp.raw = sdp.session + sdp.media.join('');
    });

    this.modifySourcesQueue.push(function() {
        // When a source is added and if this is FF, a new channel is allocated
        // for receiving the added source. We need to diffuse the SSRC of this
        // new recvonly channel to the rest of the peers.
        logger.log('modify sources done');

        var newSdp = new SDP(self.peerconnection.localDescription.sdp);
        logger.log("SDPs", mySdp, newSdp);
        self.notifyMySSRCUpdate(mySdp, newSdp);
    });
};

/**
 * Handles a Jingle source-remove message for this Jingle session.
 * @param elem An array of Jingle "content" elements.
 */
JingleSessionPC.prototype.removeSource = function (elem) {
    var self = this;
    // FIXME: dirty waiting
    if (!this.peerconnection.localDescription) {
        logger.warn("removeSource - localDescription not ready yet");
        setTimeout(function() {
                self.removeSource(elem);
            },
            200
        );
        return;
    }

    logger.log('removessrc', new Date().getTime());
    logger.log('ice', this.peerconnection.iceConnectionState);
    var sdp = new SDP(this.peerconnection.remoteDescription.sdp);
    var mySdp = new SDP(this.peerconnection.localDescription.sdp);

    $(elem).each(function (idx, content) {
        var name = $(content).attr('name');
        var lines = '';
        $(content).find('ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]').each(function() {
            var semantics = this.getAttribute('semantics');
            var ssrcs = $(this).find('>source').map(function () {
                return this.getAttribute('ssrc');
            }).get();

            if (ssrcs.length) {
                lines += 'a=ssrc-group:' + semantics + ' ' + ssrcs.join(' ') + '\r\n';
            }
        });
        var ssrcs = [];
        var tmp = $(content).find('source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]'); // can handle both >source and >description>source
        tmp.each(function () {
            var ssrc = $(this).attr('ssrc');
            // This should never happen, but can be useful for bug detection
            if(mySdp.containsSSRC(ssrc)){
                var errmsg
                    = "Got remove stream request for my own ssrc: " + ssrc;
                GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
                logger.error(errmsg);
                return;
            }
            ssrcs.push(ssrc);
        });
        sdp.media.forEach(function(media, idx) {
            if (!SDPUtil.find_line(media, 'a=mid:' + name))
                return;
            if (!self.removessrc[idx]) self.removessrc[idx] = '';
            ssrcs.forEach(function(ssrc) {
                var ssrcLines = SDPUtil.find_lines(media, 'a=ssrc:' + ssrc);
                if (ssrcLines.length)
                    self.removessrc[idx] += ssrcLines.join("\r\n")+"\r\n";
                // Clear any pending 'source-add' for this SSRC
                if (self.addssrc[idx]) {
                    self.addssrc[idx]
                        = self.addssrc[idx].replace(
                            new RegExp('^a=ssrc:'+ssrc+' .*\r\n', 'gm'), '');
                }
            });
            self.removessrc[idx] += lines;
        });
        sdp.raw = sdp.session + sdp.media.join('');
    });

    this.modifySourcesQueue.push(function() {
        // When a source is removed and if this is FF, the recvonly channel that
        // receives the remote stream is deactivated . We need to diffuse the
        // recvonly SSRC removal to the rest of the peers.
        logger.log('modify sources done');

        var newSdp = new SDP(self.peerconnection.localDescription.sdp);
        logger.log("SDPs", mySdp, newSdp);
        self.notifyMySSRCUpdate(mySdp, newSdp);
    });
};

JingleSessionPC.prototype._modifySources = function (successCallback, queueCallback) {
    var self = this, sdp = null, media_constraints;

    if (this.peerconnection.signalingState == 'closed') return;
    if (!(this.addssrc.length || this.removessrc.length
        || this.modifyingLocalStreams || this.jingleOfferIq !== null)){
        // There is nothing to do since scheduled job might have been
        // executed by another succeeding call
        if(successCallback){
            successCallback();
        }
        queueCallback();
        return;
    }

    if(this.jingleOfferIq) {
        sdp = new SDP('');
        if (this.webrtcIceTcpDisable) {
            sdp.removeTcpCandidates = true;
        }
        if (this.webrtcIceUdpDisable) {
            sdp.removeUdpCandidates = true;
        }
        if (this.failICE) {
            sdp.failICE = true;
        }

        sdp.fromJingle(this.jingleOfferIq);
        this.readSsrcInfo($(this.jingleOfferIq).find(">content"));
        this.jingleOfferIq = null;
        media_constraints = this.media_constraints;
    } else {
        // Reset switch streams flags
        this.modifyingLocalStreams = false;

        sdp = new SDP(this.peerconnection.remoteDescription.sdp);
    }

    // add sources
    this.addssrc.forEach(function(lines, idx) {
        sdp.media[idx] += lines;
    });
    this.addssrc = [];

    // remove sources
    this.removessrc.forEach(function(lines, idx) {
        lines = lines.split('\r\n');
        lines.pop(); // remove empty last element;
        lines.forEach(function(line) {
            sdp.media[idx] = sdp.media[idx].replace(line + '\r\n', '');
        });
    });
    this.removessrc = [];

    sdp.raw = sdp.session + sdp.media.join('');

    /**
     * Implements a failure callback which reports an error message and an
     * optional error through (1) logger, (2) GlobalOnErrorHandler, and (3)
     * queueCallback.
     *
     * @param {string} errmsg the error message to report
     * @param {*} error an optional error to report in addition to errmsg
     */
    function reportError(errmsg, err) {
        if (err) {
           errmsg = errmsg + ': ' + err; // for logger and GlobalOnErrorHandler
           logger.error(errmsg, err);
        } else {
           logger.error(errmsg);
           err = new Error(errmsg); // for queueCallback
        }
        GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
        queueCallback(err);
    }

    var ufrag = getUfrag(sdp.raw);
    if (ufrag != self.remoteUfrag) {
        self.remoteUfrag = ufrag;
        self.room.eventEmitter.emit(
                XMPPEvents.REMOTE_UFRAG_CHANGED, ufrag);
    }

    this.peerconnection.setRemoteDescription(
        new RTCSessionDescription({type: 'offer', sdp: sdp.raw}),
        function() {
            if(self.signalingState == 'closed') {
                reportError("createAnswer attempt on closed state");
                return;
            }

            self.peerconnection.createAnswer(
                function(answer) {
                    // FIXME: pushing down an answer while ice connection state
                    // is still checking is bad...
                    //logger.log(self.peerconnection.iceConnectionState);

                    var modifiedAnswer = new SDP(answer.sdp);
                    JingleSessionPC._fixAnswerRFC4145Setup(
                        /* offer */ sdp,
                        /* answer */ modifiedAnswer);
                    answer.sdp = modifiedAnswer.raw;
                    self.localSDP = new SDP(answer.sdp);
                    answer.sdp = self.localSDP.raw;
                    var ufrag = getUfrag(answer.sdp);
                    if (ufrag != self.localUfrag) {
                        self.localUfrag = ufrag;
                        self.room.eventEmitter.emit(
                                XMPPEvents.LOCAL_UFRAG_CHANGED, ufrag);
                    }
                    self.peerconnection.setLocalDescription(answer,
                        function() {
                            successCallback && successCallback();
                            queueCallback();
                        },
                        reportError.bind(
                            undefined,
                            "modified setLocalDescription failed")
                    );
                }, reportError.bind(undefined, "modified answer failed"),
                media_constraints
            );
        },
        reportError.bind(undefined, 'modify failed')
    );
};

/**
 * Adds stream.
 * @param stream new stream that will be added.
 * @param callback callback executed after successful stream addition.
 * @param errorCallback callback executed if stream addition fail.
 * @param ssrcInfo object with information about the SSRCs associated with the
 * stream.
 * @param dontModifySources {boolean} if true _modifySources won't be called.
 * Used for streams added before the call start.
 */
JingleSessionPC.prototype.addStream = function (stream, callback, errorCallback,
    ssrcInfo, dontModifySources) {
    // Remember SDP to figure out added/removed SSRCs
    var oldSdp = null;
    if(this.peerconnection && this.peerconnection.localDescription) {
        oldSdp = new SDP(this.peerconnection.localDescription.sdp);
    }

    // Conference is not active
    if(!oldSdp || !this.peerconnection || dontModifySources) {
        //when adding muted stream we have to pass the ssrcInfo but we don't
        //have a stream
        if(this.peerconnection && (stream || ssrcInfo))
            this.peerconnection.addStream(stream, ssrcInfo);
        if(ssrcInfo) {
            //available only on video unmute or when adding muted stream
            this.modifiedSSRCs[ssrcInfo.type] =
                this.modifiedSSRCs[ssrcInfo.type] || [];
            this.modifiedSSRCs[ssrcInfo.type].push(ssrcInfo);
        }
        callback();
        return;
    }

    if(stream || ssrcInfo)
        this.peerconnection.addStream(stream, ssrcInfo);

    this.modifyingLocalStreams = true;
    var self = this;
    this.modifySourcesQueue.push(function() {
        logger.log('modify sources done');
        if(ssrcInfo) {
            //available only on video unmute or when adding muted stream
            self.modifiedSSRCs[ssrcInfo.type] =
                self.modifiedSSRCs[ssrcInfo.type] || [];
            self.modifiedSSRCs[ssrcInfo.type].push(ssrcInfo);
        }
        var newSdp = new SDP(self.peerconnection.localDescription.sdp);
        logger.log("SDPs", oldSdp, newSdp);
        self.notifyMySSRCUpdate(oldSdp, newSdp);
    }, function (error) {
        if(!error) {
            callback();
        } else {
            errorCallback(error);
        }
    });
};

/**
 * Generate ssrc info object for a stream with the following properties:
 * - ssrcs - Array of the ssrcs associated with the stream.
 * - groups - Array of the groups associated with the stream.
 */
JingleSessionPC.prototype.generateNewStreamSSRCInfo = function () {
    return this.peerconnection.generateNewStreamSSRCInfo();
};

/**
 * Remove streams.
 * @param stream stream that will be removed.
 * @param callback callback executed after successful stream addition.
 * @param errorCallback callback executed if stream addition fail.
 * @param ssrcInfo object with information about the SSRCs associated with the
 * stream.
 */
JingleSessionPC.prototype.removeStream = function (stream, callback, errorCallback,
    ssrcInfo) {
    // Conference is not active
    if(!this.peerconnection) {
        callback();
        return;
    }

    // Remember SDP to figure out added/removed SSRCs
    var oldSdp = null;

    if(this.peerconnection.localDescription) {
        oldSdp = new SDP(this.peerconnection.localDescription.sdp);
    }

    if(!oldSdp) {
        callback();
        return;
    }

    if (RTCBrowserType.getBrowserType() ===
            RTCBrowserType.RTC_BROWSER_FIREFOX) {
        if(!stream) {//There is nothing to be changed
            callback();
            return;
        }
        var sender = null;
        // On Firefox we don't replace MediaStreams as this messes up the
        // m-lines (which can't be removed in Plan Unified) and brings a lot
        // of complications. Instead, we use the RTPSender and remove just
        // the track.
        var track = null;
        if(stream.getAudioTracks() && stream.getAudioTracks().length) {
            track = stream.getAudioTracks()[0];
        } else if(stream.getVideoTracks() && stream.getVideoTracks().length) {
            track = stream.getVideoTracks()[0];
        }

        if(!track) {
            var msg = "Cannot remove tracks: no tracks.";
            logger.log(msg);
            errorCallback(new Error(msg));
            return;
        }

        // Find the right sender (for audio or video)
        this.peerconnection.peerconnection.getSenders().some(function (s) {
            if (s.track === track) {
                sender = s;
                return true;
            }
        });

        if (sender) {
            this.peerconnection.peerconnection.removeTrack(sender);
        } else {
            logger.log("Cannot remove tracks: no RTPSender.");
        }
    } else if(stream)
        this.peerconnection.removeStream(stream, false, ssrcInfo);
    // else
    // NOTE: If there is no stream and the browser is not FF we still need to do
    // some transformation in order to send remove-source for the muted
    // streams. That's why we aren't calling return here.

    this.modifyingLocalStreams = true;
    var self = this;
    this.modifySourcesQueue.push(function() {
        logger.log('modify sources done');

        var newSdp = new SDP(self.peerconnection.localDescription.sdp);
        if(ssrcInfo) {
            self.modifiedSSRCs[ssrcInfo.type] =
                self.modifiedSSRCs[ssrcInfo.type] || [];
            self.modifiedSSRCs[ssrcInfo.type].push(ssrcInfo);
        }
        logger.log("SDPs", oldSdp, newSdp);
        self.notifyMySSRCUpdate(oldSdp, newSdp);
    }, function (error) {
        if(!error) {
            callback();
        } else {
            errorCallback(error);
        }
    });
};

/**
 * Figures out added/removed ssrcs and send update IQs.
 * @param old_sdp SDP object for old description.
 * @param new_sdp SDP object for new description.
 */
JingleSessionPC.prototype.notifyMySSRCUpdate = function (old_sdp, new_sdp) {

    if (this.state !== JingleSessionState.ACTIVE){
        logger.warn(
            "Skipping SSRC update in \'" + this.state + " \' state.");
        return;
    }

    // send source-remove IQ.
    sdpDiffer = new SDPDiffer(new_sdp, old_sdp);
    var remove = $iq({to: this.peerjid, type: 'set'})
        .c('jingle', {
            xmlns: 'urn:xmpp:jingle:1',
            action: 'source-remove',
            initiator: this.initiator,
            sid: this.sid
        }
    );
    sdpDiffer.toJingle(remove);
    var removed = this.fixJingle(remove);

    if (removed && remove) {
        logger.info("Sending source-remove", remove.tree());
        this.connection.sendIQ(
            remove, null, this.newJingleErrorHandler(remove, function (error) {
                GlobalOnErrorHandler.callErrorHandler(
                    new Error("Jingle error: " + JSON.stringify(error)));
            }), IQ_TIMEOUT);
    } else {
        logger.log('removal not necessary');
    }

    // send source-add IQ.
    var sdpDiffer = new SDPDiffer(old_sdp, new_sdp);
    var add = $iq({to: this.peerjid, type: 'set'})
        .c('jingle', {
            xmlns: 'urn:xmpp:jingle:1',
            action: 'source-add',
            initiator: this.initiator,
            sid: this.sid
        }
    );

    sdpDiffer.toJingle(add);
    var added = this.fixJingle(add);

    if (added && add) {
        logger.info("Sending source-add", add.tree());
        this.connection.sendIQ(
            add, null, this.newJingleErrorHandler(add, function (error) {
                GlobalOnErrorHandler.callErrorHandler(
                    new Error("Jingle error: " + JSON.stringify(error)));
            }), IQ_TIMEOUT);
    } else {
        logger.log('addition not necessary');
    }
};

/**
 * Method returns function(errorResponse) which is a callback to be passed to
 * Strophe connection.sendIQ method. An 'error' structure is created that is
 * passed as 1st argument to given <tt>failureCb</tt>. The format of this
 * structure is as follows:
 * {
 *  code: {XMPP error response code}
 *  reason: {the name of XMPP error reason element or 'timeout' if the request
 *           has timed out within <tt>IQ_TIMEOUT</tt> milliseconds}
 *  source: {request.tree() that provides original request}
 *  session: {JingleSessionPC instance on which the error occurred}
 * }
 * @param request Strophe IQ instance which is the request to be dumped into
 *        the error structure
 * @param failureCb function(error) called when error response was returned or
 *        when a timeout has occurred.
 * @returns {function(this:JingleSessionPC)}
 */
JingleSessionPC.prototype.newJingleErrorHandler = function(request, failureCb) {
    return function (errResponse) {

        var error = { };

        // Get XMPP error code and condition(reason)
        var errorElSel = $(errResponse).find('error');
        if (errorElSel.length) {
            error.code = errorElSel.attr('code');
            var errorReasonSel = $(errResponse).find('error :first');
            if (errorReasonSel.length)
                error.reason = errorReasonSel[0].tagName;
        }

        if (!errResponse) {
            error.reason = 'timeout';
        }

        error.source = null;
        if (request && "function" == typeof request.tree) {
            error.source = request.tree();
        }

        // Commented to fix JSON.stringify(error) exception for circular
        // dependancies when we print that error.
        // FIXME: Maybe we can include part of the session object
        // error.session = this;

        logger.error("Jingle error", error);
        if (failureCb) {
            failureCb(error);
        }
    }.bind(this);
};

JingleSessionPC.onJingleFatalError = function (session, error)
{
    this.room.eventEmitter.emit(XMPPEvents.CONFERENCE_SETUP_FAILED, error);
    this.room.eventEmitter.emit(XMPPEvents.JINGLE_FATAL_ERROR, session, error);
};

/**
 * Called when new remote MediaStream is added to the PeerConnection.
 * @param stream the WebRTC MediaStream for remote participant
 */
JingleSessionPC.prototype.remoteStreamAdded = function (stream) {
    var self = this;
    if (!RTC.isUserStream(stream)) {
        logger.info(
            "Ignored remote 'stream added' event for non-user stream", stream);
        return;
    }
    // Bind 'addtrack'/'removetrack' event handlers
    if (RTCBrowserType.isChrome() || RTCBrowserType.isNWJS()
        || RTCBrowserType.isElectron()) {
        stream.onaddtrack = function (event) {
            self.remoteTrackAdded(event.target, event.track);
        };
        stream.onremovetrack = function (event) {
            self.remoteTrackRemoved(event.target, event.track);
        };
    }
    // Call remoteTrackAdded for each track in the stream
    stream.getAudioTracks().forEach(function (track) {
        self.remoteTrackAdded(stream, track);
    });
    stream.getVideoTracks().forEach(function (track) {
        self.remoteTrackAdded(stream, track);
    });
};

/**
 * Called on "track added" and "stream added" PeerConnection events(cause we
 * handle streams on per track basis). Does find the owner and the SSRC for
 * the track and passes that to ChatRoom for further processing.
 * @param stream WebRTC MediaStream instance which is the parent of the track
 * @param track the WebRTC MediaStreamTrack added for remote participant
 */
JingleSessionPC.prototype.remoteTrackAdded = function (stream, track) {
    logger.info("Remote track added", stream, track);
    var streamId = RTC.getStreamID(stream);
    var mediaType = track.kind;

    // This is our event structure which will be passed by the ChatRoom as
    // XMPPEvents.REMOTE_TRACK_ADDED data
    var jitsiTrackAddedEvent = {
        stream: stream,
        track: track,
        mediaType: track.kind, /* 'audio' or 'video' */
        owner: undefined, /* to be determined below */
        muted: null /* will be set in the ChatRoom */
    };
    try{
        // look up an associated JID for a stream id
        if (!mediaType) {
            logger.error("MediaType undefined", track);
            throw new Error("MediaType undefined for remote track");
        }

        var remoteSDP = new SDP(this.peerconnection.remoteDescription.sdp);
        var medialines = remoteSDP.media.filter(function (mediaLines){
            return mediaLines.startsWith("m=" + mediaType);
        });
        if (!medialines.length) {
            logger.error("No media for type " + mediaType + " found in remote SDP");
            throw new Error("No media for type " + mediaType +
                " found in remote SDP for remote track");
        }

        var ssrclines = SDPUtil.find_lines(medialines[0], 'a=ssrc:');
        ssrclines = ssrclines.filter(function (line) {
            var msid = RTCBrowserType.isTemasysPluginUsed() ? 'mslabel' : 'msid';
            return line.indexOf(msid + ':' + streamId) !== -1;
        });

        var thessrc;
        if (ssrclines.length) {
            thessrc = ssrclines[0].substring(7).split(' ')[0];
            if (!this.ssrcOwners[thessrc]) {
                logger.error("No SSRC owner known for: " + thessrc);
                throw new Error("No SSRC owner known for: " + thessrc +
                    " for remote track");
            }
            jitsiTrackAddedEvent.owner = this.ssrcOwners[thessrc];
            logger.log('associated jid', this.ssrcOwners[thessrc], thessrc);
        } else {
            logger.error("No SSRC lines for ", streamId);
            throw new Error("No SSRC lines for streamId " + streamId +
                " for remote track");
        }
        jitsiTrackAddedEvent.ssrc = thessrc;

        this.room.remoteTrackAdded(jitsiTrackAddedEvent);
    } catch (error) {
        GlobalOnErrorHandler.callErrorHandler(error);
    }
};

/**
 * Handles remote stream removal.
 * @param stream the WebRTC MediaStream object which is being removed from the
 * PeerConnection
 */
JingleSessionPC.prototype.remoteStreamRemoved = function (stream) {
    var self = this;
    if (!RTC.isUserStream(stream)) {
        logger.info(
            "Ignored remote 'stream removed' event for non-user stream", stream);
        return;
    }
    // Call remoteTrackRemoved for each track in the stream
    stream.getVideoTracks().forEach(function(track){
        self.remoteTrackRemoved(stream, track);
    });
    stream.getAudioTracks().forEach(function(track) {
       self.remoteTrackRemoved(stream, track);
    });
};

/**
 * Handles remote media track removal.
 * @param stream WebRTC MediaStream instance which is the parent of the track
 * @param track the WebRTC MediaStreamTrack which has been removed from
 * the PeerConnection.
 */
JingleSessionPC.prototype.remoteTrackRemoved = function (stream, track) {
    logger.info("Remote track removed", stream, track);
    var streamId = RTC.getStreamID(stream);
    var trackId = track && track.id;
    try{
        if (!streamId) {
            logger.error("No stream ID for", stream);
            throw new Error("Remote track removal failed - No stream ID");
        }

        if (!trackId) {
            logger.error("No track ID for", track);
            throw new Error("Remote track removal failed - No track ID");
        }

        this.room.eventEmitter.emit(
            XMPPEvents.REMOTE_TRACK_REMOVED, streamId, trackId);
    } catch (error) {
        GlobalOnErrorHandler.callErrorHandler(error);
    }
};

/**
 * Returns the ice connection state for the peer connection.
 * @returns the ice connection state for the peer connection.
 */
JingleSessionPC.prototype.getIceConnectionState = function () {
    return this.peerconnection.iceConnectionState;
};

/**
 * Closes the peerconnection.
 */
JingleSessionPC.prototype.close = function () {
    this.closed = true;
    // do not try to close if already closed.
    this.peerconnection
        && ((this.peerconnection.signalingState
                && this.peerconnection.signalingState !== 'closed')
            || (this.peerconnection.connectionState
                && this.peerconnection.connectionState !== 'closed'))
        && this.peerconnection.close();
};


/**
 * Fixes the outgoing jingle packets by removing the nodes related to the
 * muted/unmuted streams, handles removing of muted stream, etc.
 * @param jingle the jingle packet that is going to be sent
 * @returns {boolean} true if the jingle has to be sent and false otherwise.
 */
JingleSessionPC.prototype.fixJingle = function(jingle) {
    var action = $(jingle.nodeTree).find("jingle").attr("action");
    switch (action) {
        case "source-add":
        case "session-accept":
            this.fixSourceAddJingle(jingle);
            break;
        case "source-remove":
            this.fixSourceRemoveJingle(jingle);
            break;
        default:
            var errmsg = "Unknown jingle action!";
            GlobalOnErrorHandler.callErrorHandler(errmsg);
            logger.error(errmsg);
            return false;
    }

    var sources = $(jingle.tree()).find(">jingle>content>description>source");
    return sources && sources.length > 0;
};

/**
 * Fixes the outgoing jingle packets with action source-add by removing the
 * nodes related to the unmuted streams
 * @param jingle the jingle packet that is going to be sent
 * @returns {boolean} true if the jingle has to be sent and false otherwise.
 */
JingleSessionPC.prototype.fixSourceAddJingle = function (jingle) {
    var ssrcs = this.modifiedSSRCs["unmute"];
    this.modifiedSSRCs["unmute"] = [];
    if(ssrcs && ssrcs.length) {
        ssrcs.forEach(function (ssrcObj) {
            var desc = $(jingle.tree()).find(">jingle>content[name=\"" +
                ssrcObj.mtype + "\"]>description");
            if(!desc || !desc.length)
                return;
            ssrcObj.ssrc.ssrcs.forEach(function (ssrc) {
                var sourceNode = desc.find(">source[ssrc=\"" +
                    ssrc + "\"]");
                sourceNode.remove();
            });
            ssrcObj.ssrc.groups.forEach(function (group) {
                var groupNode = desc.find(">ssrc-group[semantics=\"" +
                    group.group.semantics + "\"]:has(source[ssrc=\"" +
                    group.primarySSRC +
                     "\"])");
                groupNode.remove();
            });
        });
    }

    ssrcs = this.modifiedSSRCs["addMuted"];
    this.modifiedSSRCs["addMuted"] = [];
    if(ssrcs && ssrcs.length) {
        ssrcs.forEach(function (ssrcObj) {
            var desc = createDescriptionNode(jingle, ssrcObj.mtype);
            var cname = Math.random().toString(36).substring(2);
            ssrcObj.ssrc.ssrcs.forEach(function (ssrc) {
                var sourceNode = desc.find(">source[ssrc=\"" +ssrc + "\"]");
                sourceNode.remove();
                var sourceXML = "<source " +
                    "xmlns=\"urn:xmpp:jingle:apps:rtp:ssma:0\" ssrc=\"" +
                    ssrc + "\">" +
                    "<parameter xmlns=\"urn:xmpp:jingle:apps:rtp:ssma:0\"" +
                    " value=\"" + ssrcObj.msid + "\" name=\"msid\"/>" +
                    "<parameter xmlns=\"urn:xmpp:jingle:apps:rtp:ssma:0\"" +
                    " value=\"" + cname + "\" name=\"cname\" />" + "</source>";
                desc.append(sourceXML);
            });
            ssrcObj.ssrc.groups.forEach(function (group) {
                var groupNode = desc.find(">ssrc-group[semantics=\"" +
                    group.group.semantics + "\"]:has(source[ssrc=\"" + group.primarySSRC +
                    "\"])");
                groupNode.remove();
                desc.append("<ssrc-group semantics=\"" +
                    group.group.semantics +
                    "\" xmlns=\"urn:xmpp:jingle:apps:rtp:ssma:0\"><source ssrc=\"" +
                    group.group.ssrcs.split(" ").join("\"/><source ssrc=\"") + "\"/>" +
                    "</ssrc-group>");
            });
        });
    }
};

/**
 * Fixes the outgoing jingle packets with action source-remove by removing the
 * nodes related to the muted streams, handles removing of muted stream
 * @param jingle the jingle packet that is going to be sent
 * @returns {boolean} true if the jingle has to be sent and false otherwise.
 */
JingleSessionPC.prototype.fixSourceRemoveJingle = function(jingle) {
    var ssrcs = this.modifiedSSRCs["mute"];
    this.modifiedSSRCs["mute"] = [];
    if(ssrcs && ssrcs.length)
        ssrcs.forEach(function (ssrcObj) {
            ssrcObj.ssrc.ssrcs.forEach(function (ssrc) {
                var sourceNode = $(jingle.tree()).find(">jingle>content[name=\"" +
                    ssrcObj.mtype + "\"]>description>source[ssrc=\"" +
                    ssrc + "\"]");
                sourceNode.remove();
            });
            ssrcObj.ssrc.groups.forEach(function (group) {
                var groupNode = $(jingle.tree()).find(">jingle>content[name=\"" +
                    ssrcObj.mtype + "\"]>description>ssrc-group[semantics=\"" +
                    group.group.semantics + "\"]:has(source[ssrc=\"" + group.primarySSRC +
                     "\"])");
                groupNode.remove();
            });
        });

    ssrcs = this.modifiedSSRCs["remove"];
    this.modifiedSSRCs["remove"] = [];
    if(ssrcs && ssrcs.length)
        ssrcs.forEach(function (ssrcObj) {
            var desc = createDescriptionNode(jingle, ssrcObj.mtype);
            ssrcObj.ssrc.ssrcs.forEach(function (ssrc) {
                var sourceNode = desc.find(">source[ssrc=\"" +ssrc + "\"]");
                if(!sourceNode || !sourceNode.length) {
                    //Maybe we have to include cname, msid, etc here?
                    desc.append("<source " +
                        "xmlns=\"urn:xmpp:jingle:apps:rtp:ssma:0\" ssrc=\"" +
                        ssrc + "\"></source>");
                }
            });
            ssrcObj.ssrc.groups.forEach(function (group) {
                var groupNode = desc.find(">ssrc-group[semantics=\"" +
                    group.group.semantics + "\"]:has(source[ssrc=\"" + group.primarySSRC +
                     "\"])");
                if(!groupNode || !groupNode.length) {
                    desc.append("<ssrc-group semantics=\"" +
                        group.group.semantics +
                        "\" xmlns=\"urn:xmpp:jingle:apps:rtp:ssma:0\"><source ssrc=\"" +
                        group.group.ssrcs.split(" ").join("\"/><source ssrc=\"") + "\"/>" +
                        "</ssrc-group>");
                }
            });
        });
};

/**
 * Returns the description node related to the passed content type. If the node
 * doesn't exists it will be created.
 * @param jingle - the jingle packet
 * @param mtype - the content type(audio, video, etc.)
 */
function createDescriptionNode(jingle, mtype) {
    var content = $(jingle.tree()).find(">jingle>content[name=\"" +
        mtype + "\"]");

    if(!content || !content.length) {
        $(jingle.tree()).find(">jingle").append(
            "<content name=\"" + mtype + "\"></content>");
        content = $(jingle.tree()).find(">jingle>content[name=\"" +
            mtype + "\"]");
    }

    var desc = content.find(">description");
    if(!desc || !desc.length) {
        content.append("<description " +
            "xmlns=\"urn:xmpp:jingle:apps:rtp:1\" media=\"" +
            mtype + "\"></description>");
        desc = content.find(">description");
    }
    return desc;
}

/**
 * Extracts the ice username fragment from an SDP string.
 */
function getUfrag(sdp) {
    var ufragLines = sdp.split('\n').filter(function(line) {
        return line.startsWith("a=ice-ufrag:");});
    if (ufragLines.length > 0) {
        return ufragLines[0].substr("a=ice-ufrag:".length);
    }
}

module.exports = JingleSessionPC;
