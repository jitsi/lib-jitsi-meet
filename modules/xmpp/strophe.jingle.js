/* jshint -W117 */


var logger = require("jitsi-meet-logger").getLogger(__filename);
var JingleSession = require("./JingleSessionPC");
var XMPPEvents = require("../../service/xmpp/XMPPEvents");
var RTCBrowserType = require("../RTC/RTCBrowserType");


module.exports = function(XMPP, eventEmitter) {
    Strophe.addConnectionPlugin('jingle', {
        connection: null,
        sessions: {},
        ice_config: {iceServers: []},
        media_constraints: {
            mandatory: {
                'OfferToReceiveAudio': true,
                'OfferToReceiveVideo': true
            }
            // MozDontOfferDataChannel: true when this is firefox
        },
        init: function (conn) {
            this.connection = conn;
            var disco = conn.disco;
            if (disco) {
                // http://xmpp.org/extensions/xep-0167.html#support
                // http://xmpp.org/extensions/xep-0176.html#support
                disco.addFeature('urn:xmpp:jingle:1');
                disco.addFeature('urn:xmpp:jingle:apps:rtp:1');
                disco.addFeature('urn:xmpp:jingle:transports:ice-udp:1');
                disco.addFeature('urn:xmpp:jingle:apps:dtls:0');
                disco.addFeature('urn:xmpp:jingle:transports:dtls-sctp:1');
                disco.addFeature('urn:xmpp:jingle:apps:rtp:audio');
                disco.addFeature('urn:xmpp:jingle:apps:rtp:video');

                // Lipsync
                if (RTCBrowserType.isChrome()) {
                    this.connection.disco.addFeature(
                        'http://jitsi.org/meet/lipsync');
                }

                if (RTCBrowserType.isChrome() || RTCBrowserType.isOpera()
                    || RTCBrowserType.isTemasysPluginUsed()) {
                    disco.addFeature('urn:ietf:rfc:4588');
                }

                // this is dealt with by SDP O/A so we don't need to announce this
                //disco.addFeature('urn:xmpp:jingle:apps:rtp:rtcp-fb:0'); // XEP-0293
                //disco.addFeature('urn:xmpp:jingle:apps:rtp:rtp-hdrext:0'); // XEP-0294

                disco.addFeature('urn:ietf:rfc:5761'); // rtcp-mux
                disco.addFeature('urn:ietf:rfc:5888'); // a=group, e.g. bundle

                //disco.addFeature('urn:ietf:rfc:5576'); // a=ssrc
            }
            this.connection.addHandler(this.onJingle.bind(this), 'urn:xmpp:jingle:1', 'iq', 'set', null, null);
        },
        onJingle: function (iq) {
            var sid = $(iq).find('jingle').attr('sid');
            var action = $(iq).find('jingle').attr('action');
            var fromJid = iq.getAttribute('from');
            // send ack first
            var ack = $iq({type: 'result',
                to: fromJid,
                id: iq.getAttribute('id')
            });
            logger.log('on jingle ' + action + ' from ' + fromJid, iq);
            var sess = this.sessions[sid];
            if ('session-initiate' != action) {
                if (!sess) {
                    ack.attrs({ type: 'error' });
                    ack.c('error', {type: 'cancel'})
                        .c('item-not-found', {xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas'}).up()
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
            // see http://xmpp.org/extensions/xep-0166.html#concepts-session
            switch (action) {
                case 'session-initiate':
                    var now = window.performance.now();
                    logger.log("(TIME) received session-initiate:\t", now);
                    var startMuted = $(iq).find('jingle>startmuted');
                    if (startMuted && startMuted.length > 0) {
                        var audioMuted = startMuted.attr("audio");
                        var videoMuted = startMuted.attr("video");
                        eventEmitter.emit(XMPPEvents.START_MUTED_FROM_FOCUS,
                                audioMuted === "true", videoMuted === "true");
                    }
                    sess = new JingleSession(
                            $(iq).attr('to'), $(iq).find('jingle').attr('sid'),
                            fromJid,
                            this.connection,
                            this.media_constraints,
                            this.ice_config, XMPP);

                    this.sessions[sess.sid] = sess;

                    var jingleOffer = $(iq).find('>jingle');
                    // FIXME there's no nice way with event to get the reason
                    // why the call was rejected
                    eventEmitter.emit(XMPPEvents.CALL_INCOMING, sess, jingleOffer, now);
                    if (!sess.active())
                    {
                        // Call not accepted
                        ack.attrs({ type: 'error' });
                        ack.c('error', {type: 'cancel'})
                           .c('bad-request',
                            { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' })
                            .up();
                        this.terminate(sess.sid);
                    }
                    break;
                case 'session-terminate':
                    logger.log('terminating...', sess.sid);
                    var reasonCondition = null;
                    var reasonText = null;
                    if ($(iq).find('>jingle>reason').length) {
                        reasonCondition
                            = $(iq).find('>jingle>reason>:first')[0].tagName;
                        reasonText = $(iq).find('>jingle>reason>text').text();
                    }
                    this.terminate(sess.sid, reasonCondition, reasonText);
                    break;
                case 'transport-replace':
                    logger.info("(TIME) Start transport replace",
                                window.performance.now());
                    sess.replaceTransport($(iq).find('>jingle'),
                        function () {
                            logger.info(
                                "(TIME) Transport replace success!",
                                window.performance.now());
                        },
                        function(error) {
                            logger.error('Transport replace failed', error);
                            sess.sendTransportReject();
                        });
                    break;
                case 'addsource': // FIXME: proprietary, un-jingleish
                case 'source-add': // FIXME: proprietary
                    sess.addSource($(iq).find('>jingle>content'));
                    break;
                case 'removesource': // FIXME: proprietary, un-jingleish
                case 'source-remove': // FIXME: proprietary
                    sess.removeSource($(iq).find('>jingle>content'));
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
        },
        terminate: function (sid, reasonCondition, reasonText) {
            if (this.sessions.hasOwnProperty(sid)) {
                if (this.sessions[sid].state != 'ended') {
                    this.sessions[sid].onTerminated(reasonCondition, reasonText);
                }
                delete this.sessions[sid];
            }
        },
        getStunAndTurnCredentials: function () {
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
            var self = this;
            this.connection.sendIQ(
                $iq({type: 'get', to: this.connection.domain})
                    .c('services', {xmlns: 'urn:xmpp:extdisco:1'}).c('service', {host: 'turn.' + this.connection.domain}),
                function (res) {
                    var iceservers = [];
                    $(res).find('>services>service').each(function (idx, el) {
                        el = $(el);
                        var dict = {};
                        var type = el.attr('type');
                        switch (type) {
                            case 'stun':
                                dict.url = 'stun:' + el.attr('host');
                                if (el.attr('port')) {
                                    dict.url += ':' + el.attr('port');
                                }
                                iceservers.push(dict);
                                break;
                            case 'turn':
                            case 'turns':
                                dict.url = type + ':';
                                if (el.attr('username')) { // https://code.google.com/p/webrtc/issues/detail?id=1508
                                    if (navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./) && parseInt(navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)[2], 10) < 28) {
                                        dict.url += el.attr('username') + '@';
                                    } else {
                                        dict.username = el.attr('username'); // only works in M28
                                    }
                                }
                                dict.url += el.attr('host');
                                if (el.attr('port') && el.attr('port') != '3478') {
                                    dict.url += ':' + el.attr('port');
                                }
                                if (el.attr('transport') && el.attr('transport') != 'udp') {
                                    dict.url += '?transport=' + el.attr('transport');
                                }
                                if (el.attr('password')) {
                                    dict.credential = el.attr('password');
                                }
                                iceservers.push(dict);
                                break;
                        }
                    });
                    self.ice_config.iceServers = iceservers;
                },
                function (err) {
                    logger.warn('getting turn credentials failed', err);
                    logger.warn('is mod_turncredentials or similar installed?');
                }
            );
            // implement push?
        },

        /**
         * Returns the data saved in 'updateLog' in a format to be logged.
         */
        getLog: function () {
            var data = {};
            var self = this;
            Object.keys(this.sessions).forEach(function (sid) {
                var session = self.sessions[sid];
                if (session.peerconnection && session.peerconnection.updateLog) {
                    // FIXME: should probably be a .dump call
                    data["jingle_" + session.sid] = {
                        updateLog: session.peerconnection.updateLog,
                        stats: session.peerconnection.stats,
                        url: window.location.href
                    };
                }
            });
            return data;
        }
    });
};
