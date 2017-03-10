/* global $, $iq, Strophe */

import { getLogger } from 'jitsi-meet-logger';
const logger = getLogger(__filename);

import JingleSession from './JingleSession';
const SDPDiffer = require('./SDPDiffer');
const SDPUtil = require('./SDPUtil');
const SDP = require('./SDP');
const async = require('async');
const XMPPEvents = require('../../service/xmpp/XMPPEvents');
const RTCBrowserType = require('../RTC/RTCBrowserType');
const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');
const Statistics = require('../statistics/statistics');

import * as JingleSessionState from './JingleSessionState';

/**
 * Constant tells how long we're going to wait for IQ response, before timeout
 * error is  triggered.
 * @type {number}
 */
const IQ_TIMEOUT = 10000;

export default class JingleSessionPC extends JingleSession {

    /**
     * Creates new <tt>JingleSessionPC</tt>
     * @param {string} sid the Jingle Session ID - random string which
     * identifies the session
     * @param {string} me our JID
     * @param {string} peerjid remote peer JID
     * @param {Strophe.Connection} connection Strophe XMPP connection instance
     * used to send packets.
     * @param mediaConstraints the media constraints object passed to
     * createOffer/Answer, as defined by the WebRTC standard
     * @param iceConfig the ICE servers config object as defined by the WebRTC
     * standard.
     * @param {object} options a set of config options
     * @param {boolean} options.webrtcIceUdpDisable <tt>true</tt> to block UDP
     * candidates.
     * @param {boolean} options.webrtcIceTcpDisable <tt>true</tt> to block TCP
     * candidates.
     * @param {boolean} options.failICE it's an option used in the tests. Set to
     * <tt>true</tt> to block any real candidates and make the ICE fail.
     *
     * @constructor
     *
     * @implements {SignalingLayer}
     */
    constructor(sid, me, peerjid, connection,
                mediaConstraints, iceConfig, options) {
        super(sid, me, peerjid, connection, mediaConstraints, iceConfig);

        this.lasticecandidate = false;
        this.closed = false;

        this.modifyingLocalStreams = false;

        /**
         * Used to keep state about muted/unmuted video streams
         *  so we can prevent errant source-add/source-removes
         *  from happening
         */
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
         * FIXME: This map got filled and never cleaned and can grow during
         * long conference
         * @type {{}} maps SSRC number to jid
         */
        this.ssrcOwners = {};

        this.webrtcIceUdpDisable = Boolean(options.webrtcIceUdpDisable);
        this.webrtcIceTcpDisable = Boolean(options.webrtcIceTcpDisable);

        /**
         * Flag used to enforce ICE failure through the URL parameter for
         * the automatic testing purpose.
         * @type {boolean}
         */
        this.failICE = Boolean(options.failICE);

        this.modificationQueue
            = async.queue(this._processQueueTasks.bind(this), 1);
    }

    doInitialize() {
        this.lasticecandidate = false;

        // True if reconnect is in progress
        this.isreconnect = false;

        // Set to true if the connection was ever stable
        this.wasstable = false;

        // Create new peer connection instance
        this.peerconnection
            = this.rtc.createPeerConnection(
                this,
                this.connection.jingle.iceConfig,

                /* Options */
                {
                    disableSimulcast: this.room.options.disableSimulcast,
                    disableRtx: this.room.options.disableRtx,
                    preferH264: this.room.options.preferH264
                });

        this.peerconnection.onicecandidate = ev => {
            if (!ev) {
                // There was an incomplete check for ev before which left
                // the last line of the function unprotected from a potential
                // throw of an exception. Consequently, it may be argued that
                // the check is unnecessary. Anyway, I'm leaving it and making
                // the check complete.
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
                        if (this.webrtcIceTcpDisable) {
                            return;
                        }
                    } else if (protocol === 'udp') {
                        if (this.webrtcIceUdpDisable) {
                            return;
                        }
                    }
                }
            }
            this.sendIceCandidate(candidate);
        };

        // Note there is a change in the spec about closed:
        // This value moved into the RTCPeerConnectionState enum in
        // the May 13, 2016 draft of the specification, as it reflects the state
        // of the RTCPeerConnection, not the signaling connection. You now
        // detect a closed connection by checking for connectionState to be
        // "closed" instead.
        // I suppose at some point this will be moved to onconnectionstatechange
        this.peerconnection.onsignalingstatechange = () => {
            if (!this.peerconnection) {
                return;
            }
            if (this.peerconnection.signalingState === 'stable') {
                this.wasstable = true;
            } else if (
                (this.peerconnection.signalingState === 'closed'
                || this.peerconnection.connectionState === 'closed')
                && !this.closed) {
                this.room.eventEmitter.emit(XMPPEvents.SUSPEND_DETECTED);
            }
        };

        /**
         * The oniceconnectionstatechange event handler contains the code to
         * execute when the iceconnectionstatechange event, of type Event,
         * is received by this RTCPeerConnection. Such an event is sent when
         * the value of RTCPeerConnection.iceConnectionState changes.
         */
        this.peerconnection.oniceconnectionstatechange = () => {
            if (!this.peerconnection) {
                return;
            }
            const now = window.performance.now();

            this.room.connectionTimes[
                    `ice.state.${this.peerconnection.iceConnectionState}`]
                = now;
            logger.log(
                `(TIME) ICE ${this.peerconnection.iceConnectionState}:\t`,
                now);
            Statistics.analytics.sendEvent(
                `ice.${this.peerconnection.iceConnectionState}`,
                { value: now });
            this.room.eventEmitter.emit(
                XMPPEvents.ICE_CONNECTION_STATE_CHANGED,
                this.peerconnection.iceConnectionState);
            switch (this.peerconnection.iceConnectionState) {
            case 'connected':
                    // Informs interested parties that the connection has been
                    // restored.
                if (this.peerconnection.signalingState === 'stable'
                            && this.isreconnect) {
                    this.room.eventEmitter.emit(
                            XMPPEvents.CONNECTION_RESTORED);
                }
                this.isreconnect = false;

                break;
            case 'disconnected':
                if (this.closed) {
                    break;
                }
                this.isreconnect = true;

                    // Informs interested parties that the connection has been
                    // interrupted.
                if (this.wasstable) {
                    this.room.eventEmitter.emit(
                            XMPPEvents.CONNECTION_INTERRUPTED);
                }
                break;
            case 'failed':
                this.room.eventEmitter.emit(
                        XMPPEvents.CONNECTION_ICE_FAILED, this.peerconnection);
                break;
            }
        };
        this.peerconnection.onnegotiationneeded = () => {
            this.room.eventEmitter.emit(XMPPEvents.PEERCONNECTION_READY, this);
        };
    }

    sendIceCandidate(candidate) {
        const localSDP = new SDP(this.peerconnection.localDescription.sdp);

        if (candidate && !this.lasticecandidate) {
            const ice
                = SDPUtil.iceparams(
                    localSDP.media[candidate.sdpMLineIndex], localSDP.session);
            const jcand = SDPUtil.candidateToJingle(candidate.candidate);

            if (!(ice && jcand)) {
                const errorMesssage = 'failed to get ice && jcand';

                GlobalOnErrorHandler.callErrorHandler(new Error(errorMesssage));
                logger.error(errorMesssage);

                return;
            }
            ice.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';

            if (this.usedrip) {
                if (this.dripContainer.length === 0) {
                    // start 20ms callout
                    setTimeout(() => {
                        if (this.dripContainer.length === 0) {
                            return;
                        }
                        this.sendIceCandidates(this.dripContainer);
                        this.dripContainer = [];
                    }, 20);
                }
                this.dripContainer.push(candidate);
            } else {
                this.sendIceCandidates([ candidate ]);
            }
        } else {
            logger.log('sendIceCandidate: last candidate.');

            // FIXME: remember to re-think in ICE-restart
            this.lasticecandidate = true;
        }
    }

    sendIceCandidates(candidates) {
        logger.log('sendIceCandidates', candidates);
        const cand = $iq({ to: this.peerjid,
            type: 'set' })
            .c('jingle', { xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-info',
                initiator: this.initiator,
                sid: this.sid });

        const localSDP = new SDP(this.peerconnection.localDescription.sdp);

        for (let mid = 0; mid < localSDP.media.length; mid++) {
            const cands = candidates.filter(el => el.sdpMLineIndex === mid);
            const mline
                = SDPUtil.parseMLine(localSDP.media[mid].split('\r\n')[0]);

            if (cands.length > 0) {
                const ice
                    = SDPUtil.iceparams(localSDP.media[mid], localSDP.session);

                ice.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';
                cand.c('content', {
                    creator: this.initiator === this.localJid
                                    ? 'initiator' : 'responder',
                    name: cands[0].sdpMid ? cands[0].sdpMid : mline.media
                }).c('transport', ice);
                for (let i = 0; i < cands.length; i++) {
                    const candidate
                        = SDPUtil.candidateToJingle(cands[i].candidate);

                    // Mangle ICE candidate if 'failICE' test option is enabled

                    if (this.failICE) {
                        candidate.ip = '1.1.1.1';
                    }
                    cand.c('candidate', candidate).up();
                }

                // add fingerprint
                const fingerprintLine
                    = SDPUtil.findLine(
                        localSDP.media[mid],
                        'a=fingerprint:', localSDP.session);

                if (fingerprintLine) {
                    const tmp = SDPUtil.parseFingerprint(fingerprintLine);

                    tmp.required = true;
                    cand.c(
                        'fingerprint',
                        { xmlns: 'urn:xmpp:jingle:apps:dtls:0' })
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
        // logger.log('was this the last candidate', this.lasticecandidate);
        this.connection.sendIQ(
            cand, null, this.newJingleErrorHandler(cand, error => {
                GlobalOnErrorHandler.callErrorHandler(
                    new Error(`Jingle error: ${JSON.stringify(error)}`));
            }), IQ_TIMEOUT);
    }

    readSsrcInfo(contents) {
        $(contents).each((i1, content) => {
            const ssrcs
                = $(content).find(
                    'description>'
                        + 'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

            ssrcs.each((i2, ssrcElement) => {
                const ssrc = ssrcElement.getAttribute('ssrc');

                $(ssrcElement)
                    .find('>ssrc-info[xmlns="http://jitsi.org/jitmeet"]')
                    .each((i3, ssrcInfoElement) => {
                        const owner = ssrcInfoElement.getAttribute('owner');

                        if (owner && owner.length) {
                            this.ssrcOwners[ssrc]
                                = Strophe.getResourceFromJid(owner);
                        }
                    }
                );
            });
        });
    }

    /**
     * Makes the underlying TraceablePeerConnection generate new SSRC for
     * the recvonly video stream.
     * @deprecated
     */
    generateRecvonlySsrc() {
        if (this.peerconnection) {
            this.peerconnection.generateRecvonlySsrc();
        } else {
            logger.error(
                'Unable to generate recvonly SSRC - no peerconnection');
        }
    }

    /**
     * Accepts incoming Jingle 'session-initiate' and should send
     * 'session-accept' in result.
     * @param jingleOffer jQuery selector pointing to the jingle element of
     *        the offer IQ
     * @param success callback called when we accept incoming session
     *        successfully and receive RESULT packet to 'session-accept' sent.
     * @param failure function(error) called if for any reason we fail to accept
     *        the incoming offer. 'error' argument can be used to log some
     *        details about the error.
     */
    acceptOffer(jingleOffer, success, failure) {
        this.state = JingleSessionState.ACTIVE;
        this.setOfferCycle(
            jingleOffer,
            () => {
                // FIXME we may not care about RESULT packet for session-accept
                // then we should either call 'success' here immediately or
                // modify sendSessionAccept method to do that
                this.sendSessionAccept(success, failure);
            },
            failure);
    }

    /**
     * This is a setRemoteDescription/setLocalDescription cycle which starts at
     * converting Strophe Jingle IQ into remote offer SDP. Once converted
     * setRemoteDescription, createAnswer and setLocalDescription calls follow.
     * @param jingleOfferIq jQuery selector pointing to the jingle element of
     *        the offer IQ
     * @param success callback called when sRD/sLD cycle finishes successfully.
     * @param failure callback called with an error object as an argument if we
     *        fail at any point during setRD, createAnswer, setLD.
     */
    setOfferCycle(jingleOfferIq, success, failure) {
        const workFunction = finishedCallback => {
            const newRemoteSdp = this._processNewJingleOfferIq(jingleOfferIq);

            this._renegotiate(newRemoteSdp)
                .then(() => {
                    finishedCallback();
                }, error => {
                    logger.error(
                        `Error renegotiating after setting new remote offer: ${
                             error}`);
                    JingleSessionPC.onJingleFatalError(this, error);
                    finishedCallback(error);
                });
        };

        this.modificationQueue.push(
            workFunction,
            error => {
                error ? failure(error) : success();
            });
    }

    /**
     * Although it states "replace transport" it does accept full Jingle offer
     * which should contain new ICE transport details.
     * @param jingleOfferElem an element Jingle IQ that contains new offer and
     *        transport info.
     * @param success callback called when we succeed to accept new offer.
     * @param failure function(error) called when we fail to accept new offer.
     */
    replaceTransport(jingleOfferElem, success, failure) {

        // We need to first set an offer without the 'data' section to have the
        // SCTP stack cleaned up. After that the original offer is set to have
        // the SCTP connection established with the new bridge.
        this.room.eventEmitter.emit(XMPPEvents.ICE_RESTARTING);
        const originalOffer = jingleOfferElem.clone();

        jingleOfferElem.find('>content[name=\'data\']').remove();

        // First set an offer without the 'data' section
        this.setOfferCycle(
            jingleOfferElem,
            () => {
                // Now set the original offer(with the 'data' section)
                this.setOfferCycle(
                    originalOffer,
                    () => {
                        const localSDP
                            = new SDP(this.peerconnection.localDescription.sdp);

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
    sendSessionAccept(success, failure) {
        // NOTE: since we're just reading from it, we don't need to be within
        //  the modification queue to access the local description
        const localSDP = new SDP(this.peerconnection.localDescription.sdp);
        let accept = $iq({ to: this.peerjid,
            type: 'set' })
            .c('jingle', { xmlns: 'urn:xmpp:jingle:1',
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
            this.initiator === this.localJid ? 'initiator' : 'responder',
            null);
        this.fixJingle(accept);

        // Calling tree() to print something useful
        accept = accept.tree();
        logger.info('Sending session-accept', accept);
        this.connection.sendIQ(accept,
            success,
            this.newJingleErrorHandler(accept, error => {
                failure(error);

                // 'session-accept' is a critical timeout and we'll
                // have to restart
                this.room.eventEmitter.emit(XMPPEvents.SESSION_ACCEPT_TIMEOUT);
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
        let transportAccept = $iq({ to: this.peerjid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-accept',
                initiator: this.initiator,
                sid: this.sid
            });

        localSDP.media.forEach((medialines, idx) => {
            const mline = SDPUtil.parseMLine(medialines.split('\r\n')[0]);

            transportAccept.c('content',
                {
                    creator:
                        this.initiator === this.localJid
                            ? 'initiator'
                            : 'responder',
                    name: mline.media
                }
            );
            localSDP.transportToJingle(idx, transportAccept);
            transportAccept.up();
        });

        // Calling tree() to print something useful to the logger
        transportAccept = transportAccept.tree();
        logger.info('Sending transport-accept: ', transportAccept);

        this.connection.sendIQ(transportAccept,
            success,
            this.newJingleErrorHandler(transportAccept, failure),
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
        let transportReject = $iq({ to: this.peerjid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'transport-reject',
                initiator: this.initiator,
                sid: this.sid
            });

        transportReject = transportReject.tree();
        logger.info('Sending \'transport-reject', transportReject);

        this.connection.sendIQ(transportReject,
            success,
            this.newJingleErrorHandler(transportReject, failure),
            IQ_TIMEOUT);
    }

    /**
     * @inheritDoc
     */
    terminate(reason, text, success, failure) {
        this.state = JingleSessionState.ENDED;

        let sessionTerminate = $iq({ to: this.peerjid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'session-terminate',
                initiator: this.initiator,
                sid: this.sid
            })
            .c('reason')
            .c(reason || 'success');

        if (text) {
            // eslint-disable-next-line newline-per-chained-call
            sessionTerminate.up().c('text').t(text);
        }

        // Calling tree() to print something useful
        sessionTerminate = sessionTerminate.tree();
        logger.info('Sending session-terminate', sessionTerminate);

        this.connection.sendIQ(
            sessionTerminate,
            success,
            this.newJingleErrorHandler(sessionTerminate, failure), IQ_TIMEOUT);

        // this should result in 'onTerminated' being called by strope.jingle.js
        this.connection.jingle.terminate(this.sid);
    }

    onTerminated(reasonCondition, reasonText) {
        this.state = 'ended';

        // Do something with reason and reasonCondition when we start to care
        // this.reasonCondition = reasonCondition;
        // this.reasonText = reasonText;
        logger.info('Session terminated', this, reasonCondition, reasonText);

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
    _parseSsrcInfoFromSourceAdd(sourceAddElem, currentRemoteSdp) {
        const addSsrcInfo = [];

        $(sourceAddElem).each((i1, content) => {
            const name = $(content).attr('name');
            let lines = '';

            $(content)
                .find('ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
                .each(function() {
                    const semantics = this.getAttribute('semantics');
                    const ssrcs
                        = $(this)
                            .find('>source')
                            .map(function() {
                                return this.getAttribute('ssrc');
                            })
                            .get();

                    if (ssrcs.length) {
                        lines
                            += `a=ssrc-group:${semantics} ${ssrcs.join(' ')
                                }\r\n`;
                    }
                });

            // handles both >source and >description>source
            const tmp
                = $(content).find(
                    'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

            tmp.each(function() {
                const ssrc = $(this).attr('ssrc');

                if (currentRemoteSdp.containsSSRC(ssrc)) {
                    logger.warn(
                        `Source-add request for existing SSRC: ${ssrc}`);

                    return;
                }

                // eslint-disable-next-line newline-per-chained-call
                $(this).find('>parameter').each(function() {
                    lines += `a=ssrc:${ssrc} ${$(this).attr('name')}`;
                    if ($(this).attr('value') && $(this).attr('value').length) {
                        lines += `:${$(this).attr('value')}`;
                    }
                    lines += '\r\n';
                });
            });
            currentRemoteSdp.media.forEach((media, i2) => {
                if (!SDPUtil.findLine(media, `a=mid:${name}`)) {
                    return;
                }
                if (!addSsrcInfo[i2]) {
                    addSsrcInfo[i2] = '';
                }
                addSsrcInfo[i2] += lines;
            });
        });

        return addSsrcInfo;
    }

    /**
     * Handles a Jingle source-add message for this Jingle session.
     * @param elem An array of Jingle "content" elements.
     */
    addRemoteStream(elem) {
        // FIXME there is not stop condition for this wait !!!
        if (!this.peerconnection.localDescription) {
            logger.warn('addSource - localDescription not ready yet');
            setTimeout(() => this.addRemoteStream(elem), 200);

            return;
        }
        logger.log('Processing add remote stream');
        logger.log(
            'ICE connection state: ', this.peerconnection.iceConnectionState);

        this.readSsrcInfo(elem);

        const workFunction = finishedCallback => {
            const sdp = new SDP(this.peerconnection.remoteDescription.sdp);
            const mySdp = new SDP(this.peerconnection.localDescription.sdp);
            const addSsrcInfo = this._parseSsrcInfoFromSourceAdd(elem, sdp);

            const newRemoteSdp = this._processRemoteAddSource(addSsrcInfo);

            this._renegotiate(newRemoteSdp)
                .then(() => {
                    logger.info('Remote source-add processed');
                    const newSdp
                        = new SDP(this.peerconnection.localDescription.sdp);

                    logger.log('SDPs', mySdp, newSdp);
                    this.notifyMySSRCUpdate(mySdp, newSdp);
                    finishedCallback();
                }, error => {
                    logger.error(
                        'Error renegotiating after processing remote'
                            + ` source-add: ${error}`);
                    finishedCallback(error);
                });
        };

        this.modificationQueue.push(workFunction);
    }

    /**
     * Handles a Jingle source-remove message for this Jingle session.
     * @param elem An array of Jingle "content" elements.
     */
    removeRemoteStream(elem) {
        // FIXME there is no stop condition for this wait !
        if (!this.peerconnection.localDescription) {
            logger.warn('removeSource - localDescription not ready yet');
            setTimeout(() => this.removeRemoteStream(elem), 200);

            return;
        }

        logger.log('Remove remote stream');
        logger.log(
            'ICE connection state: ', this.peerconnection.iceConnectionState);
        const workFunction = finishedCallback => {
            const sdp = new SDP(this.peerconnection.remoteDescription.sdp);
            const mySdp = new SDP(this.peerconnection.localDescription.sdp);
            const removeSsrcInfo
                = this._parseSsrcInfoFromSourceRemove(elem, sdp);

            const newRemoteSdp
                = this._processRemoteRemoveSource(removeSsrcInfo);

            this._renegotiate(newRemoteSdp)
                .then(() => {
                    logger.info('Remote source-remove processed');
                    const newSdp
                        = new SDP(this.peerconnection.localDescription.sdp);

                    logger.log('SDPs', mySdp, newSdp);
                    this.notifyMySSRCUpdate(mySdp, newSdp);
                    finishedCallback();
                }, error => {
                    logger.error(
                        'Error renegotiating after processing remote'
                          + ` source-remove: ${error}`);
                    finishedCallback(error);
                });
        };

        this.modificationQueue.push(workFunction);
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
    _processQueueTasks(task, finishedCallback) {
        task(finishedCallback);
    }

    /**
     * Takes in a jingle offer iq, returns the new sdp offer
     * @param {jquery xml element} offerIq the incoming offer
     * @returns {SDP object} the jingle offer translated to SDP
     */
    _processNewJingleOfferIq(offerIq) {
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
        this.readSsrcInfo($(offerIq).find('>content'));

        return remoteSdp;
    }

    /**
     * Remove the given ssrc lines from the current remote sdp
     * @param {list} removeSsrcInfo a list of SDP line strings that
     *  should be removed from the remote SDP
     * @returns type {SDP Object} the new remote SDP (after removing the lines
     *  in removeSsrcInfo
     */
    _processRemoteRemoveSource(removeSsrcInfo) {
        const remoteSdp = new SDP(this.peerconnection.remoteDescription.sdp);

        removeSsrcInfo.forEach((lines, idx) => {
            // eslint-disable-next-line no-param-reassign
            lines = lines.split('\r\n');
            lines.pop(); // remove empty last element;
            lines.forEach(line => {
                remoteSdp.media[idx]
                    = remoteSdp.media[idx].replace(`${line}\r\n`, '');
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
    _processRemoteAddSource(addSsrcInfo) {
        const remoteSdp = new SDP(this.peerconnection.remoteDescription.sdp);

        addSsrcInfo.forEach((lines, idx) => {
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
    _renegotiate(optionalRemoteSdp) {
        const mediaConstraints = this.mediaConstraints;
        const remoteSdp
            = optionalRemoteSdp
                || new SDP(this.peerconnection.remoteDescription.sdp);
        const remoteDescription = new RTCSessionDescription({
            type: 'offer',
            sdp: remoteSdp.raw
        });

        // TODO(brian): in the code below there are 2 chunks of code that relate
        //  to observing changes in local and remove ufrags.  since they
        //  just need to read and observe the SDPs, we should create the
        //  notion of an SDP observer in TraceablePeerConnection that
        //  gets notified of all SDP changes.  Code like the ufrag
        //  logic below could listen to that and be separated from
        //  core flows like this.
        return new Promise((resolve, reject) => {
            const remoteUfrag = JingleSessionPC.getUfrag(remoteDescription.sdp);

            if (remoteUfrag !== this.remoteUfrag) {
                this.remoteUfrag = remoteUfrag;
                this.room.eventEmitter.emit(
                        XMPPEvents.REMOTE_UFRAG_CHANGED, remoteUfrag);
            }

            logger.debug('Renegotiate: setting remote description');
            this.peerconnection.setRemoteDescription(
                remoteDescription,
                () => {
                    if (this.signalingState === 'closed') {
                        reject(
                            'Attempted to setRemoteDescription in state'
                                + ' closed');

                        return;
                    }
                    logger.debug('Renegotiate: creating answer');
                    this.peerconnection.createAnswer(
                        answer => {
                            const localUfrag
                                = JingleSessionPC.getUfrag(answer.sdp);

                            if (localUfrag !== this.localUfrag) {
                                this.localUfrag = localUfrag;
                                this.room.eventEmitter.emit(
                                        XMPPEvents.LOCAL_UFRAG_CHANGED,
                                        localUfrag);
                            }
                            logger.debug(
                                'Renegotiate: setting local description');
                            this.peerconnection.setLocalDescription(
                                answer,
                                () => {
                                    resolve();
                                },
                                error => {
                                    reject(
                                        `setLocalDescription failed: ${error}`);
                                }
                            );
                        },
                        error => reject(`createAnswer failed: ${error}`),
                        mediaConstraints
                    );
                },
                error => {
                    reject(`setRemoteDescription failed: ${error}`);
                }
            );
        });
    }

    /**
     * Replaces oldStream with newStream and performs a single offer/answer
     *  cycle after both operations are done.  Either oldStream or newStream
     *  can be null; replacing a valid 'oldStream' with a null 'newStream'
     *  effectively just removes 'oldStream'
     * @param {JitsiLocalTrack|null} oldTrack the current track in use to be
     * replaced
     * @param {JitsiLocalTrack|null} newTrack the new track to use
     * @returns {Promise} which resolves once the replacement is complete
     *  with no arguments or rejects with an error {string}
     */
    replaceTrack(oldTrack, newTrack) {
        return new Promise((resolve, reject) => {
            const workFunction = finishedCallback => {
                const oldSdp
                    = new SDP(this.peerconnection.localDescription.sdp);

                // NOTE the code below assumes that no more than 1 video track
                // can be added to the peer connection.
                // Transition from no video to video (possibly screen sharing)

                if (!oldTrack && newTrack && newTrack.isVideoTrack()) {
                    // Clearing current primary SSRC will make
                    // the SdpConsistency generate a new one which will result
                    // with:
                    // 1. source-remove for the recvonly
                    // 2. source-add for the new video stream
                    this.peerconnection.clearRecvonlySsrc();

                // Transition from video to no video
                } else if (oldTrack && oldTrack.isVideoTrack() && !newTrack) {
                    // Clearing current primary SSRC and generating the recvonly
                    // will result in:
                    // 1. source-remove for the old video stream
                    // 2. source-add for the recvonly stream
                    this.peerconnection.clearRecvonlySsrc();
                    this.peerconnection.generateRecvonlySsrc();
                }
                this.removeStreamFromPeerConnection(oldTrack);
                this.addStreamToPeerConnection(newTrack);
                this._renegotiate()
                    .then(() => {
                        const newSdp
                            = new SDP(this.peerconnection.localDescription.sdp);

                        this.notifyMySSRCUpdate(oldSdp, newSdp);
                        finishedCallback();
                    }, error => {
                        logger.error(
                            `replaceTrack renegotiation failed: ${error}`);
                        finishedCallback(error);
                    });
            };

            this.modificationQueue.push(
                workFunction,
                error => {
                    error ? reject(error) : resolve();
                });
        });
    }

    /**
     * Just add the stream to the peerconnection
     * @param stream either the low-level webrtc MediaStream or
     *  a Jitsi mediastream
     * NOTE: must be called within a work function being executed
     *  by the modification queue.
     */
    addStreamToPeerConnection(stream, ssrcInfo) {
        const actualStream
            = stream && stream.getOriginalStream
                ? stream.getOriginalStream() : stream;

        if (this.peerconnection) {
            this.peerconnection.addStream(actualStream, ssrcInfo);
        }
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
    _parseSsrcInfoFromSourceRemove(sourceRemoveElem, currentRemoteSdp) {
        const removeSsrcInfo = [];

        $(sourceRemoveElem).each((i1, content) => {
            const name = $(content).attr('name');
            let lines = '';

            $(content)
                .find('ssrc-group[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]')
                .each(function() {
                    const semantics = this.getAttribute('semantics');
                    const ssrcs
                        = $(this)
                            .find('>source')
                            .map(function() {
                                return this.getAttribute('ssrc');
                            })
                            .get();

                    if (ssrcs.length) {
                        lines
                            += `a=ssrc-group:${semantics} ${ssrcs.join(' ')
                                }\r\n`;
                    }
                });
            const ssrcs = [];

            // handles both >source and >description>source versions
            const tmp
                = $(content).find(
                    'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

            tmp.each(function() {
                const ssrc = $(this).attr('ssrc');

                ssrcs.push(ssrc);
            });
            currentRemoteSdp.media.forEach((media, i2) => {
                if (!SDPUtil.findLine(media, `a=mid:${name}`)) {
                    return;
                }
                if (!removeSsrcInfo[i2]) {
                    removeSsrcInfo[i2] = '';
                }
                ssrcs.forEach(ssrc => {
                    const ssrcLines
                        = SDPUtil.findLines(media, `a=ssrc:${ssrc}`);

                    if (ssrcLines.length) {
                        removeSsrcInfo[i2] += `${ssrcLines.join('\r\n')}\r\n`;
                    }
                });
                removeSsrcInfo[i2] += lines;
            });
        });

        return removeSsrcInfo;
    }

    /**
     * Adds stream.
     * @param stream new stream that will be added.
     * @param callback callback executed after successful stream addition.
     * @param errorCallback callback executed if stream addition fail.
     * @param ssrcInfo object with information about the SSRCs associated with
     *        the stream.
     * @param dontModifySources {boolean} if true _modifySources won't be
     *        called.
     * Used for streams added before the call start.
     * NOTE(brian): there is a decent amount of overlap here with replaceTrack
     *  that could be re-used...however we can't leverage that currently because
     *  the extra work we do here must be in the work function context and if we
     *  then called replaceTrack we'd be adding another task on the queue
     *  from within a task which would then deadlock.  The 'replaceTrack' core
     *  logic should be moved into a helper function that could be called within
     *  the 'doReplaceStream' task or the 'doAddStream' task (for example)
     */
    addStream(stream, callback, errorCallback, ssrcInfo, dontModifySources) {

        const workFunction = finishedCallback => {
            if (!this.peerconnection) {
                finishedCallback(
                    'Error: tried adding stream with no active peer'
                        + ' connection');

                return;
            }
            this.addStreamToPeerConnection(stream, ssrcInfo);

            if (ssrcInfo) {
                // available only on video mute/unmute
                this.modifiedSSRCs[ssrcInfo.type]
                    = this.modifiedSSRCs[ssrcInfo.type] || [];
                this.modifiedSSRCs[ssrcInfo.type].push(ssrcInfo);
            }
            if (dontModifySources) {
                finishedCallback();

                return;
            }
            const oldSdp = new SDP(this.peerconnection.localDescription.sdp);

            this._renegotiate()
                .then(() => {
                    const newSdp
                        = new SDP(this.peerconnection.localDescription.sdp);

                    // FIXME objects should not be logged

                    logger.log('SDPs', oldSdp, newSdp);
                    this.notifyMySSRCUpdate(oldSdp, newSdp);
                    finishedCallback();
                }, error => {
                    finishedCallback(error);
                });
        };

        this.modificationQueue.push(
            workFunction,
            error => {
                error ? errorCallback(error) : callback();
            });
    }

    /**
     * Generate ssrc info object for a stream with the following properties:
     * - ssrcs - Array of the ssrcs associated with the stream.
     * - groups - Array of the groups associated with the stream.
     */
    generateNewStreamSSRCInfo() {
        return this.peerconnection.generateNewStreamSSRCInfo();
    }

    /**
     * Remove stream handling for firefox
     * @param stream: webrtc media stream
     */
    _handleFirefoxRemoveStream(stream) {
        if (!stream) { // There is nothing to be changed
            return;
        }
        let sender = null;

        // On Firefox we don't replace MediaStreams as this messes up the
        // m-lines (which can't be removed in Plan Unified) and brings a lot
        // of complications. Instead, we use the RTPSender and remove just
        // the track.
        let track = null;

        if (stream.getAudioTracks() && stream.getAudioTracks().length) {
            track = stream.getAudioTracks()[0];
        } else if (stream.getVideoTracks() && stream.getVideoTracks().length) {
            track = stream.getVideoTracks()[0];
        }

        if (!track) {
            const msg = 'Cannot remove tracks: no tracks.';

            logger.log(msg);

            return;
        }

        // Find the right sender (for audio or video)
        this.peerconnection.peerconnection.getSenders().some(s => {
            if (s.track === track) {
                sender = s;

                return true;
            }

            return false;
        });

        if (sender) {
            this.peerconnection.peerconnection.removeTrack(sender);
        } else {
            logger.log('Cannot remove tracks: no RTPSender.');
        }
    }

    /**
     * Just remove the stream from the peerconnection
     * @param {JitsiLocalTrack|MediaStream} stream the stream to remove
     * NOTE: must be called within a work function being executed
     *  by the modification queue.
     */
    removeStreamFromPeerConnection(stream) {
        const actualStream
            = stream && stream.getOriginalStream
                ? stream.getOriginalStream() : stream;

        if (!this.peerconnection) {
            return;
        }
        if (RTCBrowserType.getBrowserType()
                === RTCBrowserType.RTC_BROWSER_FIREFOX) {
            this._handleFirefoxRemoveStream(actualStream);
        } else if (actualStream) {
            this.peerconnection.removeStream(actualStream);
        }
    }

    /**
     * Remove streams.
     * @param stream stream that will be removed.
     * @param callback callback executed after successful stream addition.
     * @param errorCallback callback executed if stream addition fail.
     * @param ssrcInfo object with information about the SSRCs associated with
     *        the stream.
     */
    removeStream(stream, callback, errorCallback, ssrcInfo) {
        const workFunction = finishedCallback => {
            if (!this.peerconnection) {
                finishedCallback();

                return;
            }
            if (RTCBrowserType.getBrowserType()
                    === RTCBrowserType.RTC_BROWSER_FIREFOX) {
                this._handleFirefoxRemoveStream(stream);
            } else if (stream) {
                this.removeStreamFromPeerConnection(stream);
            }
            const oldSdp = new SDP(this.peerconnection.localDescription.sdp);

            this._renegotiate()
                .then(() => {
                    const newSdp
                        = new SDP(this.peerconnection.localDescription.sdp);

                    if (ssrcInfo) {
                        this.modifiedSSRCs[ssrcInfo.type]
                            = this.modifiedSSRCs[ssrcInfo.type] || [];
                        this.modifiedSSRCs[ssrcInfo.type].push(ssrcInfo);
                    }
                    logger.log('SDPs', oldSdp, newSdp);
                    this.notifyMySSRCUpdate(oldSdp, newSdp);
                    finishedCallback();
                }, error => {
                    finishedCallback(error);
                });
        };

        this.modificationQueue.push(
            workFunction,
            error => {
                error ? errorCallback(error) : callback();
            });
    }

    /**
     * Figures out added/removed ssrcs and send update IQs.
     * @param oldSDP SDP object for old description.
     * @param newSDP SDP object for new description.
     */
    notifyMySSRCUpdate(oldSDP, newSDP) {

        if (this.state !== JingleSessionState.ACTIVE) {
            logger.warn(`Skipping SSRC update in '${this.state} ' state.`);

            return;
        }

        // send source-remove IQ.
        let sdpDiffer = new SDPDiffer(newSDP, oldSDP);
        const remove = $iq({ to: this.peerjid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'source-remove',
                initiator: this.initiator,
                sid: this.sid
            }
            );

        sdpDiffer.toJingle(remove);
        const removed = this.fixJingle(remove);

        if (removed && remove) {
            logger.info('Sending source-remove', remove.tree());
            this.connection.sendIQ(
                remove, null,
                this.newJingleErrorHandler(remove, error => {
                    GlobalOnErrorHandler.callErrorHandler(
                        new Error(`Jingle error: ${JSON.stringify(error)}`));
                }), IQ_TIMEOUT);
        } else {
            logger.log('removal not necessary');
        }

        // send source-add IQ.
        sdpDiffer = new SDPDiffer(oldSDP, newSDP);
        const add = $iq({ to: this.peerjid,
            type: 'set' })
            .c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'source-add',
                initiator: this.initiator,
                sid: this.sid
            }
            );

        sdpDiffer.toJingle(add);
        const added = this.fixJingle(add);

        if (added && add) {
            logger.info('Sending source-add', add.tree());
            this.connection.sendIQ(
                add, null, this.newJingleErrorHandler(add, error => {
                    GlobalOnErrorHandler.callErrorHandler(
                        new Error(`Jingle error: ${JSON.stringify(error)}`));
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
    newJingleErrorHandler(request, failureCb) {
        return function(errResponse) {

            const error = {};

            // Get XMPP error code and condition(reason)
            const errorElSel = $(errResponse).find('error');

            if (errorElSel.length) {
                error.code = errorElSel.attr('code');
                const errorReasonSel = $(errResponse).find('error :first');

                if (errorReasonSel.length) {
                    error.reason = errorReasonSel[0].tagName;
                }
            }

            if (!errResponse) {
                error.reason = 'timeout';
            }

            error.source = null;
            if (request && typeof request.tree === 'function') {
                error.source = request.tree();
            }

            // Commented to fix JSON.stringify(error) exception for circular
            // dependancies when we print that error.
            // FIXME: Maybe we can include part of the session object
            // error.session = this;

            logger.error('Jingle error', error);
            if (failureCb) {
                failureCb(error);
            }
        };
    }

    static onJingleFatalError(session, error) {
        if (this.room) {
            this.room.eventEmitter.emit(
                XMPPEvents.CONFERENCE_SETUP_FAILED, error);
            this.room.eventEmitter.emit(
                XMPPEvents.JINGLE_FATAL_ERROR, session, error);
        }
    }

    /**
     * @inheritDoc
     */
    getPeerMediaInfo(owner, mediaType) {
        return this.room.getMediaPresenceInfo(owner, mediaType);
    }

    /**
     * @inheritDoc
     */
    getSSRCOwner(ssrc) {
        return this.ssrcOwners[ssrc];
    }

    /**
     * Returns the ice connection state for the peer connection.
     * @returns the ice connection state for the peer connection.
     */
    getIceConnectionState() {
        return this.peerconnection.iceConnectionState;
    }

    /**
     * Closes the peerconnection.
     */
    close() {
        this.closed = true;

        // do not try to close if already closed.
        this.peerconnection
            && ((this.peerconnection.signalingState
                    && this.peerconnection.signalingState !== 'closed')
                || (this.peerconnection.connectionState
                    && this.peerconnection.connectionState !== 'closed'))
            && this.peerconnection.close();
    }


    /**
     * Fixes the outgoing jingle packets by removing the nodes related to the
     * muted/unmuted streams, handles removing of muted stream, etc.
     * @param jingle the jingle packet that is going to be sent
     * @returns {boolean} true if the jingle has to be sent and false otherwise.
     */
    fixJingle(jingle) {
        // eslint-disable-next-line newline-per-chained-call
        const action = $(jingle.nodeTree).find('jingle').attr('action');

        switch (action) {
        case 'source-add':
        case 'session-accept':
            this.fixSourceAddJingle(jingle);
            break;
        case 'source-remove':
            this.fixSourceRemoveJingle(jingle);
            break;
        default: {
            const errmsg = 'Unknown jingle action!';

            GlobalOnErrorHandler.callErrorHandler(errmsg);
            logger.error(errmsg);

            return false;
        }
        }

        const sources
            = $(jingle.tree()).find('>jingle>content>description>source');


        return sources && sources.length > 0;
    }

    /**
     * Fixes the outgoing jingle packets with action source-add by removing the
     * nodes related to the unmuted streams
     * @param jingle the jingle packet that is going to be sent
     * @returns {boolean} true if the jingle has to be sent and false otherwise.
     */
    fixSourceAddJingle(jingle) {
        let ssrcs = this.modifiedSSRCs.unmute;

        this.modifiedSSRCs.unmute = [];
        if (ssrcs && ssrcs.length) {
            ssrcs.forEach(ssrcObj => {
                const desc
                    = $(jingle.tree()).find(
                        `>jingle>content[name="${ssrcObj.mtype}"]>description`);

                if (!desc || !desc.length) {
                    return;
                }
                ssrcObj.ssrcs.forEach(ssrc => {
                    const sourceNode = desc.find(`>source[ssrc="${ssrc}"]`);

                    sourceNode.remove();
                });
                ssrcObj.groups.forEach(group => {
                    const groupNode = desc.find(`>ssrc-group[semantics="${
                         group.semantics}"]:has(source[ssrc="${
                         group.ssrcs[0]}"])`);

                    groupNode.remove();
                });
            });
        }

        ssrcs = this.modifiedSSRCs.addMuted;
        this.modifiedSSRCs.addMuted = [];
        if (ssrcs && ssrcs.length) {
            ssrcs.forEach(ssrcObj => {
                const desc
                    = JingleSessionPC.createDescriptionNode(
                        jingle, ssrcObj.mtype);

                // eslint-disable-next-line newline-per-chained-call
                const cname = Math.random().toString(36).substring(2);

                ssrcObj.ssrcs.forEach(ssrc => {
                    const sourceNode
                        = desc.find(`>source[ssrc="${ssrc}"]`);

                    sourceNode.remove();
                    const sourceXML
                        = '<source xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"'
                        + ` ssrc="${ssrc}">`
                        + '<parameter xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"'
                        + ` value="${ssrcObj.msid}" name="msid"/>`
                        + '<parameter xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"'
                        + ` value="${cname}" name="cname" />`
                        + '</source>';

                    desc.append(sourceXML);
                });
                ssrcObj.groups.forEach(group => {
                    const groupNode
                        = desc.find(
                            `>ssrc-group[semantics="${group.semantics
                                }"]:has(source[ssrc="${group.ssrcs[0]}"])`);

                    groupNode.remove();
                    desc.append(
                        `<ssrc-group semantics="${group.semantics
                            }" xmlns="urn:xmpp:jingle:apps:rtp:ssma:0">`
                        + `<source ssrc="${group.ssrcs.join('"/><source ssrc="')
                            }"/></ssrc-group>`);
                });
            });
        }
    }

    /**
     * Fixes the outgoing jingle packets with action source-remove by removing
     * the nodes related to the muted streams, handles removing of muted stream
     * @param jingle the jingle packet that is going to be sent
     * @returns {boolean} true if the jingle has to be sent and false otherwise.
     */
    fixSourceRemoveJingle(jingle) {
        let ssrcs = this.modifiedSSRCs.mute;

        this.modifiedSSRCs.mute = [];
        if (ssrcs && ssrcs.length) {
            ssrcs.forEach(ssrcObj => {
                ssrcObj.ssrcs.forEach(ssrc => {
                    const sourceNode
                        = $(jingle.tree()).find(
                            `>jingle>content[name="${ssrcObj.mtype
                                }"]>description>source[ssrc="${ssrc}"]`);

                    sourceNode.remove();
                });
                ssrcObj.groups.forEach(group => {
                    const groupNode
                        = $(jingle.tree()).find(
                            `>jingle>content[name="${ssrcObj.mtype
                                }"]>description>ssrc-group[semantics="${
                                group.semantics}"]:has(source[ssrc="${
                                group.ssrcs[0]}"])`);

                    groupNode.remove();
                });
            });
        }

        ssrcs = this.modifiedSSRCs.remove;
        this.modifiedSSRCs.remove = [];
        if (ssrcs && ssrcs.length) {
            ssrcs.forEach(ssrcObj => {
                const desc
                    = JingleSessionPC.createDescriptionNode(
                        jingle, ssrcObj.mtype);

                ssrcObj.ssrcs.forEach(ssrc => {
                    const sourceNode
                        = desc.find(`>source[ssrc="${ssrc}"]`);

                    if (!sourceNode || !sourceNode.length) {
                        // Maybe we have to include cname, msid, etc here?
                        desc.append(
                            '<source xmlns="urn:xmpp:jingle:apps:rtp:ssma:0" '
                                + `ssrc="${ssrc}"></source>`);
                    }
                });
                ssrcObj.groups.forEach(group => {
                    const groupNode
                        = desc.find(`>ssrc-group[semantics="${
                             group.semantics}"]:has(source[ssrc="${
                             group.ssrcs[0]}"])`);

                    if (!groupNode || !groupNode.length) {
                        desc.append(
                            `<ssrc-group semantics="${group.semantics
                                }" xmlns="urn:xmpp:jingle:apps:rtp:ssma:0">`
                            + `<source ssrc="${
                                group.ssrcs.join('"/><source ssrc="')}"/>`
                            + '</ssrc-group>');
                    }
                });
            });
        }
    }

    /**
     * Returns the description node related to the passed content type. If the
     * node doesn't exists it will be created.
     * @param jingle - the jingle packet
     * @param mtype - the content type(audio, video, etc.)
     */
    static createDescriptionNode(jingle, mtype) {
        let content = $(jingle.tree()).find(`>jingle>content[name="${mtype}"]`);

        if (!content || !content.length) {
            $(jingle.tree())
                .find('>jingle')
                .append(`<content name="${mtype}"></content>`);
            content = $(jingle.tree()).find(`>jingle>content[name="${mtype}"]`);
        }

        let desc = content.find('>description');

        if (!desc || !desc.length) {
            content.append(
                `<description xmlns="urn:xmpp:jingle:apps:rtp:1" media="${
                    mtype}"></description>`);
            desc = content.find('>description');
        }

        return desc;
    }

    /**
     * Extracts the ice username fragment from an SDP string.
     */
    static getUfrag(sdp) {
        const ufragLines
            = sdp.split('\n').filter(line => line.startsWith('a=ice-ufrag:'));

        if (ufragLines.length > 0) {
            return ufragLines[0].substr('a=ice-ufrag:'.length);
        }
    }
}
