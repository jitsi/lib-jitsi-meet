/* global $, $iq, __filename, Strophe */

import { getLogger } from "jitsi-meet-logger";
const logger = getLogger(__filename);
import JingleSessionPC from "./JingleSessionPC";
import * as JingleSessionState from "./JingleSessionState";
import XMPPEvents from "../../service/xmpp/XMPPEvents";
import GlobalOnErrorHandler from "../util/GlobalOnErrorHandler";
import RandomUtil from "../util/RandomUtil";
import Statistics from "../statistics/statistics";
import ConnectionPlugin from "./ConnectionPlugin";

class JingleConnectionPlugin extends ConnectionPlugin {
    constructor(xmpp, eventEmitter) {
        super();
        this.xmpp = xmpp;
        this.eventEmitter = eventEmitter;
        this.sessions = {};
        // FIXME make configurable and use STUN only in P2P
        this.ice_config = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                { urls: "stun:stun2.l.google.com:19302" }
            ]
        };
        this.media_constraints = {
            mandatory: {
                'OfferToReceiveAudio': true,
                'OfferToReceiveVideo': true
            }
            // MozDontOfferDataChannel: true when this is firefox
        };
    }

    init (connection) {
        super.init(connection);
        this.connection.addHandler(this.onJingle.bind(this),
            'urn:xmpp:jingle:1', 'iq', 'set', null, null);
    }

    onJingle (iq) {
        const sid = $(iq).find('jingle').attr('sid');
        const action = $(iq).find('jingle').attr('action');
        const fromJid = iq.getAttribute('from');
        // send ack first
        const ack = $iq({type: 'result',
            to: fromJid,
            id: iq.getAttribute('id')
        });
        logger.log('on jingle ' + action + ' from ' + fromJid, iq);
        let sess = this.sessions[sid];
        if ('session-initiate' != action) {
            if (!sess) {
                ack.attrs({ type: 'error' });
                ack.c('error', {type: 'cancel'})
                    .c('item-not-found', {
                        xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas'}).up()
                    .c('unknown-session', {xmlns: 'urn:xmpp:jingle:errors:1'});
                logger.warn('invalid session id', iq);
                this.connection.send(ack);
                return true;
            }
            // local jid is not checked
            if (fromJid != sess.peerjid) {
                logger.warn(
                    'jid mismatch for session id', sid, sess.peerjid, iq);
                ack.attrs({ type: 'error' });
                ack.c('error', {type: 'cancel'})
                    .c('item-not-found', {xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas'}).up()
                    .c('unknown-session', {xmlns: 'urn:xmpp:jingle:errors:1'});
                this.connection.send(ack);
                return true;
            }
        } else if (sess !== undefined) {
            // existing session with same session id
            // this might be out-of-order if the sess.peerjid is the same as from
            ack.attrs({ type: 'error' });
            ack.c('error', {type: 'cancel'})
                .c('service-unavailable', {xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas'}).up();
            logger.warn('duplicate session id', sid, iq);
            this.connection.send(ack);
            return true;
        }
        const now = window.performance.now();
        // see http://xmpp.org/extensions/xep-0166.html#concepts-session
        switch (action) {
            case 'session-initiate': {
                logger.log("(TIME) received session-initiate:\t", now);
                const startMuted = $(iq).find('jingle>startmuted');
                if (startMuted && startMuted.length > 0) {
                    const audioMuted = startMuted.attr("audio");
                    const videoMuted = startMuted.attr("video");
                    this.eventEmitter.emit(XMPPEvents.START_MUTED_FROM_FOCUS,
                            audioMuted === "true", videoMuted === "true");
                }
                // FIXME Not this plugin nor the XMPP module has enough
                // knowledge to tell if the user is a conference focus.
                // The conference has to set the 'isP2P' field of
                // the JingleSession during incoming call processing.
                sess = new JingleSessionPC(
                        $(iq).attr('to'), $(iq).find('jingle').attr('sid'),
                        fromJid,
                        this.connection,
                        this.media_constraints,
                        this.ice_config,
                        undefined /* P2P */, false /* initiator */,
                        this.xmpp.options);

                this.sessions[sess.sid] = sess;

                this.eventEmitter.emit(XMPPEvents.CALL_INCOMING,
                    sess, $(iq).find('>jingle'), now);
                Statistics.analytics.sendEvent(
                    'xmpp.session-initiate', {value: now});
                break;
            }
            case 'session-accept': {
                this.eventEmitter.emit(
                    XMPPEvents.CALL_ACCEPTED, sess, $(iq).find('>jingle'));
                break;
            }
            case 'transport-info': {
                this.eventEmitter.emit(
                    XMPPEvents.TRANSPORT_INFO, sess, $(iq).find('>jingle'));
                break;
            }
            case 'session-terminate': {
                logger.log('terminating...', sess.sid);
                let reasonCondition = null;
                let reasonText = null;
                if ($(iq).find('>jingle>reason').length) {
                    reasonCondition
                        = $(iq).find('>jingle>reason>:first')[0].tagName;
                    reasonText = $(iq).find('>jingle>reason>text').text();
                }
                this.terminate(sess.sid, reasonCondition, reasonText);
                sess.state = JingleSessionState.ENDED;
                this.eventEmitter.emit(XMPPEvents.CALL_ENDED,
                    sess, reasonCondition, reasonText);
                break;
            }
            case 'transport-replace':
                logger.info("(TIME) Start transport replace", now);
                Statistics.analytics.sendEvent(
                    'xmpp.transport-replace.start', {value: now});

                sess.replaceTransport($(iq).find('>jingle'), () => {
                    const successTime = window.performance.now();
                    logger.info(
                        "(TIME) Transport replace success!", successTime);
                    Statistics.analytics.sendEvent(
                        'xmpp.transport-replace.success',
                        {value: successTime});
                }, error => {
                    GlobalOnErrorHandler.callErrorHandler(error);
                    logger.error('Transport replace failed', error);
                    sess.sendTransportReject();
                });
                break;
            case 'addsource': // FIXME: proprietary, un-jingleish
            case 'source-add': // FIXME: proprietary
                sess.addRemoteStream($(iq).find('>jingle>content'));
                break;
            case 'removesource': // FIXME: proprietary, un-jingleish
            case 'source-remove': // FIXME: proprietary
                sess.removeRemoteStream($(iq).find('>jingle>content'));
                break;
            default:
                logger.warn('jingle action not implemented', action);
                ack.attrs({ type: 'error' });
                ack.c('error', {type: 'cancel'})
                    .c('bad-request',
                        { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' })
                    .up();
                break;
        }
        this.connection.send(ack);
        return true;
    }

    /**
     * Creates new <tt>JingleSessionPC</tt> meant to be used in a direct P2P
     * connection, configured as 'initiator'.
     * @param {string} me our JID
     * @param {string} peer remote participant's JID
     * @return {JingleSessionPC}
     */
    newJingleSession (me, peer) {
        const sess = new JingleSessionPC(
            me,
            RandomUtil.randomHexString(12),
            peer,
            this.connection,
            this.media_constraints,
            this.ice_config,
            true /* P2P */, true /* initiator */,
            this.xmpp.options);

        this.sessions[sess.sid] = sess;
        return sess;
    }

    terminate (sid, reasonCondition, reasonText) {
        if (this.sessions.hasOwnProperty(sid)) {
            if (this.sessions[sid].state != 'ended') {
                this.sessions[sid].onTerminated(reasonCondition, reasonText);
            }
            delete this.sessions[sid];
        }
    }

    getStunAndTurnCredentials () {
        // get stun and turn configuration from server via xep-0215
        // uses time-limited credentials as described in
        // http://tools.ietf.org/html/draft-uberti-behave-turn-rest-00
        //
        // see https://code.google.com/p/prosody-modules/source/browse/mod_turncredentials/mod_turncredentials.lua
        // for a prosody module which implements this
        //
        // currently, this doesn't work with updateIce and therefore credentials with a long
        // validity have to be fetched before creating the peerconnection
        // TODO: implement refresh via updateIce as described in
        //      https://code.google.com/p/webrtc/issues/detail?id=1650
        this.connection.sendIQ(
            $iq({type: 'get', to: this.connection.domain})
                .c('services', {xmlns: 'urn:xmpp:extdisco:1'})
                .c('service', {host: 'turn.' + this.connection.domain}),
            res => {
                let iceservers = [];
                $(res).find('>services>service').each((idx, el) => {
                    el = $(el);
                    let dict = {};
                    const type = el.attr('type');
                    switch (type) {
                        case 'stun':
                            dict.url = 'stun:' + el.attr('host');
                            if (el.attr('port')) {
                                dict.url += ':' + el.attr('port');
                            }
                            iceservers.push(dict);
                            break;
                        case 'turn':
                        case 'turns': {
                            dict.url = type + ':';
                            const username = el.attr('username');
                            // https://code.google.com/p/webrtc/issues/detail?id=1508
                            if (username) {
                                if (navigator.userAgent.match(
                                    /Chrom(e|ium)\/([0-9]+)\./)
                                    && parseInt(
                                        navigator.userAgent.match(
                                            /Chrom(e|ium)\/([0-9]+)\./)[2],
                                            10) < 28) {
                                    dict.url += username + '@';
                                } else {
                                    // only works in M28
                                    dict.username = username;
                                }
                            }
                            dict.url += el.attr('host');
                            const port = el.attr('port');
                            if (port && port != '3478') {
                                dict.url += ':' + el.attr('port');
                            }
                            const transport = el.attr('transport');
                            if (transport && transport != 'udp') {
                                dict.url += '?transport=' + transport;
                            }

                            dict.credential = el.attr('password')
                                || dict.credential;
                            iceservers.push(dict);
                            break;
                        }
                    }
                });
                this.ice_config.iceServers = iceservers;
            }, err => {
                logger.warn('getting turn credentials failed', err);
                logger.warn('is mod_turncredentials or similar installed?');
            });
        // implement push?
    }

    /**
     * Returns the data saved in 'updateLog' in a format to be logged.
     */
    getLog () {
        const data = {};
        Object.keys(this.sessions).forEach(sid => {
            const session = this.sessions[sid];
            const pc = session.peerconnection;
            if (pc && pc.updateLog) {
                // FIXME: should probably be a .dump call
                data["jingle_" + sid] = {
                    updateLog: pc.updateLog,
                    stats: pc.stats,
                    url: window.location.href
                };
            }
        });
        return data;
    }
}



module.exports = function(XMPP, eventEmitter) {
    Strophe.addConnectionPlugin('jingle',
        new JingleConnectionPlugin(XMPP, eventEmitter));
};
