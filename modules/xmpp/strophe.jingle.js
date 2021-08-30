/* global $, $build, __filename */

import { getLogger } from 'jitsi-meet-logger';
import { $iq, Strophe } from 'strophe.js';

import {
    ACTION_JINGLE_TR_RECEIVED,
    ACTION_JINGLE_TR_SUCCESS,
    createJingleEvent
} from '../../service/statistics/AnalyticsEvents';
import XMPPEvents from '../../service/xmpp/XMPPEvents';
import Statistics from '../statistics/statistics';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import RandomUtil from '../util/RandomUtil';

import ConnectionPlugin from './ConnectionPlugin';
import JingleSessionPC from './JingleSessionPC';

const logger = getLogger(__filename);

// XXX Strophe is build around the idea of chaining function calls so allow long
// function call chains.
/* eslint-disable newline-per-chained-call */

/**
 * Reads a JSON-encoded message (from a "json-message" element) and extracts source descriptions. Adds the extracted
 * source descriptions to the given Jingle IQ in the standard Jingle format.
 *
 * Encoding sources in this compact JSON format instead of standard Jingle was introduced in order to reduce the
 * network traffic and load on the XMPP server. The format is described in Jicofo [TODO: insert link].
 *
 * @param {*} iq the IQ to which source descriptions will be added.
 * @param {*} jsonMessageXml The XML node for the "json-message" element.
 * @returns nothing.
 */
function expandSourcesFromJson(iq, jsonMessageXml) {

    let json;

    try {
        json = JSON.parse(jsonMessageXml.textContent);
    } catch (error) {
        logger.error(`json-message XML contained invalid JSON, ignoring: ${jsonMessageXml.textContent}`);

        return;
    }

    if (!json || !json.sources) {
        // It might be a message of a different type, no need to log.
        return;
    }

    // This is where we'll add "source" and "ssrc-group" elements. Create them elements if they don't exist.
    const videoRtpDescription = getOrCreateRtpDescription(iq, 'video');
    const audioRtpDescription = getOrCreateRtpDescription(iq, 'audio');

    for (const owner in json.sources) {
        if (json.sources.hasOwnProperty(owner)) {

            const ownerSources = json.sources[owner];

            // The video sources, video ssrc-groups, audio sources and audio ssrc-groups are encoded in that order in
            // the elements of the array.
            const videoSources = ownerSources && ownerSources.length > 0 && ownerSources[0];
            const videoSsrcGroups = ownerSources && ownerSources.length > 1 && ownerSources[1];
            const audioSources = ownerSources && ownerSources.length > 2 && ownerSources[2];
            const audioSsrcGroups = ownerSources && ownerSources.length > 3 && ownerSources[3];

            if (videoSources && videoSources.length > 0) {
                for (let i = 0; i < videoSources.length; i++) {
                    videoRtpDescription.appendChild(createSourceExtension(owner, videoSources[i]));
                }
            }
            if (videoSsrcGroups && videoSsrcGroups.length > 0) {
                for (let i = 0; i < videoSsrcGroups.length; i++) {
                    videoRtpDescription.appendChild(createSsrcGroupExtension(videoSsrcGroups[i]));
                }
            }
            if (audioSources && audioSources.length > 0) {
                for (let i = 0; i < audioSources.length; i++) {
                    audioRtpDescription.appendChild(createSourceExtension(owner, audioSources[i]));
                }
            }
            if (audioSsrcGroups && audioSsrcGroups.length > 0) {
                for (let i = 0; i < audioSsrcGroups.length; i++) {
                    audioRtpDescription.appendChild(createSsrcGroupExtension(audioSsrcGroups[i]));
                }
            }
        }
    }
}

/**
 * Creates a "source" XML element for the source described in compact JSON format in [sourceCompactJson].
 * @param {*} owner the endpoint ID of the owner of the source.
 * @param {*} sourceCompactJson the compact JSON representation of the source.
 * @returns the created "source" XML element.
 */
function createSourceExtension(owner, sourceCompactJson) {
    const node = $build('source', {
        xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0',
        ssrc: sourceCompactJson.s
    });

    if (sourceCompactJson.m) {
        node.c('parameter', {
            name: 'msid',
            value: sourceCompactJson.m
        }).up();
    }
    node.c('ssrc-info', {
        xmlns: 'http://jitsi.org/jitmeet',
        owner
    }).up();

    return node.node;
}

/**
 * Creates an "ssrc-group" XML element for the SSRC group described in compact JSON format in [ssrcGroupCompactJson].
 * @param {*} ssrcGroupCompactJson the compact JSON representation of the SSRC group.
 * @returns the created "ssrc-group" element.
 */
function createSsrcGroupExtension(ssrcGroupCompactJson) {
    const node = $build('ssrc-group', {
        xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0',
        semantics: getSemantics(ssrcGroupCompactJson[0])
    });

    for (let i = 1; i < ssrcGroupCompactJson.length; i++) {
        node.c('source', {
            xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0',
            ssrc: ssrcGroupCompactJson[i]
        }).up();
    }

    return node.node;
}

/**
 * Convert the short string representing SSRC group semantics in compact JSON format to the standard representation
 * (i.e. convert "f" to "FID" and "s" to "SIM").
 * @param {*} str the compact JSON format representation of an SSRC group's semantics.
 * @returns the SSRC group semantics corresponding to [str].
 */
function getSemantics(str) {
    if (str === 'f') {
        return 'FID';
    } else if (str === 's') {
        return 'SIM';
    }

    return null;
}

/**
 * Finds in a Jingle IQ the RTP description element with the given media type. If one does not exists, create it (as
 *  well as the required  "content" parent element) and adds it to the IQ.
 * @param {*} iq
 * @param {*} mediaType The media type, "audio" or "video".
 * @returns the RTP description element with the given media type.
 */
function getOrCreateRtpDescription(iq, mediaType) {
    const jingle = $(iq).find('jingle')[0];
    let content = $(jingle).find(`content[name="${mediaType}"]`);
    let description;

    if (content.length) {
        content = content[0];
    } else {
        // I'm not suree if "creator" and "senders" are required.
        content = $build('content', {
            name: mediaType
        }).node;
        jingle.appendChild(content);
    }

    description = $(content).find('description');

    if (description.length) {
        description = description[0];
    } else {
        description = $build('description', {
            xmlns: 'urn:xmpp:jingle:apps:rtp:1',
            media: mediaType
        }).node;
        content.appendChild(description);
    }

    return description;
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
        const sid = $(iq).find('jingle').attr('sid');
        const action = $(iq).find('jingle').attr('action');
        const fromJid = iq.getAttribute('from');

        // send ack first
        const ack = $iq({ type: 'result',
            to: fromJid,
            id: iq.getAttribute('id')
        });

        logger.debug(`on jingle ${action} from ${fromJid}`, iq);
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

        const jsonMessages = $(iq).find('jingle>json-message');

        if (jsonMessages && jsonMessages.length > 0) {
            logger.info(`Found a JSON-encoded element in ${action}, translating to standard Jingle.`);
            for (let i = 0; i < jsonMessages.length; i++) {
                expandSourcesFromJson(iq, jsonMessages[i]);
            }

            // TODO: is there a way to remove the json-message elements once we've extracted the information?
            // removeChild doesn't seem to work.
        }

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

            logger.info(
                `Marking session from ${fromJid
                } as ${isP2P ? '' : '*not*'} P2P`);

            const iceConfig = isP2P ? this.p2pIceConfig : this.jvbIceConfig;

            sess
                = new JingleSessionPC(
                    $(iq).find('jingle').attr('sid'),
                    $(iq).attr('to'),
                    fromJid,
                    this.connection,
                    this.mediaConstraints,

                    // Makes a copy in order to prevent exception thrown on RN when either this.p2pIceConfig or
                    // this.jvbIceConfig is modified and there's a PeerConnection instance holding a reference
                    JSON.parse(JSON.stringify(iceConfig)),
                    isP2P,
                    /* initiator */ false);

            this.sessions[sess.sid] = sess;

            this.eventEmitter.emit(XMPPEvents.CALL_INCOMING,
                sess, $(iq).find('>jingle'), now);
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
            logger.info('(TIME) Start transport replace:\t', now);
            Statistics.sendAnalytics(createJingleEvent(
                ACTION_JINGLE_TR_RECEIVED,
                {
                    p2p: isP2P,
                    value: now
                }));

            sess.replaceTransport($(iq).find('>jingle'), () => {
                const successTime = window.performance.now();

                logger.info('(TIME) Transport replace success:\t', successTime);
                Statistics.sendAnalytics(createJingleEvent(
                    ACTION_JINGLE_TR_SUCCESS,
                    {
                        p2p: isP2P,
                        value: successTime
                    }));
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
            $iq({ type: 'get',
                to: this.xmpp.options.hosts.domain })
                .c('services', { xmlns: 'urn:xmpp:extdisco:2' }),
            v2Res => this.onReceiveStunAndTurnCredentials(v2Res),
            v2Err => {
                logger.warn('getting turn credentials with extdisco:2 failed, trying extdisco:1', v2Err);
                this.connection.sendIQ(
                    $iq({ type: 'get',
                        to: this.xmpp.options.hosts.domain })
                        .c('services', { xmlns: 'urn:xmpp:extdisco:1' }),
                    v1Res => this.onReceiveStunAndTurnCredentials(v1Res),
                    v1Err => {
                        logger.warn('getting turn credentials failed', v1Err);
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
        const iceservers = [];

        $(res).find('>services>service').each((idx, el) => {
            // eslint-disable-next-line no-param-reassign
            el = $(el);
            const dict = {};
            const type = el.attr('type');

            switch (type) {
            case 'stun':
                dict.urls = `stun:${el.attr('host')}`;
                if (el.attr('port')) {
                    dict.urls += `:${el.attr('port')}`;
                }
                iceservers.push(dict);
                break;
            case 'turn':
            case 'turns': {
                dict.urls = `${type}:`;
                dict.username = el.attr('username');
                dict.urls += el.attr('host');
                const port = el.attr('port');

                if (port) {
                    dict.urls += `:${el.attr('port')}`;
                }
                const transport = el.attr('transport');

                if (transport && transport !== 'udp') {
                    dict.urls += `?transport=${transport}`;
                }

                dict.credential = el.attr('password')
                        || dict.credential;
                iceservers.push(dict);
                break;
            }
            }
        });

        const options = this.xmpp.options;

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
