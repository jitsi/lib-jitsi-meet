/* global $, $iq, __filename, Strophe */

import { getLogger } from 'jitsi-meet-logger';
const logger = getLogger(__filename);

import JingleSessionPC from './JingleSessionPC';
import XMPPEvents from '../../service/xmpp/XMPPEvents';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import RandomUtil from '../util/RandomUtil';
import Statistics from '../statistics/statistics';
import ConnectionPlugin from './ConnectionPlugin';

// XXX Strophe is build around the idea of chaining function calls so allow long
// function call chains.
/* eslint-disable newline-per-chained-call */

/**
 *
 */
class JingleConnectionPlugin extends ConnectionPlugin {
    /**
     * Creates new <tt>JingleConnectionPlugin</tt>
     * @param {XMPP} xmpp
     * @param {EventEmitter} eventEmitter
     * @param {Array<Object>} p2pStunServers an array which is part of the ice
     * config passed to the <tt>PeerConnection</tt> with the structure defined
     * by the WebRTC standard.
     */
    constructor(xmpp, eventEmitter, p2pStunServers) {
        super();
        this.xmpp = xmpp;
        this.eventEmitter = eventEmitter;
        this.sessions = {};
        this.jvbIceConfig = { iceServers: [ ] };
        this.p2pIceConfig = { iceServers: [ ] };
        if (Array.isArray(p2pStunServers)) {
            logger.info('Configured STUN servers: ', p2pStunServers);
            this.p2pIceConfig.iceServers = p2pStunServers;
        }
        this.mediaConstraints = {
            mandatory: {
                'OfferToReceiveAudio': true,
                'OfferToReceiveVideo': true
            }

            // MozDontOfferDataChannel: true when this is firefox
        };
    }

    /**
     *
     * @param connection
     */
    init(connection) {
        super.init(connection);
        this.connection.addHandler(this.onJingle.bind(this),
            'urn:xmpp:jingle:1', 'iq', 'set', null, null);
    }

    /**
     *
     * @param iq
     */
    onJingle(iq) {
        const sid = $(iq).find('jingle').attr('sid');
        const action = $(iq).find('jingle').attr('action');
        const fromJid = iq.getAttribute('from');

        // send ack first
        const ack = $iq({ type: 'result',
            to: fromJid,
            id: iq.getAttribute('id')
        });

        logger.log(`on jingle ${action} from ${fromJid}`, iq);
        let sess = this.sessions[sid];

        if (action !== 'session-initiate') {
            if (!sess) {
                ack.attrs({ type: 'error' });
                ack.c('error', { type: 'cancel' })
                    .c('item-not-found', {
                        xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas'
                    })
                    .up()
                    .c('unknown-session', {
                        xmlns: 'urn:xmpp:jingle:errors:1'
                    });
                logger.warn('invalid session id', iq);
                this.connection.send(ack);

                return true;
            }

            // local jid is not checked
            if (fromJid !== sess.peerjid) {
                logger.warn(
                    'jid mismatch for session id', sid, sess.peerjid, iq);
                ack.attrs({ type: 'error' });
                ack.c('error', { type: 'cancel' })
                    .c('item-not-found', {
                        xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas'
                    })
                    .up()
                    .c('unknown-session', {
                        xmlns: 'urn:xmpp:jingle:errors:1'
                    });
                this.connection.send(ack);

                return true;
            }
        } else if (sess !== undefined) {
            // Existing session with same session id. This might be out-of-order
            // if the sess.peerjid is the same as from.
            ack.attrs({ type: 'error' });
            ack.c('error', { type: 'cancel' })
                .c('service-unavailable', {
                    xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas'
                })
                .up();
            logger.warn('duplicate session id', sid, iq);
            this.connection.send(ack);

            return true;
        }
        const now = window.performance.now();

        // see http://xmpp.org/extensions/xep-0166.html#concepts-session

        switch (action) {
        case 'session-initiate': {
            logger.log('(TIME) received session-initiate:\t', now);
            const startMuted = $(iq).find('jingle>startmuted');

            if (startMuted && startMuted.length > 0) {
                const audioMuted = startMuted.attr('audio');
                const videoMuted = startMuted.attr('video');

                this.eventEmitter.emit(
                    XMPPEvents.START_MUTED_FROM_FOCUS,
                    audioMuted === 'true',
                    videoMuted === 'true');
            }

            // FIXME that should work most of the time, but we'd have to
            // think how secure it is to assume that user with "focus"
            // nickname is Jicofo.
            const isP2P = Strophe.getResourceFromJid(fromJid) !== 'focus';

            logger.info(
                `Marking session from ${fromJid
                } as ${isP2P ? '' : '*not*'} P2P`);
            sess
                = new JingleSessionPC(
                    $(iq).find('jingle').attr('sid'),
                    $(iq).attr('to'),
                    fromJid,
                    this.connection,
                    this.mediaConstraints,
                    isP2P ? this.p2pIceConfig : this.jvbIceConfig,
                    isP2P,
                    /* initiator */ false,
                    this.xmpp.options);

            this.sessions[sess.sid] = sess;

            this.eventEmitter.emit(XMPPEvents.CALL_INCOMING,
                sess, $(iq).find('>jingle'), now);
            Statistics.analytics.sendEvent(
                'xmpp.session-initiate', { value: now });
            break;
        }
        case 'session-accept': {
            this.eventEmitter.emit(
                XMPPEvents.CALL_ACCEPTED, sess, $(iq).find('>jingle'));
            break;
        }
        case 'content-modify': {
            sess.modifyContents($(iq).find('>jingle'));
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
            this.eventEmitter.emit(XMPPEvents.CALL_ENDED,
                sess, reasonCondition, reasonText);
            break;
        }
        case 'transport-replace':
            logger.info('(TIME) Start transport replace', now);
            Statistics.analytics.sendEvent(
                'xmpp.transport-replace.start',
                { value: now });

            sess.replaceTransport($(iq).find('>jingle'), () => {
                const successTime = window.performance.now();

                logger.info('(TIME) Transport replace success!', successTime);
                Statistics.analytics.sendEvent(
                    'xmpp.transport-replace.success',
                    { value: successTime });
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
            ack.c('error', { type: 'cancel' })
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
    newP2PJingleSession(me, peer) {
        const sess
            = new JingleSessionPC(
                RandomUtil.randomHexString(12),
                me,
                peer,
                this.connection,
                this.mediaConstraints,
                this.p2pIceConfig,
                /* P2P */ true,
                /* initiator */ true,
                this.xmpp.options);

        this.sessions[sess.sid] = sess;

        return sess;
    }

    /**
     *
     * @param sid
     * @param reasonCondition
     * @param reasonText
     */
    terminate(sid, reasonCondition, reasonText) {
        if (this.sessions.hasOwnProperty(sid)) {
            if (this.sessions[sid].state !== 'ended') {
                this.sessions[sid].onTerminated(reasonCondition, reasonText);
            }
            delete this.sessions[sid];
        }
    }

    /**
     *
     */
    getStunAndTurnCredentials() {
        // get stun and turn configuration from server via xep-0215
        // uses time-limited credentials as described in
        // http://tools.ietf.org/html/draft-uberti-behave-turn-rest-00
        //
        // See https://code.google.com/p/prosody-modules/source/browse/
        // mod_turncredentials/mod_turncredentials.lua
        // for a prosody module which implements this.
        //
        // Currently, this doesn't work with updateIce and therefore credentials
        // with a long validity have to be fetched before creating the
        // peerconnection.
        // TODO: implement refresh via updateIce as described in
        //      https://code.google.com/p/webrtc/issues/detail?id=1650
        this.connection.sendIQ(
            $iq({ type: 'get',
                to: this.connection.domain })
                .c('services', { xmlns: 'urn:xmpp:extdisco:1' })
                .c('service', { host: `turn.${this.connection.domain}` }),
            res => {
                const iceservers = [];

                $(res).find('>services>service').each((idx, el) => {
                    // eslint-disable-next-line no-param-reassign
                    el = $(el);
                    const dict = {};
                    const type = el.attr('type');

                    switch (type) {
                    case 'stun':
                        dict.url = `stun:${el.attr('host')}`;
                        if (el.attr('port')) {
                            dict.url += `:${el.attr('port')}`;
                        }
                        iceservers.push(dict);
                        break;
                    case 'turn':
                    case 'turns': {
                        dict.url = `${type}:`;
                        const username = el.attr('username');

                        // https://code.google.com/p/webrtc/issues/detail
                        // ?id=1508

                        if (username) {
                            const match
                                = navigator.userAgent.match(
                                    /Chrom(e|ium)\/([0-9]+)\./);

                            if (match && parseInt(match[2], 10) < 28) {
                                dict.url += `${username}@`;
                            } else {
                                // only works in M28
                                dict.username = username;
                            }
                        }
                        dict.url += el.attr('host');
                        const port = el.attr('port');

                        if (port && port !== '3478') {
                            dict.url += `:${el.attr('port')}`;
                        }
                        const transport = el.attr('transport');

                        if (transport && transport !== 'udp') {
                            dict.url += `?transport=${transport}`;
                        }

                        dict.credential = el.attr('password')
                                || dict.credential;
                        iceservers.push(dict);
                        break;
                    }
                    }
                });

                const options = this.xmpp.options;

                if (options.useStunTurn) {
                    this.jvbIceConfig.iceServers = iceservers;
                }

                if (options.p2p && options.p2p.useStunTurn) {
                    this.p2pIceConfig.iceServers = iceservers;
                }

            }, err => {
                logger.warn('getting turn credentials failed', err);
                logger.warn('is mod_turncredentials or similar installed?');
            });

        // implement push?
    }

    /**
     * Returns the data saved in 'updateLog' in a format to be logged.
     */
    getLog() {
        const data = {};

        Object.keys(this.sessions).forEach(sid => {
            const session = this.sessions[sid];
            const pc = session.peerconnection;

            if (pc && pc.updateLog) {
                // FIXME: should probably be a .dump call
                data[`jingle_${sid}`] = {
                    updateLog: pc.updateLog,
                    stats: pc.stats,
                    url: window.location.href
                };
            }
        });

        return data;
    }
}

/* eslint-enable newline-per-chained-call */

/**
 *
 * @param XMPP
 * @param eventEmitter
 * @param p2pStunServers
 */
export default function initJingle(XMPP, eventEmitter, p2pStunServers) {
    Strophe.addConnectionPlugin(
        'jingle',
        new JingleConnectionPlugin(XMPP, eventEmitter, p2pStunServers));
}
