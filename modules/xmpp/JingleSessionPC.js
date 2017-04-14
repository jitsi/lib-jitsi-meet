/* global __filename, $, $iq, Strophe */

import async from 'async';
import { getLogger } from 'jitsi-meet-logger';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import JingleSession from './JingleSession';
import SDP from './SDP';
import SDPDiffer from './SDPDiffer';
import SDPUtil from './SDPUtil';
import SignalingLayerImpl from './SignalingLayerImpl';
import Statistics from '../statistics/statistics';
import XMPPEvents from '../../service/xmpp/XMPPEvents';
import * as JingleSessionState from './JingleSessionState';

const logger = getLogger(__filename);

/**
 * Constant tells how long we're going to wait for IQ response, before timeout
 * error is  triggered.
 * @type {number}
 */
const IQ_TIMEOUT = 10000;

/**
 *
 */
export default class JingleSessionPC extends JingleSession {

    /* eslint-disable max-params */

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
     *
     * @constructor
     *
     * @implements {SignalingLayer}
     */
    constructor(
            sid,
            me,
            peerjid,
            connection,
            mediaConstraints,
            iceConfig,
            isP2P,
            isInitiator,
            options) {
        super(sid, me, peerjid, connection, mediaConstraints, iceConfig);

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
         * Stores a state for
         * {@link TraceablePeerConnection.mediaTransferActive} until
         * {@link JingleSessionPC.peerconnection} is initialised and capable of
         * handling the value.
         * @type {boolean}
         * @private
         */
        this.mediaTransferActive = true;

        /**
         * The signaling layer implementation.
         * @type {SignalingLayerImpl}
         */
        this.signalingLayer = new SignalingLayerImpl();

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

        /**
         * This is the MUC JID which will be used to add "owner" extension to
         * each of the local SSRCs signaled over Jingle.
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
     * Checks whether or not this session instance has been ended and eventually
     * logs a message which mentions that given <tt>actionName</tt> was
     * cancelled.
     * @param {string} actionName
     * @return {boolean} <tt>true</tt> if this {@link JingleSessionPC} has
     * entered {@link JingleSessionState.ENDED} or <tt>false</tt> otherwise.
     * @private
     */
    _assertNotEnded(actionName) {
        if (this.state === JingleSessionState.ENDED) {
            logger.log(
                `The session has ended - cancelling action: ${actionName}`);

            return false;
        }

        return true;
    }

    /**
     * Finds all "source" elements under RTC "description" in given Jingle IQ
     * and adds 'ssrc-info' with the owner attribute set to
     * {@link ssrcOwnerJid}.
     * @param jingleIq the IQ to be modified
     * @private
     */
    _markAsSSRCOwner(jingleIq) {
        $(jingleIq).find('description source')
                   .append(
                        '<ssrc-info xmlns="http://jitsi.org/jitmeet" '
                            + `owner="${this.ssrcOwnerJid}"></ssrc-info>`);
    }

    /**
     * Sets the JID which will be as an owner value for the local SSRCs
     * signaled over Jingle. Should be our MUC JID.
     * @param {string} ownerJid
     */
    setSSRCOwnerJid(ownerJid) {
        this.ssrcOwnerJid = ownerJid;
    }


    /* eslint-enable max-params */

    /**
     *
     */
    doInitialize() {
        this.lasticecandidate = false;

        // True if reconnect is in progress
        this.isreconnect = false;

        // Set to true if the connection was ever stable
        this.wasstable = false;

        // Create new peer connection instance
        this.peerconnection
            = this.rtc.createPeerConnection(
                this.signalingLayer,
                this.iceConfig,
                this.isP2P,
                {
                    disableSimulcast: this.room.options.disableSimulcast,
                    disableRtx: this.room.options.disableRtx,
                    preferH264: this.room.options.preferH264
                });

        this.peerconnection.setMediaTransferActive(this.mediaTransferActive);

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
                this.room.eventEmitter.emit(XMPPEvents.SUSPEND_DETECTED, this);
            }
        };

        /**
         * The oniceconnectionstatechange event handler contains the code to
         * execute when the iceconnectionstatechange event, of type Event,
         * is received by this RTCPeerConnection. Such an event is sent when
         * the value of RTCPeerConnection.iceConnectionState changes.
         */
        this.peerconnection.oniceconnectionstatechange = () => {
            if (!this.peerconnection
                    || !this._assertNotEnded('oniceconnectionstatechange')) {
                return;
            }
            const now = window.performance.now();

            if (!this.isP2P) {
                this.room.connectionTimes[
                    `ice.state.${this.peerconnection.iceConnectionState}`]
                    = now;
            }
            logger.log(
                `(TIME) ICE ${this.peerconnection.iceConnectionState}`
                    + ` P2P? ${this.isP2P}:\t`,
                now);
            Statistics.analytics.sendEvent(
                `${this.isP2P ? 'p2p.ice.' : 'ice.'}`
                    + `${this.peerconnection.iceConnectionState}`,
                { value: now });
            this.room.eventEmitter.emit(
                XMPPEvents.ICE_CONNECTION_STATE_CHANGED,
                this,
                this.peerconnection.iceConnectionState);
            switch (this.peerconnection.iceConnectionState) {
            case 'connected':
                // Informs interested parties that the connection has been
                // restored.
                if (this.peerconnection.signalingState === 'stable') {
                    if (this.isreconnect) {
                        this.room.eventEmitter.emit(
                            XMPPEvents.CONNECTION_RESTORED, this);
                    } else if (!this.wasConnected) {
                        this.room.eventEmitter.emit(
                            XMPPEvents.CONNECTION_ESTABLISHED, this);
                    }
                    this.wasConnected = true;
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
                        XMPPEvents.CONNECTION_INTERRUPTED, this);
                }
                break;
            case 'failed':
                this.room.eventEmitter.emit(
                    XMPPEvents.CONNECTION_ICE_FAILED, this);
                this.room.eventEmitter.emit(
                    XMPPEvents.CONFERENCE_SETUP_FAILED,
                    this,
                    new Error('ICE fail'));
                break;
            }
        };
        this.peerconnection.onnegotiationneeded = () => {
            this.room.eventEmitter.emit(XMPPEvents.PEERCONNECTION_READY, this);
        };

        // The signaling layer will bind it's listeners at this point
        this.signalingLayer.setChatRoom(this.room);
    }

    /**
     * Sends given candidate in Jingle 'transport-info' message.
     * @param {RTCIceCandidate} candidate the WebRTC ICE candidate instance
     * @private
     */
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

    /**
     * Sends given candidates in Jingle 'transport-info' message.
     * @param {Array<RTCIceCandidate>} candidates an array of the WebRTC ICE
     * candidate instances
     * @private
     */
    sendIceCandidates(candidates) {
        if (!this._assertNotEnded('sendIceCandidates')) {

            return;
        }

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

    /**
     * {@inheritDoc}
     */
    addIceCandidates(elem) {
        if (this.peerconnection.signalingState === 'closed') {
            logger.warn('Ignored add ICE candidate when in closed state');

            return;
        }

        const iceCandidates = [];

        elem.find('>content>transport>candidate')
            .each((idx, candidate) => {
                let line = SDPUtil.candidateFromJingle(candidate);

                line = line.replace('\r\n', '').replace('a=', '');

                // FIXME this code does not care to handle
                // non-bundle transport
                const rtcCandidate = new RTCIceCandidate({
                    sdpMLineIndex: 0,

                    // FF comes up with more complex names like audio-23423,
                    // Given that it works on both Chrome and FF without
                    // providing it, let's leave it like this for the time
                    // being...
                    // sdpMid: 'audio',
                    candidate: line
                });

                iceCandidates.push(rtcCandidate);
            });

        if (!iceCandidates.length) {
            logger.error(
                'No ICE candidates to add ?', elem[0] && elem[0].outerHTML);

            return;
        }

        // We want to have this task queued, so that we know it is executed,
        // after the initial sRD/sLD offer/answer cycle was done (based on
        // the assumption that candidates are spawned after the offer/answer
        // and XMPP preserves order).
        const workFunction = finishedCallback => {
            for (const iceCandidate of iceCandidates) {
                this.peerconnection.addIceCandidate(
                    iceCandidate,
                    () => {
                        logger.debug('addIceCandidate ok!');
                    },
                    error => {
                        logger.error('addIceCandidate failed!', error);
                    });
            }

            finishedCallback();
        };

        logger.debug(
            `Queued add (${iceCandidates.length}) ICE candidates task...`);
        this.modificationQueue.push(workFunction);
    }

    /**
     *
     * @param contents
     */
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
                            this.signalingLayer.setSSRCOwner(
                                ssrc, Strophe.getResourceFromJid(owner));
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

    /* eslint-disable max-params */
    /**
     * Accepts incoming Jingle 'session-initiate' and should send
     * 'session-accept' in result.
     * @param jingleOffer jQuery selector pointing to the jingle element of
     * the offer IQ
     * @param success callback called when we accept incoming session
     * successfully and receive RESULT packet to 'session-accept' sent.
     * @param failure function(error) called if for any reason we fail to accept
     * the incoming offer. 'error' argument can be used to log some details
     * about the error.
     * @param {Array<JitsiLocalTrack>} [localTracks] the optional list of
     * the local tracks that will be added, before the offer/answer cycle
     * executes. We allow the localTracks to optionally be passed in so that
     * the addition of the local tracks and the processing of the initial offer
     * can all be done atomically. We want to make sure that any other
     * operations which originate in the XMPP Jingle messages related with
     * this session to be executed with an assumption that the initial
     * offer/answer cycle has been executed already.
     */
    acceptOffer(jingleOffer, success, failure, localTracks) {
        this.setOfferAnswerCycle(
            jingleOffer,
            () => {
                this.state = JingleSessionState.ACTIVE;

                // FIXME we may not care about RESULT packet for session-accept
                // then we should either call 'success' here immediately or
                // modify sendSessionAccept method to do that
                this.sendSessionAccept(success, failure);
            },
            failure,
            localTracks);
    }

    /* eslint-enable max-params */

    /**
     * Creates an offer and sends Jingle 'session-initiate' to the remote peer.
     * @param {Array<JitsiLocalTrack>} localTracks the local tracks that will be
     * added, before the offer/answer cycle executes (for the local track
     * addition to be an atomic operation together with the offer/answer).
     */
    invite(localTracks) {
        if (!this.isInitiator) {
            throw new Error('Trying to invite from the responder session');
        }
        for (const localTrack of localTracks) {
            this.peerconnection.addTrack(localTrack);
        }
        this.peerconnection.createOffer(
            this.sendSessionInitiate.bind(this),
            error => logger.error('Failed to create offer', error),
            this.mediaConstraints);
    }

    /**
     * Sends 'session-initiate' to the remote peer.
     * @param {object} sdp the local session description object as defined by
     * the WebRTC standard.
     * @private
     */
    sendSessionInitiate(sdp) {
        logger.log('createdOffer', sdp);
        const sendJingle = () => {
            let init = $iq({
                to: this.peerjid,
                type: 'set'
            }).c('jingle', {
                xmlns: 'urn:xmpp:jingle:1',
                action: 'session-initiate',
                initiator: this.initiator,
                sid: this.sid
            });
            const localSDP = new SDP(this.peerconnection.localDescription.sdp);

            localSDP.toJingle(
                init,
                this.initiator === this.me ? 'initiator' : 'responder');
            init = init.tree();
            this._markAsSSRCOwner(init);
            logger.info('Session-initiate: ', init);
            this.connection.sendIQ(init,
                () => {
                    logger.info('Got RESULT for "session-initiate"');
                },
                error => {
                    logger.error('"session-initiate" error', error);
                },
                IQ_TIMEOUT);
        };

        this.peerconnection.setLocalDescription(
            sdp, sendJingle,
            error => {
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
            throw new Error('Trying to set an answer on the responder session');
        }
        this.setOfferAnswerCycle(
            jingleAnswer,
            () => {
                this.state = JingleSessionState.ACTIVE;
                logger.info('setAnswer - succeeded');
            },
            error => {
                logger.error('setAnswer failed: ', error);
            });
    }

    /* eslint-disable max-params */
    /**
     * This is a setRemoteDescription/setLocalDescription cycle which starts at
     * converting Strophe Jingle IQ into remote offer SDP. Once converted
     * setRemoteDescription, createAnswer and setLocalDescription calls follow.
     * @param jingleOfferAnswerIq jQuery selector pointing to the jingle element
     *        of the offer (or answer) IQ
     * @param success callback called when sRD/sLD cycle finishes successfully.
     * @param failure callback called with an error object as an argument if we
     *        fail at any point during setRD, createAnswer, setLD.
     * @param {Array<JitsiLocalTrack>} [localTracks] the optional list of
     * the local tracks that will be added, before the offer/answer cycle
     * executes (for the local track addition to be an atomic operation together
     * with the offer/answer).
     */
    setOfferAnswerCycle(jingleOfferAnswerIq, success, failure, localTracks) {
        const workFunction = finishedCallback => {

            if (localTracks) {
                for (const track of localTracks) {
                    this.peerconnection.addTrack(track);
                }
            }

            const newRemoteSdp
                = this._processNewJingleOfferIq(jingleOfferAnswerIq);

            this._renegotiate(newRemoteSdp)
                .then(() => {
                    finishedCallback();
                }, error => {
                    logger.error(
                        `Error renegotiating after setting new remote ${
                            (this.isInitiator ? 'answer: ' : 'offer: ')
                            }${error}`, newRemoteSdp);
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

    /* eslint-enable max-params */

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
        this.room.eventEmitter.emit(XMPPEvents.ICE_RESTARTING, this);
        const originalOffer = jingleOfferElem.clone();

        jingleOfferElem.find('>content[name=\'data\']').remove();

        // First set an offer without the 'data' section
        this.setOfferAnswerCycle(
            jingleOfferElem,
            () => {
                // Now set the original offer(with the 'data' section)
                this.setOfferAnswerCycle(
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
     * @private
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

        // Calling tree() to print something useful
        accept = accept.tree();
        this._markAsSSRCOwner(accept);
        logger.info('Sending session-accept', accept);
        this.connection.sendIQ(accept,
            success,
            this.newJingleErrorHandler(accept, error => {
                failure(error);

                // 'session-accept' is a critical timeout and we'll
                // have to restart
                this.room.eventEmitter.emit(
                    XMPPEvents.SESSION_ACCEPT_TIMEOUT, this);
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
     * @private
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
     *
     * FIXME method should be marked as private, but there's some spaghetti that
     *       needs to be fixed prior doing that
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

    /* eslint-disable max-params */

    /**
     * @inheritDoc
     */
    terminate(reason, text, success, failure) {
        let sessionTerminate = $iq({
            to: this.peerjid,
            type: 'set'
        })
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

    /* eslint-enable max-params */

    /**
     *
     * @param reasonCondition
     * @param reasonText
     */
    onTerminated(reasonCondition, reasonText) {
        this.state = JingleSessionState.ENDED;

        // Do something with reason and reasonCondition when we start to care
        // this.reasonCondition = reasonCondition;
        // this.reasonText = reasonText;
        logger.info(`Session terminated ${this}`, reasonCondition, reasonText);

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
                    // eslint-disable-next-line no-invalid-this
                    const semantics = this.getAttribute('semantics');
                    const ssrcs
                        = $(this) // eslint-disable-line no-invalid-this
                            .find('>source')
                            .map(function() {
                                // eslint-disable-next-line no-invalid-this
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

            /* eslint-disable no-invalid-this */
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

            /* eslint-enable no-invalid-this */
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
        this._addOrRemoveRemoteStream(true /* add */, elem);
    }

    /**
     * Handles a Jingle source-remove message for this Jingle session.
     * @param elem An array of Jingle "content" elements.
     */
    removeRemoteStream(elem) {
        this._addOrRemoveRemoteStream(false /* remove */, elem);
    }

    /**
     * Handles either Jingle 'source-add' or 'source-remove' message for this
     * Jingle session.
     * @param {boolean} isAdd <tt>true</tt> for 'source-add' or <tt>false</tt>
     * otherwise.
     * @param {Array<Element>} elem an array of Jingle "content" elements.
     * @private
     */
    _addOrRemoveRemoteStream(isAdd, elem) {
        const logPrefix = isAdd ? 'addRemoteStream' : 'removeRemoteStream';

        if (isAdd) {
            this.readSsrcInfo(elem);
        }

        const workFunction = finishedCallback => {
            if (!this.peerconnection.localDescription
                || !this.peerconnection.localDescription.sdp) {
                const errMsg = `${logPrefix} - localDescription not ready yet`;

                logger.error(errMsg);
                finishedCallback(errMsg);

                return;
            }

            logger.log(`Processing ${logPrefix}`);
            logger.log(
                'ICE connection state: ',
                this.peerconnection.iceConnectionState);

            const oldLocalSdp
                = new SDP(this.peerconnection.localDescription.sdp);
            const sdp = new SDP(this.peerconnection.remoteDescription.sdp);
            const addOrRemoveSsrcInfo
                = isAdd
                    ? this._parseSsrcInfoFromSourceAdd(elem, sdp)
                    : this._parseSsrcInfoFromSourceRemove(elem, sdp);
            const newRemoteSdp
                = isAdd
                    ? this._processRemoteAddSource(addOrRemoveSsrcInfo)
                    : this._processRemoteRemoveSource(addOrRemoveSsrcInfo);

            this._renegotiate(newRemoteSdp)
                .then(() => {
                    const newLocalSdp
                        = new SDP(this.peerconnection.localDescription.sdp);

                    logger.log(
                        `${logPrefix} - OK, SDPs: `, oldLocalSdp, newLocalSdp);
                    this.notifyMySSRCUpdate(oldLocalSdp, newLocalSdp);
                    finishedCallback();
                }, error => {
                    logger.error(`${logPrefix} failed:`, error);
                    finishedCallback(error);
                });
        };

        // Queue and execute
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
        const remoteSdp
            = optionalRemoteSdp
                || new SDP(this.peerconnection.remoteDescription.sdp);
        const remoteDescription = new RTCSessionDescription({
            type: this.isInitiator ? 'answer' : 'offer',
            sdp: remoteSdp.raw
        });

        return new Promise((resolve, reject) => {
            if (this.peerconnection.signalingState === 'closed') {
                reject('Attempted to renegotiate in state closed');

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
    _responderRenegotiate(remoteDescription, resolve, reject) {
        // FIXME use WebRTC promise API to simplify things
        logger.debug('Renegotiate: setting remote description');
        this.peerconnection.setRemoteDescription(
            remoteDescription,
            () => {
                logger.debug('Renegotiate: creating answer');
                this.peerconnection.createAnswer(
                    answer => {
                        logger.debug('Renegotiate: setting local description');
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
                    this.mediaConstraints
                );
            },
            error => reject(`setRemoteDescription failed: ${error}`)
        );
    }

    /**
     * Renegotiate cycle implementation for the initiator's case.
     * @param {object} remoteDescription the SDP object as defined by the WebRTC
     * which will be used as remote description in the cycle.
     * @param {function} resolve the success callback
     * @param {function} reject the failure callback
     * @private
     */
    _initiatorRenegotiate(remoteDescription, resolve, reject) {
        // FIXME use WebRTC promise API to simplify things
        if (this.peerconnection.signalingState === 'have-local-offer') {

            // Skip createOffer and setLocalDescription or FF will fail
            logger.debug(
                'Renegotiate: setting remote description');
            this.peerconnection.setRemoteDescription(
                remoteDescription,
                () => {
                    resolve();
                },
                error => reject(`setRemoteDescription failed: ${error}`)
            );
        } else {
            logger.debug('Renegotiate: creating offer');
            this.peerconnection.createOffer(
                offer => {
                    logger.debug('Renegotiate: setting local description');
                    this.peerconnection.setLocalDescription(offer,
                        () => {
                            logger.debug(
                                'Renegotiate: setting remote description');
                            this.peerconnection.setRemoteDescription(
                                remoteDescription,
                                () => {
                                    resolve();
                                },
                                error => reject(
                                    `setRemoteDescription failed: ${error}`)
                            );
                        },
                        error => {
                            reject('setLocalDescription failed: ', error);
                        });
                },
                error => reject(`createOffer failed: ${error}`),
                this.mediaConstraints);
        }
    }

    /**
     * Replaces <tt>oldTrack</tt> with <tt>newTrack</tt> and performs a single
     * offer/answer cycle after both operations are done. Either
     * <tt>oldTrack</tt> or <tt>newTrack</tt> can be null; replacing a valid
     * <tt>oldTrack</tt> with a null <tt>newTrack</tt> effectively just removes
     * <tt>oldTrack</tt>
     * @param {JitsiLocalTrack|null} oldTrack the current track in use to be
     * replaced
     * @param {JitsiLocalTrack|null} newTrack the new track to use
     * @returns {Promise} which resolves once the replacement is complete
     *  with no arguments or rejects with an error {string}
     */
    replaceTrack(oldTrack, newTrack) {
        const workFunction = finishedCallback => {
            const oldLocalSdp = this.peerconnection.localDescription.sdp;

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
            if (oldTrack) {
                this.peerconnection.removeTrack(oldTrack);
            }
            if (newTrack) {
                this.peerconnection.addTrack(newTrack);
            }

            if ((oldTrack || newTrack) && oldLocalSdp) {
                this._renegotiate()
                    .then(() => {
                        const newLocalSDP
                            = new SDP(
                                this.peerconnection.localDescription.sdp);

                        this.notifyMySSRCUpdate(
                            new SDP(oldLocalSdp), newLocalSDP);
                        finishedCallback();
                    },
                    finishedCallback /* will be called with en error */);
            } else {
                finishedCallback();
            }
        };

        this.modificationQueue.push(
            workFunction,
            error => {
                if (error) {
                    logger.error('Replace track error:', error);
                } else {
                    logger.info('Replace track done!');
                }
            });
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
                    /* eslint-disable no-invalid-this */
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

                    /* eslint-enable no-invalid-this */
                });
            const ssrcs = [];

            // handles both >source and >description>source versions
            const tmp
                = $(content).find(
                    'source[xmlns="urn:xmpp:jingle:apps:rtp:ssma:0"]');

            tmp.each(function() {
                // eslint-disable-next-line no-invalid-this
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
     * Will print an error if there is any difference, between the SSRCs given
     * in the <tt>oldSDP</tt> and the ones currently described in
     * the peerconnection's local description.
     * @param {string} operationName the operation's name which will be printed
     * in the error message.
     * @param {SDP} oldSDP the old local SDP which will be compared with
     * the current one.
     * @return {boolean} <tt>true</tt> if there was any change or <tt>false</tt>
     * otherwise.
     * @private
     */
    _verifyNoSSRCChanged(operationName, oldSDP) {
        const currentLocalSDP
            = new SDP(this.peerconnection.localDescription.sdp);
        let sdpDiff = new SDPDiffer(oldSDP, currentLocalSDP);
        const addedMedia = sdpDiff.getNewMedia();

        if (Object.keys(addedMedia).length) {
            logger.error(
                `Some SSRC were added on ${operationName}`, addedMedia);

            return false;
        }

        sdpDiff = new SDPDiffer(currentLocalSDP, oldSDP);
        const removedMedia = sdpDiff.getNewMedia();

        if (Object.keys(removedMedia).length) {
            logger.error(
                `Some SSRCs were removed on ${operationName}`, removedMedia);

            return false;
        }

        return true;
    }

    /**
     * Adds local track back to this session, as part of the unmute operation.
     * @param {JitsiLocalTrack} track
     * @return {Promise} a promise that will resolve once the local track is
     * added back to this session and renegotiation succeeds. Will be rejected
     * with a <tt>string</tt> that provides some error details in case something
     * goes wrong.
     */
    addTrackAsUnmute(track) {
        return this._addRemoveTrackAsMuteUnmute(
            false /* add as unmute */, track);
    }

    /**
     * Remove local track as part of the mute operation.
     * @param {JitsiLocalTrack} track the local track to be removed
     * @return {Promise} a promise which will be resolved once the local track
     * is removed from this session and the renegotiation is performed.
     * The promise will be rejected with a <tt>string</tt> that the describes
     * the error if anything goes wrong.
     */
    removeTrackAsMute(track) {
        return this._addRemoveTrackAsMuteUnmute(
            true /* remove as mute */, track);
    }

    /**
     * See {@link addTrackAsUnmute} and {@link removeTrackAsMute}.
     * @param {boolean} isMute <tt>true</tt> for "remove as mute" or
     * <tt>false</tt> for "add as unmute".
     * @param {JitsiLocalTrack} track the track that will be added/removed
     * @private
     */
    _addRemoveTrackAsMuteUnmute(isMute, track) {
        if (!track) {
            return Promise.reject('invalid "track" argument value');
        }
        const operationName = isMute ? 'removeTrackMute' : 'addTrackUnmute';
        const workFunction = finishedCallback => {
            const tpc = this.peerconnection;

            if (!tpc) {
                finishedCallback(
                    `Error:  tried ${operationName} track with no active peer`
                        + 'connection');

                return;
            }
            const oldLocalSDP = tpc.localDescription.sdp;
            const tpcOperation
                = isMute
                    ? tpc.removeTrackMute.bind(tpc, track)
                    : tpc.addTrackUnmute.bind(tpc, track);

            if (!tpcOperation()) {
                finishedCallback(`${operationName} failed!`);
            } else if (!oldLocalSDP || !tpc.remoteDescription.sdp) {
                finishedCallback();
            } else {
                this._renegotiate()
                    .then(() => {
                        // The results are ignored, as this check failure is not
                        // enough to fail the whole operation. It will log
                        // an error inside.
                        this._verifyNoSSRCChanged(
                            operationName, new SDP(oldLocalSDP));
                        finishedCallback();
                    },
                    finishedCallback /* will be called with an error */);
            }
        };

        return new Promise((resolve, reject) => {
            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
        });
    }

    /**
     * Resumes or suspends media transfer over the underlying peer connection.
     * @param {boolean} active <tt>true</tt> to enable media transfer or
     * <tt>false</tt> to suspend any media transmission.
     * @return {Promise} a <tt>Promise</tt> which will resolve once
     * the operation is done. It will be rejected with an error description as
     * a string in case anything goes wrong.
     */
    setMediaTransferActive(active) {
        const workFunction = finishedCallback => {
            this.mediaTransferActive = active;
            if (this.peerconnection) {
                this.peerconnection.setMediaTransferActive(
                    this.mediaTransferActive);

                // Will do the sRD/sLD cycle to update SDPs and adjust the media
                // direction
                this._renegotiate()
                    .then(
                        finishedCallback,
                        finishedCallback /* will be called with an error */);
            } else {
                finishedCallback();
            }
        };

        const logStr = active ? 'active' : 'inactive';

        logger.info(`Queued make media transfer ${logStr} task...`);

        return new Promise((resolve, reject) => {
            this.modificationQueue.push(
                workFunction,
                error => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
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
        const removedAnySSRCs = sdpDiffer.toJingle(remove);

        if (removedAnySSRCs) {
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

        const containsNewSSRCs = sdpDiffer.toJingle(add);

        if (containsNewSSRCs) {
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

            error.source = request;
            if (request && typeof request.tree === 'function') {
                error.source = request.tree();
            }
            if (error.source && error.source.outerHTML) {
                error.source = error.source.outerHTML;
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

    /**
     *
     * @param session
     * @param error
     */
    static onJingleFatalError(session, error) {
        if (this.room) {
            this.room.eventEmitter.emit(
                XMPPEvents.CONFERENCE_SETUP_FAILED, session, error);
            this.room.eventEmitter.emit(
                XMPPEvents.JINGLE_FATAL_ERROR, session, error);
        }
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

        // The signaling layer will remove it's listeners
        this.signalingLayer.setChatRoom(null);

        // do not try to close if already closed.
        this.peerconnection
            && ((this.peerconnection.signalingState
                    && this.peerconnection.signalingState !== 'closed')
                || (this.peerconnection.connectionState
                    && this.peerconnection.connectionState !== 'closed'))
            && this.peerconnection.close();
    }

    /**
     * Converts to string with minor summary.
     * @return {string}
     */
    toString() {
        return `JingleSessionPC[p2p=${this.isP2P},`
                    + `initiator=${this.isInitiator},sid=${this.sid}]`;
    }
}
