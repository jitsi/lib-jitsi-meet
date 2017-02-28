/* global __filename, $, $iq, Strophe */

import {getLogger} from "jitsi-meet-logger";
const logger = getLogger(__filename);
import JingleSession from "./JingleSession";
const SDPDiffer = require("./SDPDiffer");
const SDPUtil = require("./SDPUtil");
const SDP = require("./SDP");
import SignallingLayerImpl from "./SignallingLayerImpl";
const async = require("async");
const XMPPEvents = require("../../service/xmpp/XMPPEvents");
const GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");
const Statistics = require("../statistics/statistics");

import * as JingleSessionState from "./JingleSessionState";

/**
 * Constant tells how long we're going to wait for IQ response, before timeout
 * error is  triggered.
 * @type {number}
 */
const IQ_TIMEOUT = 10000;

export default class JingleSessionPC extends JingleSession {

    /**
     * Creates new <tt>JingleSessionPC</tt>
     * @param {string} me our JID
     * @param {string} sid the Jingle Session ID - random string which
     * identifies the session
     * @param {string} peerjid remote peer JID
     * @param {Strophe.Connection} connection Strophe XMPP connection instance
     * used to send packets.
     * @param media_constraints the media constraints object passed to
     * createOffer/Answer, as defined by the WebRTC standard
     * @param ice_config the ICE servers config object as defined by the WebRTC
     * standard.
     * @param {boolean} isP2P indicates whether this instance is
     * meant to be used in a direct, peer to peer connection or <tt>false</tt>
     * if it's a JVB connection.
     * @param {boolean} isInitiator indicates whether or not we are the side
     * which sends the 'session-intiate'.
     * @param {object} options a set of config options
     * @param {boolean} options.webrtcIceUdpDisable <tt>true</tt> to block UDP
     * candidates.
     * @param {boolean} options.webrtcIceTcpDisable <tt>true</tt> to block TCP
     * candidates.
     * @param {boolean} options.failICE it's an option used in the tests. Set to
     * <tt>true</tt> to block any real candidates and make the ICE fail.
     * @constructor
     *
     * @implements {SignallingLayer}
     */
    constructor(me, sid, peerjid, connection,
                media_constraints, ice_config, isP2P, isInitiator, options) {
        super(me, sid, peerjid, connection, media_constraints, ice_config);

        /**
         * Stores "delayed" ICE candidates which are added to the PC once
         * the first sRD/sLD cycle is done.
         * @type {Array} an array of ICE candidate lines which can be added
         * directly to the PC
         */
        this.candidiates = [];

        this.lasticecandidate = false;
        this.closed = false;

        /**
         * Indicates whether this instance is an initiator or an answerer of
         * the Jingle session.
         * @type {boolean}
         */
        this.isInitiator = isInitiator;

        /**
         * Indicates whether or not this <tt>JingleSessionPC</tt> is used in
         * a peer to peer type of session.
         * @type {boolean} <tt>true</tt> if it's a peer to peer
         * session or <tt>false</tt> if it's a JVB session
         */
        this.isP2P = isP2P;

        /**
         * The signalling layer implementation.
         * @type {SignallingLayerImpl}
         */
        this.signallingLayer = new SignallingLayerImpl();

        this.webrtcIceUdpDisable = !!options.webrtcIceUdpDisable;
        this.webrtcIceTcpDisable = !!options.webrtcIceTcpDisable;
        /**
         * Flag used to enforce ICE failure through the URL parameter for
         * the automatic testing purpose.
         * @type {boolean}
         */
        this.failICE = !!options.failICE;

        this.modificationQueue = async.queue(this._processQueueTasks.bind(this), 1);

        /**
         * This is the MUC JID which will be used to add "owner" extension to
         * each of the local SSRCs signalled over Jingle.
         * Usually those are added automatically by Jicofo, but it is not
         * involved in a P2P session.
         * @type {string}
         */
        this.ssrcOwnerJid = null;

        /**
         * Flag used to guarantee that the connection established event is
         * triggered just once.
         * @type {boolean}
         */
        this.wasConnected = false;
    }

    /**
     * Adds all "delayed" ICE candidates to the PeerConnection.
     * @private
     */
    _dequeIceCandidates () {
        this.candidiates.forEach((candidate) => {
            const line = candidate.candidate;
            this.peerconnection.addIceCandidate(
                candidate,
                () => {
                    logger.debug("Add ICE candidate OK " + this + ": " + line);
                },
                (error) => {
                    logger.error(
                        "Add ICE candidate failed " + this + ": " + line,
                        error);
                });
        });
        this.candidiates = [];
    }

    /**
     * Finds all "source" elements under RTC "description" in given Jingle IQ
     * and adds 'ssrc-info' with the owner attribute set to
     * {@link ssrcOwnerJid}.
     * @param jingleIq the IQ to be modified
     * @private
     */
    _markAsSSRCOwner(jingleIq) {
        $(jingleIq).find("description source").append(
            "<ssrc-info xmlns=\"http://jitsi.org/jitmeet\" "
            + "owner=\"" + this.ssrcOwnerJid + "\">" +
            "</ssrc-info>");
    }

    /**
     * Sets the JID which will be as an owner value for the local SSRCs
     * signalled over Jingle. Should be our MUC JID.
     * @param {string} ownerJid
     */
    setSSRCOwnerJid(ownerJid) {
        this.ssrcOwnerJid = ownerJid;
    }

    doInitialize () {
        const self = this;
        this.lasticecandidate = false;
        // True if reconnect is in progress
        this.isreconnect = false;
        // Set to true if the connection was ever stable
        this.wasstable = false;
        // Create new peer connection instance
        this.peerconnection
            = this.rtc.createPeerConnection(
                this.signallingLayer,
                this.ice_config,
                /* Options */
                {
                    disableSimulcast: this.room.options.disableSimulcast,
                    disableRtx: this.room.options.disableRtx,
                    preferH264: this.room.options.preferH264
                },
                this.isP2P);

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
            const candidate = ev.candidate;
            if (candidate) {
                // Discard candidates of disabled protocols.
                let protocol = candidate.protocol;
                if (typeof protocol === 'string') {
                    protocol = protocol.toLowerCase();
                    if (protocol === 'tcp' || protocol === 'ssltcp') {
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
        // Note there is a change in the spec about closed:
        // This value moved into the RTCPeerConnectionState enum in
        // the May 13, 2016 draft of the specification, as it reflects the state
        // of the RTCPeerConnection, not the signaling connection. You now
        // detect a closed connection by checking for connectionState to be
        // "closed" instead.
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
         * The oniceconnectionstatechange event handler contains the code to
         * execute when the iceconnectionstatechange event, of type Event,
         * is received by this RTCPeerConnection. Such an event is sent when
         * the value of RTCPeerConnection.iceConnectionState changes.
         */
        this.peerconnection.oniceconnectionstatechange = function () {
            if (!(self && self.peerconnection)) return;
            const now = window.performance.now();
            self.room.connectionTimes["ice.state." +
            self.peerconnection.iceConnectionState] = now;
            logger.log("(TIME) ICE " + self.peerconnection.iceConnectionState +
                "(P2P: " + self.isP2P + "):\t", now);
            Statistics.analytics.sendEvent(
                'ice.' + self.peerconnection.iceConnectionState, {value: now});
            self.room.eventEmitter.emit(
                XMPPEvents.ICE_CONNECTION_STATE_CHANGED,
                self.peerconnection.iceConnectionState);
            switch (self.peerconnection.iceConnectionState) {
                case 'connected':
                    // Informs interested parties that the connection has been
                    // restored.
                    if (self.peerconnection.signalingState === 'stable') {
                        if (self.isreconnect) {
                            self.room.eventEmitter.emit(
                                XMPPEvents.CONNECTION_RESTORED, self);
                        } else if (!self.wasConnected) {
                            self.room.eventEmitter.emit(
                                XMPPEvents.CONNECTION_ESTABLISHED, self);
                        }
                        self.wasConnected = true;
                    }
                    self.isreconnect = false;

                    break;
                case 'disconnected':
                    if (self.closed)
                        break;
                    self.isreconnect = true;
                    // Informs interested parties that the connection has been interrupted.
                    if (self.wasstable)
                        self.room.eventEmitter.emit(
                            XMPPEvents.CONNECTION_INTERRUPTED);
                    break;
                case 'failed':
                    self.room.eventEmitter.emit(
                        XMPPEvents.CONNECTION_ICE_FAILED, self.peerconnection);
                    break;
            }
        };
        this.peerconnection.onnegotiationneeded = function () {
            self.room.eventEmitter.emit(XMPPEvents.PEERCONNECTION_READY, self);
        };
        // The signalling layer will bind it's listeners at this point
        this.signallingLayer.setChatRoom(this.room);
    }

    sendIceCandidate (candidate) {
        const self = this;
        const localSDP = new SDP(this.peerconnection.localDescription.sdp);
        if (candidate && !this.lasticecandidate) {
            const ice
                = SDPUtil.iceparams(
                    localSDP.media[candidate.sdpMLineIndex], localSDP.session);
            const jcand = SDPUtil.candidateToJingle(candidate.candidate);
            if (!(ice && jcand)) {
                const errorMesssage = "failed to get ice && jcand";
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
    }

    sendIceCandidates (candidates) {
        logger.log('sendIceCandidates', candidates);
        const cand = $iq({to: this.peerjid, type: 'set'})
            .c('jingle', {xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-info',
                initiator: this.initiator,
                sid: this.sid});

        const localSDP = new SDP(this.peerconnection.localDescription.sdp);
        for (let mid = 0; mid < localSDP.media.length; mid++) {
            const cands = candidates.filter(function (el) {
                return el.sdpMLineIndex == mid;
            });
            const mline
                = SDPUtil.parse_mline(localSDP.media[mid].split('\r\n')[0]);
            if (cands.length > 0) {
                const ice
                    = SDPUtil.iceparams(localSDP.media[mid], localSDP.session);
                ice.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';
                cand.c('content', {
                    creator: this.initiator == this.me ? 'initiator' : 'responder',
                    name: (cands[0].sdpMid ? cands[0].sdpMid : mline.media)
                }).c('transport', ice);
                for (let i = 0; i < cands.length; i++) {
                    const candidate
                        = SDPUtil.candidateToJingle(cands[i].candidate);
                    // Mangle ICE candidate if 'failICE' test option is enabled
                    if (this.failICE) {
                        candidate.ip = "1.1.1.1";
                    }
                    cand.c('candidate', candidate).up();
                }
                // add fingerprint
                const fingerprint_line
                    = SDPUtil.find_line(
                        localSDP.media[mid],
                        'a=fingerprint:', localSDP.session);

                if (fingerprint_line) {
                    const tmp = SDPUtil.parse_fingerprint(fingerprint_line);
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
        // might merge last-candidate notification into this, but it is called
        // a lot later. See webrtc issue #2340
        //logger.log('was this the last candidate', this.lasticecandidate);
        this.connection.sendIQ(
            cand, null, this.newJingleErrorHandler(cand, function (error) {
                GlobalOnErrorHandler.callErrorHandler(
                    new Error("Jingle error: " + JSON.stringify(error)));
            }), IQ_TIMEOUT);
    }

    /**
     * {@inheritDoc}
     */
    addIceCandidates(elem) {
        if (this.peerconnection.signalingState == 'closed') {
            logger.warn("Ignored add ICE candidate when in closed state");
            return;
        }
        // NOTE operates on each content element, can't use () =>
        elem.each((contentIdx, content) => {
            $(content).find('transport>candidate').each((idx, candidate) => {
                let line = SDPUtil.candidateFromJingle(candidate);
                line = line.replace("\r\n", "").replace("a=", "");
                // FIXME this code does not care to handle non-bundle transport
                const rtcCandidate = new RTCIceCandidate({
                    sdpMLineIndex: 0,
                    // FF comes up with more complex names like audio-23423,
                    // Given that it works on both Chrome and FF without
                    // providing it, let's leave it like this for the time being
                    //sdpMid: "audio",
                    candidate: line
                });
                // Will delay the addition until the remoteDescription is set
                if (this.peerconnection.remoteDescription.sdp) {
                    logger.debug("Trying to add ICE candidate: " + line);
                    this.peerconnection.addIceCandidate(
                        rtcCandidate,
                        () => { logger.debug("addIceCandidate ok: " + line); },
                        (error) => {
                            logger.error(
                                "addIceCandidate failed: " + line, error);
                        });
                } else {
                    logger.debug("Delaying ICE candidate: " + line);
                    this.candidiates.push(rtcCandidate);
                }
            });
        });
    }

    readSsrcInfo (contents) {
        const self = this;
        $(contents).each(function (idx, content) {
            const ssrcs = $(content).find('description>source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');
            ssrcs.each(function () {
                const ssrc = this.getAttribute('ssrc');
                $(this).find('>ssrc-info[xmlns="http://jitsi.org/jitmeet"]').each(
                    function () {
                        const owner = this.getAttribute('owner');
                        if (owner && owner.length) {
                            self.signallingLayer.setSSRCOwner(
                                ssrc, Strophe.getResourceFromJid(owner));
                        }
                    }
                );
            });
        });
    }

    /**
     * Does accept incoming Jingle 'session-initiate' and should send
     * 'session-accept' in result.
     * @param jingleOffer jQuery selector pointing to the jingle element of
     *        the offer IQ
     * @param success callback called when we accept incoming session
     *        successfully and receive RESULT packet to 'session-accept' sent.
     * @param failure function(error) called if for any reason we fail to accept
     *        the incoming offer. 'error' argument can be used to log some
     *        details about the error.
     */
    acceptOffer (jingleOffer, success, failure) {
        this.setOfferAnswerCycle(
            jingleOffer,
            () => {
                this.state = JingleSessionState.ACTIVE;
                // setOfferCycle succeeded, now we have self.localSDP up to date
                // Let's send an answer !
                // FIXME we may not care about RESULT packet for session-accept
                // then we should either call 'success' here immediately or
                // modify sendSessionAccept method to do that
                this.sendSessionAccept(success, failure);
            },
            failure);
    }

    /**
     * Creates an offer and sends Jingle 'session-initiate' to the remote peer.
     */
    invite() {
        if (!this.isInitiator) {
            throw new Error("Trying to invite from the responder session");
        }
        this.peerconnection.createOffer(
            this.sendSessionInitiate.bind(this),
            (error) => {
                logger.error("Failed to create offer", error);
            },
            this.media_constraints);
    }

    /**
     * Sends 'session-initiate' to the remote peer.
     * @param {object} sdp the local session description object as defined by
     * the WebRTC standard.
     */
    sendSessionInitiate (sdp) {
        logger.log('createdOffer', sdp);
        const sendJingle = () => {
            let init = $iq({to: this.peerjid,
                type: 'set'})
                .c('jingle', {xmlns: 'urn:xmpp:jingle:1',
                    action: 'session-initiate',
                    initiator: this.initiator,
                    sid: this.sid});
            let localSDP = new SDP(this.peerconnection.localDescription.sdp);
            localSDP.toJingle(
                init,
                this.initiator == this.me ? 'initiator' : 'responder');
            init = init.tree();
            this._markAsSSRCOwner(init);
            logger.info("Session-initiate: ", init);
            this.connection.sendIQ(init,
                () => {
                    logger.info("Got RESULT for 'session-initiate'");
                },
                (error) => {
                    logger.error("'session-initiate' error", error);
                },
                IQ_TIMEOUT);
        };
        this.peerconnection.setLocalDescription(
            sdp, sendJingle,
            (error) => {
                logger.error('session-init setLocalDescription failed', error);
            }
        );
    }

    /**
     * Sets the answer received from the remote peer.
     * @param jingleAnswer
     */
    setAnswer(jingleAnswer) {
        if (!this.isInitiator) {
            throw new Error("Trying to set an answer on the responder session");
        }
        this.setOfferAnswerCycle(
            jingleAnswer,
            () => {
                this.state = JingleSessionState.ACTIVE;
                logger.info("setAnswer - succeeded");
            },
            (error) => { logger.error("setAnswer failed: ", error); });
    }

    /**
     * This is a setRemoteDescription/setLocalDescription cycle which starts at
     * converting Strophe Jingle IQ into remote offer SDP. Once converted
     * setRemoteDescription, createAnswer and setLocalDescription calls follow.
     * @param jingleOfferAnswerIq jQuery selector pointing to the jingle element
     *        of the offer (or answer) IQ
     * @param success callback called when sRD/sLD cycle finishes successfully.
     * @param failure callback called with an error object as an argument if we
     *        fail at any point during setRD, createAnswer, setLD.
     */
    setOfferAnswerCycle(jingleOfferAnswerIq, success, failure) {
        const workFunction = (finishedCallback) => {
            const newRemoteSdp
                = this._processNewJingleOfferIq(jingleOfferAnswerIq);
            this._renegotiate(newRemoteSdp)
                .then(() => {
                    finishedCallback();
                }, (error) => {
                    logger.error(
                        "Error renegotiating after setting new remote "
                            + (this.isInitiator ? "answer: " : "offer: ")
                            + error, newRemoteSdp);
                    JingleSessionPC.onJingleFatalError(this, error);
                    finishedCallback(error);
                });
        };
        this.modificationQueue.push(
            workFunction,
            (error) => {
                if (!error) {
                    success();
                } else {
                    failure(error);
                }
            }
        );
    }

    /**
     * Although it states "replace transport" it does accept full Jingle offer
     * which should contain new ICE transport details.
     * @param jingleOfferElem an element Jingle IQ that contains new offer and
     *        transport info.
     * @param success callback called when we succeed to accept new offer.
     * @param failure function(error) called when we fail to accept new offer.
     */
    replaceTransport (jingleOfferElem, success, failure) {

        // We need to first set an offer without the 'data' section to have the
        // SCTP stack cleaned up. After that the original offer is set to have
        // the SCTP connection established with the new bridge.
        this.room.eventEmitter.emit(XMPPEvents.ICE_RESTARTING);
        const originalOffer = jingleOfferElem.clone();
        jingleOfferElem.find(">content[name='data']").remove();

        // First set an offer without the 'data' section
        this.setOfferAnswerCycle(
            jingleOfferElem,
            () => {
                // Now set the original offer(with the 'data' section)
                this.setOfferAnswerCycle(
                    originalOffer,
                    () => {
                        const localSDP
                            = new SDP(this.peerconnection.localDescription);
                        // Set local description OK, now localSDP up to date
                        this.sendTransportAccept(localSDP, success, failure);
                    },
                    failure);
            },
            failure
        );
    }

    /**
     * Sends Jingle 'session-accept' message.
     * @param {function()} success callback called when we receive 'RESULT'
     *        packet for the 'session-accept'
     * @param {function(error)} failure called when we receive an error response
     *        or when the request has timed out.
     */
    sendSessionAccept (success, failure) {
        // NOTE: since we're just reading from it, we don't need to be within
        //  the modification queue to access the local description
        const localSDP = new SDP(this.peerconnection.localDescription.sdp);
        let accept = $iq({to: this.peerjid,
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

        // Calling tree() to print something useful
        accept = accept.tree();
        this._markAsSSRCOwner(accept);
        logger.info("Sending session-accept", accept);
        const self = this;
        this.connection.sendIQ(accept,
            success,
            this.newJingleErrorHandler(accept, function (error) {
                failure(error);
                // 'session-accept' is a critical timeout and we'll
                // have to restart
                self.room.eventEmitter.emit(XMPPEvents.SESSION_ACCEPT_TIMEOUT);
            }),
            IQ_TIMEOUT);
        // XXX Videobridge needs WebRTC's answer (ICE ufrag and pwd, DTLS
        // fingerprint and setup) ASAP in order to start the connection
        // establishment.
        //
        // FIXME Flushing the connection at this point triggers an issue with
        // BOSH request handling in Prosody on slow connections.
        //
        // The problem is that this request will be quite large and it may take
        // time before it reaches Prosody. In the meantime Strophe may decide
        // to send the next one. And it was observed that a small request with
        // 'transport-info' usually follows this one. It does reach Prosody
        // before the previous one was completely received. 'rid' on the server
        // is increased and Prosody ignores the request with 'session-accept'.
        // It will never reach Jicofo and everything in the request table is
        // lost. Removing the flush does not guarantee it will never happen, but
        // makes it much less likely('transport-info' is bundled with
        // 'session-accept' and any immediate requests).
        //
        // this.connection.flush();
    }

    /**
     * Sends Jingle 'transport-accept' message which is a response to
     * 'transport-replace'.
     * @param localSDP the 'SDP' object with local session description
     * @param success callback called when we receive 'RESULT' packet for
     *        'transport-replace'
     * @param failure function(error) called when we receive an error response
     *        or when the request has timed out.
     */
    sendTransportAccept(localSDP, success, failure) {
        const self = this;
        let tAccept = $iq({to: this.peerjid, type: 'set'})
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-accept',
                initiator: this.initiator,
                sid: this.sid
            });

        localSDP.media.forEach(function (medialines, idx) {
            const mline = SDPUtil.parse_mline(medialines.split('\r\n')[0]);
            tAccept.c('content',
                {
                    creator: self.initiator == self.me ? 'initiator' : 'responder',
                    name: mline.media
                }
            );
            localSDP.transportToJingle(idx, tAccept);
            tAccept.up();
        });

        // Calling tree() to print something useful to the logger
        tAccept = tAccept.tree();
        logger.info("Sending transport-accept: ", tAccept);

        self.connection.sendIQ(tAccept,
            success,
            self.newJingleErrorHandler(tAccept, failure),
            IQ_TIMEOUT);
    }

    /**
     * Sends Jingle 'transport-reject' message which is a response to
     * 'transport-replace'.
     * @param success callback called when we receive 'RESULT' packet for
     *        'transport-replace'
     * @param failure function(error) called when we receive an error response
     *        or when the request has timed out.
     */
    sendTransportReject(success, failure) {
        // Send 'transport-reject', so that the focus will
        // know that we've failed
        let tReject = $iq({to: this.peerjid, type: 'set'})
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-reject',
                initiator: this.initiator,
                sid: this.sid
            });

        tReject = tReject.tree();
        logger.info("Sending 'transport-reject", tReject);

        this.connection.sendIQ(tReject,
            success,
            this.newJingleErrorHandler(tReject, failure),
            IQ_TIMEOUT);
    }

    /**
     * @inheritDoc
     */
    terminate (reason, text, success, failure) {
        let term = $iq({ to: this.peerjid, type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'session-terminate',
                initiator: this.initiator,
                sid: this.sid
            })
            .c('reason')
            .c(reason || 'success');

        if (text) {
            term.up().c('text').t(text);
        }

        // Calling tree() to print something useful
        term = term.tree();
        logger.info("Sending session-terminate", term);

        this.connection.sendIQ(
            term,
            success, this.newJingleErrorHandler(term, failure), IQ_TIMEOUT);

        // this should result in 'onTerminated' being called by strope.jingle.js
        this.connection.jingle.terminate(this.sid);
    }

    onTerminated (reasonCondition, reasonText) {
        this.state = JingleSessionState.ENDED;

        // Do something with reason and reasonCondition when we start to care
        //this.reasonCondition = reasonCondition;
        //this.reasonText = reasonText;
        logger.info("Session terminated", this, reasonCondition, reasonText);

        this.close();
    }

    /**
     * Parse the information from the xml sourceAddElem and translate it
     *  into sdp lines
     * @param {jquery xml element} sourceAddElem the source-add
     *  element from jingle
     * @param {SDP object} currentRemoteSdp the current remote
     *  sdp (as of this new source-add)
     * @returns {list} a list of SDP line strings that should
     *  be added to the remote SDP
     */
    _parseSsrcInfoFromSourceAdd (sourceAddElem, currentRemoteSdp) {
        let addSsrcInfo = [];
        $(sourceAddElem).each(function (idx, content) {
            const name = $(content).attr('name');
            let lines = '';
            $(content)
                .find('ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
                .each(function() {
                    const semantics = this.getAttribute('semantics');
                    const ssrcs = $(this).find('>source').map(function () {
                        return this.getAttribute('ssrc');
                    }).get();

                    if (ssrcs.length) {
                        lines += 'a=ssrc-group:' + semantics
                            + ' ' + ssrcs.join(' ') + '\r\n';
                    }
            });
            // handles both >source and >description>source
            const tmp
                = $(content).find(
                    'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');
            tmp.each(function () {
                const ssrc = $(this).attr('ssrc');
                if (currentRemoteSdp.containsSSRC(ssrc)) {
                    logger.warn(
                        "Source-add request for existing SSRC: " + ssrc);
                    return;
                }
                $(this).find('>parameter').each(function () {
                    lines += 'a=ssrc:' + ssrc + ' ' + $(this).attr('name');
                    if ($(this).attr('value') && $(this).attr('value').length)
                        lines += ':' + $(this).attr('value');
                    lines += '\r\n';
                });
            });
            currentRemoteSdp.media.forEach(function(media, idx) {
                if (!SDPUtil.find_line(media, 'a=mid:' + name))
                    return;
                if (!addSsrcInfo[idx]) {
                    addSsrcInfo[idx] = '';
                }
                addSsrcInfo[idx] += lines;
            });
        });
        return addSsrcInfo;
    }

    /**
     * Handles a Jingle source-add message for this Jingle session.
     * @param elem An array of Jingle "content" elements.
     */
    addRemoteStream (elem) {
        // FIXME: dirty waiting
        if (!this.peerconnection.localDescription) {
            logger.warn("addSource - localDescription not ready yet");
            setTimeout(() => this.addRemoteStream(elem), 200);
            return;
        }
        logger.log('Processing add remote stream');
        logger.log(
            'ICE connection state: ', this.peerconnection.iceConnectionState);

        this.readSsrcInfo(elem);

        const workFunction = () => {
            const sdp = new SDP(this.peerconnection.remoteDescription.sdp);
            const addSsrcInfo = this._parseSsrcInfoFromSourceAdd(elem, sdp);

            const newRemoteSdp = this._processRemoteAddSource(addSsrcInfo);
            return newRemoteSdp;

        };
        // Queue and execute
        this._doRenegotiate("source-add", workFunction)
            .then(() => { logger.info("source-add - done!"); })
            .catch((error) => { logger.error("source-add error:", error); });
    }

    /**
     * Handles a Jingle source-remove message for this Jingle session.
     * @param elem An array of Jingle "content" elements.
     */
    removeRemoteStream (elem) {
        // FIXME: dirty waiting
        if (!this.peerconnection.localDescription) {
            logger.warn("removeSource - localDescription not ready yet");
            setTimeout(() => this.removeRemoteStream(elem), 200);
            return;
        }

        const workFunction = () => {
            logger.log('Remove remote stream');
            logger.log(
                'ICE connection state: ',
                this.peerconnection.iceConnectionState);

            const sdp = new SDP(this.peerconnection.remoteDescription.sdp);
            const removeSsrcInfo
                = this._parseSsrcInfoFromSourceRemove(elem, sdp);
            const newRemoteSdp
                = this._processRemoteRemoveSource(removeSsrcInfo);
            return newRemoteSdp;
        };
        // Queue and execute
        this._doRenegotiate("source-remove", workFunction)
            .then(() => { logger.info("source-remove - done!"); })
            .catch((error) => { logger.error("source-remove error:", error); });
    }

    /**
     * The 'task' function will be given a callback it MUST call with either:
     *  1) No arguments if it was successful or
     *  2) An error argument if there was an error
     * If the task wants to process the success or failure of the task, it
     * should pass a handler to the .push function, e.g.:
     * queue.push(task, (err) => {
     *     if (err) {
     *         // error handling
     *     } else {
     *         // success handling
     *     }
     * });
     */
    _processQueueTasks (task, finishedCallback) {
        task(finishedCallback);
    }

    /**
     * Takes in a jingle offer iq, returns the new sdp offer
     * @param {jquery xml element} offerIq the incoming offer
     * @returns {SDP object} the jingle offer translated to SDP
     */
    _processNewJingleOfferIq (offerIq) {
        const remoteSdp = new SDP('');
        if (this.webrtcIceTcpDisable) {
            remoteSdp.removeTcpCandidates = true;
        }
        if (this.webrtcIceUdpDisable) {
            remoteSdp.removeUdpCandidates = true;
        }
        if (this.failICE) {
            remoteSdp.failICE = true;
        }

        remoteSdp.fromJingle(offerIq);
        this.readSsrcInfo($(offerIq).find(">content"));
        return remoteSdp;
    }

    /**
     * Remove the given ssrc lines from the current remote sdp
     * @param {list} removeSsrcInfo a list of SDP line strings that
     *  should be removed from the remote SDP
     * @returns type {SDP Object} the new remote SDP (after removing the lines
     *  in removeSsrcInfo
     */
    _processRemoteRemoveSource (removeSsrcInfo) {
        const remoteSdp = new SDP(this.peerconnection.remoteDescription.sdp);
        removeSsrcInfo.forEach(function(lines, idx) {
            lines = lines.split('\r\n');
            lines.pop(); // remove empty last element;
            lines.forEach(function(line) {
                remoteSdp.media[idx]
                    = remoteSdp.media[idx].replace(line + '\r\n', '');
            });
        });
        remoteSdp.raw = remoteSdp.session + remoteSdp.media.join('');

        return remoteSdp;
    }

    /**
     * Add the given ssrc lines to the current remote sdp
     * @param {list} addSsrcInfo a list of SDP line strings that
     *  should be added to the remote SDP
     * @returns type {SDP Object} the new remote SDP (after removing the lines
     *  in removeSsrcInfo
     */
    _processRemoteAddSource (addSsrcInfo) {
        const remoteSdp = new SDP(this.peerconnection.remoteDescription.sdp);
        addSsrcInfo.forEach(function(lines, idx) {
            remoteSdp.media[idx] += lines;
        });
        remoteSdp.raw = remoteSdp.session + remoteSdp.media.join('');

        return remoteSdp;
    }

    /**
     * Do a new o/a flow using the existing remote description
     * @param {SDP object} optionalRemoteSdp optional remote sdp
     *  to use.  If not provided, the remote sdp from the
     *  peerconnection will be used
     * @returns {Promise} promise which resolves when the
     *  o/a flow is complete with no arguments or
     *  rejects with an error {string}
     */
    _renegotiate (optionalRemoteSdp) {
        const remoteSdp
            = optionalRemoteSdp
                || new SDP(this.peerconnection.remoteDescription.sdp);
        const remoteDescription = new RTCSessionDescription({
            type: this.isInitiator ? "answer" : "offer",
            sdp: remoteSdp.raw
        });
        return new Promise((resolve, reject) => {
            if (this.peerconnection.signalingState === 'closed') {
                reject("Attempted to renegotiate in state closed");
                return;
            }
            if (this.isInitiator) {
                this._initiatorRenegotiate(remoteDescription, resolve, reject);
            } else {
                this._responderRenegotiate(remoteDescription, resolve, reject);
            }
        });
    }

    /**
     * Renegotiate cycle implementation for the responder case.
     * @param {object} remoteDescription the SDP object as defined by the WebRTC
     * which will be used as remote description in the cycle.
     * @param {function} resolve the success callback
     * @param {function} reject the failure callback
     * @private
     */
    _responderRenegotiate (remoteDescription, resolve, reject) {
        // FIXME use WebRTC promise API to simplify things
        logger.debug("Renegotiate: setting remote description");
        this.peerconnection.setRemoteDescription(
            remoteDescription,
            () => {
                logger.debug("Renegotiate: creating answer");
                this.peerconnection.createAnswer(
                    (answer) => {
                        logger.debug("Renegotiate: setting local description");
                        this.peerconnection.setLocalDescription(
                            answer,
                            () => {
                                this._dequeIceCandidates();
                                resolve();
                            },
                            (error) => {
                                reject(
                                    "setLocalDescription failed: " + error);
                            }
                        );
                    },
                    (error) => { reject("createAnswer failed: " + error); },
                    this.media_constraints
                );
            },
            (error) => { reject("setRemoteDescription failed: " + error); }
        );
    }

    /**
     * Renegotiate cycle implementation for the initiator's case.
     * @param {object} remoteDescription the SDP object as defined by the WebRTC
     * which will be used as remote description in the cycle.
     * @param {function} resolve the success callback
     * @param {function} reject the failure callback
     * @private
     * @private
     */
    _initiatorRenegotiate (remoteDescription, resolve, reject) {
        // FIXME use WebRTC promise API to simplify things
        if (this.peerconnection.signalingState === 'have-local-offer') {
            // Skip createOffer and setLocalDescription or FF will fail
            logger.debug(
                "Renegotiate: setting remote description");
            this.peerconnection.setRemoteDescription(remoteDescription,
                () => {
                    this._dequeIceCandidates();
                    resolve();
                },
                (error) => {
                    reject("setRemoteDescription failed: " + error);
                });
        } else {
            logger.debug("Renegotiate: creating offer");
            this.peerconnection.createOffer(
                (offer) => {
                    logger.debug("Renegotiate: setting local description");
                    this.peerconnection.setLocalDescription(offer,
                        () => {
                            logger.debug(
                                "Renegotiate: setting remote description");
                            this.peerconnection.setRemoteDescription(
                                remoteDescription,
                                () => {
                                    this._dequeIceCandidates();
                                    resolve();
                                },
                                (error) => {
                                    reject(
                                        "setRemoteDescription failed: "
                                            + error);
                                });
                        },
                        (error) => {
                            reject("setLocalDescription failed: ", error);
                        });
                },
                (error) => {
                    reject("createOffer failed: " + error);
                },
                this.media_constraints);
        }
    }

    /**
     * Replaces <tt>oldTrack</tt> with <tt>newTrack</tt> and performs a single
     * offer/answer cycle after both operations are done. Either
     * <tt>oldTrack</tt> or <tt>newTrack</tt> can be null; replacing a valid
     * <tt>oldTrack</tt> with a null <tt>newTrack</tt> effectively just removes
     * <tt>oldTrack</tt>
     * @param {JitsiLocalTrack|null} oldTrack the current track in use to be replaced
     * @param {JitsiLocalTrack|null} newTrack the new track to use
     * @returns {Promise} which resolves once the replacement is complete
     *  with no arguments or rejects with an error {string}
     */
    replaceTrack (oldTrack, newTrack) {
        const workFunction = () => {
            if (oldTrack) {
                this.peerconnection.removeTrack(oldTrack);
            }
            if (newTrack) {
                this.peerconnection.addTrack(newTrack);
            }
            return true; // Try to renegotiate
        };
        return this._doRenegotiate("replaceTrack", workFunction);
    }

    /**
     * Parse the information from the xml sourceRemoveElem and translate it
     *  into sdp lines
     * @param {jquery xml element} sourceRemoveElem the source-remove
     *  element from jingle
     * @param {SDP object} currentRemoteSdp the current remote
     *  sdp (as of this new source-remove)
     * @returns {list} a list of SDP line strings that should
     *  be removed from the remote SDP
     */
    _parseSsrcInfoFromSourceRemove (sourceRemoveElem, currentRemoteSdp) {
        let removeSsrcInfo = [];
        $(sourceRemoveElem).each(function (idx, content) {
            const name = $(content).attr('name');
            let lines = '';
            $(content)
                .find('ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
                .each(function() {
                    const semantics = this.getAttribute('semantics');
                    const ssrcs = $(this).find('>source').map(function () {
                        return this.getAttribute('ssrc');
                    }).get();

                    if (ssrcs.length) {
                        lines += 'a=ssrc-group:' + semantics
                            + ' ' + ssrcs.join(' ') + '\r\n';
                    }
            });
            const ssrcs = [];
            // handles both >source and >description>source versions
            const tmp
                = $(content).find(
                    'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');
            tmp.each(function () {
                const ssrc = $(this).attr('ssrc');
                ssrcs.push(ssrc);
            });
            currentRemoteSdp.media.forEach(function(media, idx) {
                if (!SDPUtil.find_line(media, 'a=mid:' + name))
                    return;
                if (!removeSsrcInfo[idx]) {
                    removeSsrcInfo[idx] = '';
                }
                ssrcs.forEach(function(ssrc) {
                    const ssrcLines
                        = SDPUtil.find_lines(media, 'a=ssrc:' + ssrc);
                    if (ssrcLines.length) {
                        removeSsrcInfo[idx] += ssrcLines.join("\r\n")+"\r\n";
                    }
                });
                removeSsrcInfo[idx] += lines;
            });
        });
        return removeSsrcInfo;
    }

    /**
     * Adds <tt>JitsiLocalTrack</tt>s to this session.
     * @param {JitsiLocalTrack[]} tracks new local tracks that will be added.
     * @return {Promise} a promise that will resolve once all local tracks are
     * added. Will be rejected with a <tt>string</tt> which describes the error.
     * NOTE(brian): there is a decent amount of overlap here with replaceStream
     *  that could be re-used...however we can't leverage that currently because
     *  the extra work we do here must be in the work function context and if we
     *  then called replaceTrack we'd be adding another task on the queue
     *  from within a task which would then deadlock.  The 'replaceTrack' core
     *  logic should be moved into a helper function that could be called within
     *  the 'doReplaceStream' task or the 'doAddStream' task (for example)
     */
    addLocalTracks (tracks) {
        const workFunction = () => {
            if (!this.peerconnection) {
                return "Error: "
                     + "tried adding stream with no active peer connection";
            }
            for (let track of tracks) {
                this.peerconnection.addTrack(track);
            }
            return true;
        };
        return this._doRenegotiate("addStreams", workFunction);
    }

    /**
     * Adds local track back to this session, as part of the unmute operation.
     * @param {JitsiLocalTrack} track
     * @return {Promise} a promise that will resolve once the local track is
     * added back to this session and renegotiation succeeds. Will be rejected
     * with a <tt>string</tt> that provides some error details in case something
     * goes wrong.
     */
    addTrackAsUnmute (track) {
        if (!track) {
            return Promise.reject("invalid 'track' argument value");
        }
        const workFunction = () => {
            if (!this.peerconnection) {
                return "Error: "
                    + "tried adding track with no active peer connection";
            }
            return this.peerconnection.addTrackUnmute(track);
        };
        return this._doRenegotiate("addStreamAsUnmute", workFunction);
    }

    /**
     * Attached previously detached local tracks back to this session.
     * @param {JitsiLocalTrack[]} localTracks
     * @return {Promise} a promise that will be resolved once the local tracks
     * are attached back to this session and the renegotiation is performed.
     * Will be rejected with a <tt>string</tt> describing the error if anything
     * goes wrong.
     */
    attachLocalTracks (localTracks) {
        if (!localTracks) {
            return Promise.reject("invalid 'localTracks' argument value");
        }
        const workFunction = () => {
            if (!this.peerconnection) {
                return "Error: "
                    + "tried adding stream with no active peer connection";
            }
            for (let track of localTracks) {
                this.peerconnection.attachTrack(track);
            }
            return true;
        };
        return this._doRenegotiate("attachTracks", workFunction);
    }

    /**
     * Remove local track as part of the mute operation.
     * @param {JitsiLocalTrack} track the local track to be removed
     * @return {Promise} a promise which will be resolved once the local track
     * is removed from this session and the renegotiation is performed.
     * The promise will be rejected with a <tt>string</tt> that the describes
     * the error if anything goes wrong.
     */
    removeTrackAsMute (track) {
        if (!track) {
            return Promise.reject("invalid 'track' argument value");
        }
        const workFunction = () => {
            if (!this.peerconnection) {
                return false;
            }
            return this.peerconnection.removeTrackMute(track);
        };
        return this._doRenegotiate("remove-as-mute", workFunction);
    }

    /**
     * A worker function that is scheduled and executed on the
     * {@link modificationQueue}. Local SDPs from before and after the function
     * is executed are compared and 'source-add'/'source-remove' notifications
     * are being sent to remote participants (to propagate changes in local
     * streams description).
     * @name JingleSessionPC~WorkerFunction
     * @function
     * @returns {boolean|string|SDP} there are several things that this
     * function can return:
     * <tt>true</tt> if the renegotiation should follow the function execution
     * <tt>false</tt> if there should be no renegotiation
     * <tt>SDP</tt> that will be set as the remote description in the
     * renegotiation process
     * <tt>string</tt> which stands for the error description, no renegotiation
     * will be done in that case it's returned
     */
    /**
     * Does the logic of doing the session renegotiation by updating local and
     * remote session descriptions. Will compare the local description, before
     * and after the renegotiation to update local streams description (sends
     * "source-add"/"source-remove" notifications).
     * @param {string} actionName the name of the action which will appear in
     * the events logged to the logger.
     * @param {WorkerFunction} workFunction a function that will be executed on
     * the queue. See type description for moe info.
     * @private
     */
    _doRenegotiate (actionName, workFunction) {
        const workFunctionWrap = (finishedCallback) => {
            // Remember localSDP from before any modifications are done, by
            // the worker function
            let oldSdp = this.peerconnection.localDescription.sdp;
            let remoteSdp = null;

            let modifySources = workFunction();
            // workFunction can return error description
            if (typeof modifySources === 'string') {
                finishedCallback(modifySources);
                return;
            } else if (typeof modifySources === 'object') {
                remoteSdp = modifySources;
                modifySources = true;
            }

            if (!oldSdp) {
                logger.info(
                    this + ": " + actionName + " - will NOT modify sources, "
                    + "because there is no local SDP yet");
                modifySources = false;
            } else if (!this.peerconnection.remoteDescription.sdp) {
                logger.info(
                    this + ": " + actionName + " - will NOT modify sources, "
                    + "because there is no remote SDP yet");
                modifySources = false;
            }
            if (!modifySources) {
                // ABORT
                finishedCallback();
                return;
            }
            // Convert to SDP object
            oldSdp = new SDP(oldSdp);
            this._renegotiate(remoteSdp)
                .then(() => {
                    const newSdp
                        = new SDP(this.peerconnection.localDescription.sdp);
                    // FIXME SDP objects should not be logged ?
                    logger.log(actionName + " - OK, SDPs: ", oldSdp, newSdp);
                    this.notifyMySSRCUpdate(oldSdp, newSdp);
                    finishedCallback();
                }, (error) => {
                    logger.error(actionName + " renegotiate failed: ", error);
                    finishedCallback(error);
                });
        };
        return new Promise((resolve, reject) => {
            this.modificationQueue.push(
                workFunctionWrap,
                (error) => {
                    if (!error) {
                        resolve();
                    } else {
                        reject(error);
                    }
                }
            );
        });
    }

    /**
     * Detaches local track from this session. A detached track does no longer
     * stream any media to the remote participant, but is logically bound to
     * this session and is still advertised to other conference participants and
     * handles "mute"/"unmute" actions.
     * @param {JitsiLocalTrack} track the local track to be detached.
     * @return {Promise}
     */
    detachLocalTrack (track) {
        return this.detachLocalTracks([track]);
    }

    /**
     * Detaches multiple local tracks in one operation. See
     * {@link detachLocalTrack}.
     * @param {JitsiLocalTrack[]} tracks an array of local tracks to be detached
     * @return {Promise} the same as in {@link detachLocalTrack}.
     */
    detachLocalTracks (tracks) {
        if (!tracks) {
            return Promise.reject("invalid 'tracks' argument value");
        }
        const workFunction = () => {
            if (!this.peerconnection) {
                return false; // Do not renegotiate
            }
            for (let track of tracks) {
                this.peerconnection.detachTrack(track);
            }
            // FIXME it would be possible to optimise by making detach return
            // true only if any modifications were done
            return true;
        };
        return this._doRenegotiate("detach track", workFunction);
    }

    /**
     * Figures out added/removed ssrcs and send update IQs.
     * @param old_sdp SDP object for old description.
     * @param new_sdp SDP object for new description.
     */
    notifyMySSRCUpdate (old_sdp, new_sdp) {

        if (this.state !== JingleSessionState.ACTIVE) {
            logger.warn(
                "Skipping SSRC update in \'" + this.state + " \' state.");
            return;
        }

        // send source-remove IQ.
        let sdpDiffer = new SDPDiffer(new_sdp, old_sdp);
        const remove = $iq({to: this.peerjid, type: 'set'})
            .c('jingle', {
                    xmlns: 'urn:xmpp:jingle:1',
                    action: 'source-remove',
                    initiator: this.initiator,
                    sid: this.sid
                }
            );
        const removedAnySSRCs = sdpDiffer.toJingle(remove);

        if (removedAnySSRCs) {
            logger.info("Sending source-remove", remove.tree());
            this.connection.sendIQ(
                remove, null,
                this.newJingleErrorHandler(remove, function (error) {
                    GlobalOnErrorHandler.callErrorHandler(
                        new Error("Jingle error: " + JSON.stringify(error)));
                }), IQ_TIMEOUT);
        } else {
            logger.log('removal not necessary');
        }

        // send source-add IQ.
        sdpDiffer = new SDPDiffer(old_sdp, new_sdp);
        const add = $iq({to: this.peerjid, type: 'set'})
            .c('jingle', {
                    xmlns: 'urn:xmpp:jingle:1',
                    action: 'source-add',
                    initiator: this.initiator,
                    sid: this.sid
                }
            );

        const containsNewSSRCs = sdpDiffer.toJingle(add);

        if (containsNewSSRCs) {
            logger.info("Sending source-add", add.tree());
            this.connection.sendIQ(
                add, null, this.newJingleErrorHandler(add, function (error) {
                    GlobalOnErrorHandler.callErrorHandler(
                        new Error("Jingle error: " + JSON.stringify(error)));
                }), IQ_TIMEOUT);
        } else {
            logger.log('addition not necessary');
        }
    }

    /**
     * Method returns function(errorResponse) which is a callback to be passed
     * to Strophe connection.sendIQ method. An 'error' structure is created that
     * is passed as 1st argument to given <tt>failureCb</tt>. The format of this
     * structure is as follows:
     * {
     *  code: {XMPP error response code}
     *  reason: {the name of XMPP error reason element or 'timeout' if the
      *          request has timed out within <tt>IQ_TIMEOUT</tt> milliseconds}
     *  source: {request.tree() that provides original request}
     *  session: {JingleSessionPC instance on which the error occurred}
     * }
     * @param request Strophe IQ instance which is the request to be dumped into
     *        the error structure
     * @param failureCb function(error) called when error response was returned
     *        or when a timeout has occurred.
     * @returns {function(this:JingleSessionPC)}
     */
    newJingleErrorHandler (request, failureCb) {
        return function (errResponse) {

            const error = {};

            // Get XMPP error code and condition(reason)
            const errorElSel = $(errResponse).find('error');
            if (errorElSel.length) {
                error.code = errorElSel.attr('code');
                const errorReasonSel = $(errResponse).find('error :first');
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
    }

    static onJingleFatalError (session, error) {
        if (this.room) {
            this.room.eventEmitter.emit(
                XMPPEvents.CONFERENCE_SETUP_FAILED, error);
            this.room.eventEmitter.emit(
                XMPPEvents.JINGLE_FATAL_ERROR, session, error);
        }
    }

    /**
     * Returns the ice connection state for the peer connection.
     * @returns the ice connection state for the peer connection.
     */
    getIceConnectionState () {
        return this.peerconnection.iceConnectionState;
    }

    /**
     * Closes the peerconnection.
     */
    close () {
        this.closed = true;
        // The signalling layer will remove it's listeners
        this.signallingLayer.setChatRoom(null);
        // do not try to close if already closed.
        this.peerconnection
            && ((this.peerconnection.signalingState
                    && this.peerconnection.signalingState !== 'closed')
                || (this.peerconnection.connectionState
                    && this.peerconnection.connectionState !== 'closed'))
            && this.peerconnection.close();
    }
}
