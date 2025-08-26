import { getLogger } from '@jitsi/logger';
import { cloneDeep } from 'lodash-es';
import { $iq, Strophe } from 'strophe.js';

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import RandomUtil from '../util/RandomUtil';
import { findAll, findFirst, getAttribute, getText } from '../util/XMLUtils';

import ConnectionPlugin from './ConnectionPlugin';
import { expandSourcesFromJson } from './JingleHelperFunctions';
import JingleSessionPC from './JingleSessionPC';

const logger = getLogger('xmpp:strophe.jingle');

// XXX Strophe is build around the idea of chaining function calls so allow long
// function call chains.
/* eslint-disable newline-per-chained-call */

/**
 * Parses the transport XML element and returns the list of ICE candidates formatted as text.
 *
 * @param {*} transport Transport XML element extracted from the IQ.
 * @returns {Array<string>}
 */
function _parseIceCandidates(transport) {
    const candidates = findAll(transport, ':scope>candidate');
    const parseCandidates = [];

    // Extract the candidate information from the IQ.
    candidates.forEach(candidate => {
        const attributes = candidate.attributes;
        const candidateAttrs = [];

        for (let i = 0; i < attributes.length; i++) {
            const attr = attributes[i];

            candidateAttrs.push(`${attr.name}: ${attr.value}`);
        }
        parseCandidates.push(candidateAttrs.join(' '));
    });

    return parseCandidates;
}

/**
 *
 */
export default class JingleConnectionPlugin extends ConnectionPlugin {
    /**
     * Creates new <tt>JingleConnectionPlugin</tt>
     * @param {XMPP} xmpp
     * @param {EventEmitter} eventEmitter
     * @param {Object} iceConfig an object that holds the iceConfig to be passed
     * to the p2p and the jvb <tt>PeerConnection</tt>.
     */
    constructor(xmpp, eventEmitter, iceConfig) {
        super();
        this.xmpp = xmpp;
        this.eventEmitter = eventEmitter;
        this.sessions = {};
        this.jvbIceConfig = iceConfig.jvb;
        this.p2pIceConfig = iceConfig.p2p;
        this.mediaConstraints = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
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
        const jingleElement = findFirst(iq, 'jingle');
        const sid = getAttribute(jingleElement, 'sid');
        const action = getAttribute(jingleElement, 'action');
        const fromJid = getAttribute(iq, 'from');

        // send ack first
        const ack = $iq({ id: iq.getAttribute('id'),
            to: fromJid,
            type: 'result'
        });

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
                logger.warn(`invalid session id: ${sid}`);
                logger.debug(iq);
                this.connection.send(ack);

                return true;
            }

            // local jid is not checked
            if (fromJid !== sess.remoteJid) {
                logger.warn(
                    'jid mismatch for session id', sid, sess.remoteJid, iq);
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
            // if the sess.remoteJid is the same as from.
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

        // FIXME that should work most of the time, but we'd have to
        // think how secure it is to assume that user with "focus"
        // nickname is Jicofo.
        const isP2P = Strophe.getResourceFromJid(fromJid) !== 'focus';

        // see http://xmpp.org/extensions/xep-0166.html#concepts-session

        const jsonMessages = findAll(iq, 'jingle>json-message');

        if (jsonMessages?.length) {
            let audioVideoSsrcs;

            logger.info(`Found a JSON-encoded element in ${action}, translating to standard Jingle.`);
            for (let i = 0; i < jsonMessages.length; i++) {
                // Currently there is always a single json-message in the IQ with the source information.
                audioVideoSsrcs = expandSourcesFromJson(iq, jsonMessages[i]);
            }

            if (audioVideoSsrcs?.size) {
                const logMessage = [];

                for (const endpoint of audioVideoSsrcs.keys()) {
                    logMessage.push(`${endpoint}:[${audioVideoSsrcs.get(endpoint)}]`);
                }
                logger.debug(`Received ${action} from ${fromJid} with sources=${logMessage.join(', ')}`);
            }

            // TODO: is there a way to remove the json-message elements once we've extracted the information?
            // removeChild doesn't seem to work.
        }

        switch (action) {
        case 'session-initiate': {
            logger.info('(TIME) received session-initiate:\t', now);

            isP2P && logger.debug(`Received ${action} from ${fromJid}`);
            const pcConfig = isP2P ? this.p2pIceConfig : this.jvbIceConfig;

            sess
                = new JingleSessionPC(
                    sid,
                    iq.getAttribute('to'),
                    fromJid,
                    this.connection,
                    this.mediaConstraints,
                    cloneDeep(pcConfig),
                    isP2P,
                    /* initiator */ false);

            this.sessions[sess.sid] = sess;
            this.eventEmitter.emit(XMPPEvents.CALL_INCOMING, sess, jingleElement, now);
            break;
        }
        case 'session-accept': {
            const ssrcs = [];

            // Extract the SSRCs from the session-accept received from a p2p peer.
            findAll(iq, 'jingle>content').forEach(content => {
                const ssrc = getAttribute(findFirst(content, 'description'), 'ssrc');

                ssrc && ssrcs.push(ssrc);
            });

            logger.debug(`Received ${action} from ${fromJid} with ssrcs=${ssrcs}`);
            this.eventEmitter.emit(XMPPEvents.CALL_ACCEPTED, sess, jingleElement);
            break;
        }
        case 'content-modify': {
            logger.debug(`Received ${action} from ${fromJid}`);
            sess.modifyContents(jingleElement);
            break;
        }
        case 'transport-info': {
            const candidates = _parseIceCandidates(findFirst(iq, 'jingle>content>transport'));

            logger.debug(`Received ${action} from ${fromJid} for candidates=${candidates.join(', ')}`);
            this.eventEmitter.emit(XMPPEvents.TRANSPORT_INFO, sess, jingleElement);
            break;
        }
        case 'session-terminate': {
            logger.info('terminating...', sess.sid);
            let reasonCondition = null;
            let reasonText = null;

            const reasonElement = findFirst(iq, ':scope>jingle>reason');

            if (reasonElement) {
                const firstReasonChild = reasonElement.children?.length > 0 ? reasonElement.children[0] : undefined;

                reasonCondition = firstReasonChild ? firstReasonChild.tagName : null;
                reasonText = getText(findFirst(iq, ':scope>jingle>reason>text'));
            }

            logger.debug(`Received ${action} from ${fromJid} disconnect reason=${reasonText}`);
            this.terminate(sess.sid, reasonCondition, reasonText);
            this.eventEmitter.emit(XMPPEvents.CALL_ENDED, sess, reasonCondition, reasonText);
            break;
        }
        case 'transport-replace':
            logger.error(`Ignoring ${action} from ${fromJid} as it is not supported by the client.`);
            break;
        case 'source-add':
            sess.addRemoteStream(findAll(iq, ':scope>jingle>content'));
            break;
        case 'source-remove':
            sess.removeRemoteStream(findAll(iq, ':scope>jingle>content'));
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
                /* initiator */ true);

        this.sessions[sess.sid] = sess;

        return sess;
    }

    /**
     *
     * @param sid
     * @param reasonCondition
     * @param reasonText
     */
    terminate(sid, reasonCondition = undefined, reasonText = undefined) {
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
        // See https://modules.prosody.im/mod_turncredentials.html
        // for a prosody module which implements this.
        // Or the new implementation https://modules.prosody.im/mod_external_services which will be in prosody 0.12
        //
        // Currently, this doesn't work with updateIce and therefore credentials
        // with a long validity have to be fetched before creating the
        // peerconnection.
        // TODO: implement refresh via updateIce as described in
        //      https://code.google.com/p/webrtc/issues/detail?id=1650
        this.connection.sendIQ(
            $iq({ to: this.xmpp.options.hosts.domain,
                type: 'get' })
                .c('services', { xmlns: 'urn:xmpp:extdisco:2' }),
            v2Res => this.onReceiveStunAndTurnCredentials(v2Res),
            () => {
                logger.warn('getting turn credentials with extdisco:2 failed, trying extdisco:1');
                this.connection.sendIQ(
                    $iq({ to: this.xmpp.options.hosts.domain,
                        type: 'get' })
                        .c('services', { xmlns: 'urn:xmpp:extdisco:1' }),
                    v1Res => this.onReceiveStunAndTurnCredentials(v1Res),
                    () => {
                        logger.warn('getting turn credentials failed');
                        logger.warn('is mod_turncredentials or similar installed and configured?');
                    }
                );
            });
    }

    /**
     * Parses response when querying for services using urn:xmpp:extdisco:1 or urn:xmpp:extdisco:2.
     * Stores results in jvbIceConfig and p2pIceConfig.
     * @param res The response iq.
     * @return {boolean} Whether something was processed from the supplied message.
     */
    onReceiveStunAndTurnCredentials(res) {
        let iceservers = [];

        findAll(res, ':scope>services>service').forEach(el => {
            const dict = {};
            const type = getAttribute(el, 'type');

            switch (type) {
            case 'stun': {
                dict.urls = `stun:${getAttribute(el, 'host')}`;
                const port = getAttribute(el, 'port');

                if (port) {
                    dict.urls += `:${port}`;
                }
                iceservers.push(dict);
                break;
            }
            case 'turn':
            case 'turns': {
                dict.urls = `${type}:`;
                dict.username = getAttribute(el, 'username');
                dict.urls += getAttribute(el, 'host');
                const turnPort = getAttribute(el, 'port');

                if (turnPort) {
                    dict.urls += `:${turnPort}`;
                }
                const transport = getAttribute(el, 'transport');

                if (transport && transport !== 'udp') {
                    dict.urls += `?transport=${transport}`;
                }

                dict.credential = getAttribute(el, 'password') || dict.credential;
                iceservers.push(dict);
                break;
            }
            }
        });

        const options = this.xmpp.options;
        const { iceServersOverride = [] } = options;

        iceServersOverride.forEach(({ targetType, urls, username, credential }) => {
            if (![ 'turn', 'turns', 'stun' ].includes(targetType)) {
                return;
            }

            const pattern = `${targetType}:`;

            if (typeof urls === 'undefined'
                && typeof username === 'undefined'
                && typeof credential === 'undefined') {
                return;
            }

            if (urls === null) { // remove this type of ice server
                iceservers = iceservers.filter(server => !server.urls.startsWith(pattern));
            }


            iceservers.forEach(server => {
                if (!server.urls.startsWith(pattern)) {
                    return;
                }

                server.urls = urls ?? server.urls;

                if (username === null) {
                    delete server.username;
                } else {
                    server.username = username ?? server.username;
                }

                if (credential === null) {
                    delete server.credential;
                } else {
                    server.credential = credential ?? server.credential;
                }
            });
        });

        // Shuffle ICEServers for loadbalancing
        for (let i = iceservers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = iceservers[i];

            iceservers[i] = iceservers[j];
            iceservers[j] = temp;
        }

        let filter;

        if (options.useTurnUdp) {
            filter = s => s.urls.startsWith('turn');
        } else {
            // By default we filter out STUN and TURN/UDP and leave only TURN/TCP.
            filter = s => s.urls.startsWith('turn') && (s.urls.indexOf('transport=tcp') >= 0);
        }

        this.jvbIceConfig.iceServers = iceservers.filter(filter);
        this.p2pIceConfig.iceServers = iceservers;

        return iceservers.length > 0;
    }

    /**
     * Returns the data saved in 'updateLog' in a format to be logged.
     * @returns {Record<string, unknown>} An object containing the data to be logged.
     */
    getLog() {
        const data = {};

        Object.keys(this.sessions).forEach(sid => {
            const session = this.sessions[sid];
            const pc = session.peerconnection;

            if (pc && pc.updateLog) {
                // FIXME: should probably be a .dump call
                data[`jingle_${sid}`] = {
                    stats: pc.stats,
                    updateLog: pc.updateLog,
                    url: window.location.href
                };
            }
        });

        return data;
    }
}

/* eslint-enable newline-per-chained-call */
