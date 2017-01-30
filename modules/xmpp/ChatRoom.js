/* global Strophe, $, $pres, $iq, $msg */

import {getLogger} from "jitsi-meet-logger";
const logger = getLogger(__filename);
import Listenable from "../util/Listenable";
var XMPPEvents = require("../../service/xmpp/XMPPEvents");
var MediaType = require("../../service/RTC/MediaType");
var Moderator = require("./moderator");
var Recorder = require("./recording");
var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");

var parser = {
    packet2JSON: function (packet, nodes) {
        var self = this;
        $(packet).children().each(function () {
            var tagName = $(this).prop("tagName");
            const node = {
                tagName: tagName
            };
            node.attributes = {};
            $($(this)[0].attributes).each(function( index, attr ) {
                node.attributes[ attr.name ] = attr.value;
            });
            var text = Strophe.getText($(this)[0]);
            if (text) {
                node.value = text;
            }
            node.children = [];
            nodes.push(node);
            self.packet2JSON($(this), node.children);
        });
    },
    JSON2packet: function (nodes, packet) {
        for(let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if(!node || node === null){
                continue;
            }
            packet.c(node.tagName, node.attributes);
            if(node.value)
                packet.t(node.value);
            if(node.children)
                this.JSON2packet(node.children, packet);
            packet.up();
        }
        // packet.up();
    }
};

/**
 * Returns array of JS objects from the presence JSON associated with the passed nodeName
 * @param pres the presence JSON
 * @param nodeName the name of the node (videomuted, audiomuted, etc)
 */
function filterNodeFromPresenceJSON(pres, nodeName){
    var res = [];
    for(let i = 0; i < pres.length; i++)
        if(pres[i].tagName === nodeName)
            res.push(pres[i]);

    return res;
}

export default class ChatRoom extends Listenable {
    constructor(connection, jid, password, XMPP, options) {
        super();
        this.xmpp = XMPP;
        this.connection = connection;
        this.roomjid = Strophe.getBareJidFromJid(jid);
        this.myroomjid = jid;
        this.password = password;
        logger.info("Joined MUC as " + this.myroomjid);
        this.members = {};
        this.presMap = {};
        this.presHandlers = {};
        this.joined = false;
        this.role = null;
        this.focusMucJid = null;
        this.noBridgeAvailable = false;
        this.options = options || {};
        this.moderator = new Moderator(this.roomjid, this.xmpp, this.eventEmitter,
            {connection: this.xmpp.options, conference: this.options});
        this.initPresenceMap();
        this.session = null;
        this.lastPresences = {};
        this.phoneNumber = null;
        this.phonePin = null;
        this.connectionTimes = {};
        this.participantPropertyListener = null;

        this.locked = false;
    }

    initPresenceMap () {
        this.presMap['to'] = this.myroomjid;
        this.presMap['xns'] = 'http://jabber.org/protocol/muc';
        this.presMap["nodes"] = [];
        this.presMap["nodes"].push( {
            "tagName": "user-agent",
            "value": navigator.userAgent,
            "attributes": {xmlns: 'http://jitsi.org/jitmeet/user-agent'}
        });
        // We need to broadcast 'videomuted' status from the beginning, cause Jicofo
        // makes decisions based on that. Initialize it with 'false' here.
        this.addVideoInfoToPresence(false);
    }

    updateDeviceAvailability (devices) {
        this.presMap["nodes"].push( {
            "tagName": "devices",
            "children": [
                {
                    "tagName": "audio",
                    "value": devices.audio,
                },
                {
                    "tagName": "video",
                    "value": devices.video,
                }
            ]
        });
    }

    join (password) {
        this.password = password;
        var self = this;
        this.moderator.allocateConferenceFocus(function () {
            self.sendPresence(true);
        });
    }

    sendPresence (fromJoin) {
        var to = this.presMap['to'];
        if (!to || (!this.joined && !fromJoin)) {
            // Too early to send presence - not initialized
            return;
        }

        var pres = $pres({to: to });

        // xep-0045 defines: "including in the initial presence stanza an empty
        // <x/> element qualified by the 'http://jabber.org/protocol/muc' namespace"
        // and subsequent presences should not include that or it can be considered
        // as joining, and server can send us the message history for the room on
        // every presence
        if (fromJoin) {
            pres.c('x', {xmlns: this.presMap['xns']});

            if (this.password) {
                pres.c('password').t(this.password).up();
            }
            pres.up();
        }

        parser.JSON2packet(this.presMap.nodes, pres);
        this.connection.send(pres);
        if (fromJoin) {
            // XXX We're pressed for time here because we're beginning a complex
            // and/or lengthy conference-establishment process which supposedly
            // involves multiple RTTs. We don't have the time to wait for Strophe to
            // decide to send our IQ.
            this.connection.flush();
        }
    }

    /**
     * Sends the presence unavailable, signaling the server
     * we want to leave the room.
     */
    doLeave () {
        logger.log("do leave", this.myroomjid);
        var pres = $pres({to: this.myroomjid, type: 'unavailable' });
        this.presMap.length = 0;

        // XXX Strophe is asynchronously sending by default. Unfortunately, that
        // means that there may not be enough time to send the unavailable presence.
        // Switching Strophe to synchronous sending is not much of an option because
        // it may lead to a noticeable delay in navigating away from the current
        // location. As a compromise, we will try to increase the chances of sending
        // the unavailable presence within the short time span that we have upon
        // unloading by invoking flush() on the connection. We flush() once before
        // sending/queuing the unavailable presence in order to attemtp to have the
        // unavailable presence at the top of the send queue. We flush() once more
        // after sending/queuing the unavailable presence in order to attempt to
        // have it sent as soon as possible.
        this.connection.flush();
        this.connection.send(pres);
        this.connection.flush();
    }

    discoRoomInfo () {
      // https://xmpp.org/extensions/xep-0045.html#disco-roominfo

      var getInfo = $iq({type: 'get', to: this.roomjid})
        .c('query', {xmlns: Strophe.NS.DISCO_INFO});

      this.connection.sendIQ(getInfo, function (result) {
        var locked = $(result).find('>query>feature[var="muc_passwordprotected"]')
            .length === 1;
        if (locked != this.locked) {
          this.eventEmitter.emit(XMPPEvents.MUC_LOCK_CHANGED, locked);
          this.locked = locked;
        }
      }.bind(this), function (error) {
        GlobalOnErrorHandler.callErrorHandler(error);
        logger.error("Error getting room info: ", error);
      }.bind(this));
    }


    createNonAnonymousRoom () {
        // http://xmpp.org/extensions/xep-0045.html#createroom-reserved

        var getForm = $iq({type: 'get', to: this.roomjid})
            .c('query', {xmlns: 'http://jabber.org/protocol/muc#owner'})
            .c('x', {xmlns: 'jabber:x:data', type: 'submit'});

        var self = this;

        this.connection.sendIQ(getForm, function (form) {

            if (!$(form).find(
                    '>query>x[xmlns="jabber:x:data"]' +
                    '>field[var="muc#roomconfig_whois"]').length) {
                var errmsg = "non-anonymous rooms not supported";
                GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
                logger.error(errmsg);
                return;
            }

            var formSubmit = $iq({to: self.roomjid, type: 'set'})
                .c('query', {xmlns: 'http://jabber.org/protocol/muc#owner'});

            formSubmit.c('x', {xmlns: 'jabber:x:data', type: 'submit'});

            formSubmit.c('field', {'var': 'FORM_TYPE'})
                .c('value')
                .t('http://jabber.org/protocol/muc#roomconfig').up().up();

            formSubmit.c('field', {'var': 'muc#roomconfig_whois'})
                .c('value').t('anyone').up().up();

            self.connection.sendIQ(formSubmit);

        }, function (error) {
            GlobalOnErrorHandler.callErrorHandler(error);
            logger.error("Error getting room configuration form: ", error);
        });
    }

    onPresence (pres) {
        var from = pres.getAttribute('from');
        // Parse roles.
        var member = {};
        member.show = $(pres).find('>show').text();
        member.status = $(pres).find('>status').text();
        var mucUserItem
            = $(pres).find('>x[xmlns="http://jabber.org/protocol/muc#user"]>item');
        member.affiliation = mucUserItem.attr('affiliation');
        member.role = mucUserItem.attr('role');

        // Focus recognition
        var jid = mucUserItem.attr('jid');
        member.jid = jid;
        member.isFocus
            = jid && jid.indexOf(this.moderator.getFocusUserJid() + "/") === 0;
        member.isHiddenDomain
            = jid && jid.indexOf("@") > 0
                && this.options.hiddenDomain
                    === jid.substring(jid.indexOf("@") + 1, jid.indexOf("/"));

        $(pres).find(">x").remove();
        var nodes = [];
        parser.packet2JSON(pres, nodes);
        this.lastPresences[from] = nodes;
        let jibri = null;
        // process nodes to extract data needed for MUC_JOINED and MUC_MEMBER_JOINED
        // events
        for(let i = 0; i < nodes.length; i++)
        {
            const node = nodes[i];
            switch(node.tagName)
            {
                case "nick":
                    member.nick = node.value;
                    break;
                case "userId":
                    member.id = node.value;
                    break;
            }
        }

        if (from == this.myroomjid) {
            var newRole = member.affiliation == "owner"? member.role : "none";
            if (this.role !== newRole) {
                this.role = newRole;
                this.eventEmitter.emit(XMPPEvents.LOCAL_ROLE_CHANGED, this.role);
            }
            if (!this.joined) {
                this.joined = true;
                var now = this.connectionTimes["muc.joined"] =
                    window.performance.now();
                logger.log("(TIME) MUC joined:\t", now);

                // set correct initial state of locked
                if (this.password)
                    this.locked = true;

                this.eventEmitter.emit(XMPPEvents.MUC_JOINED);
            }
        } else if (this.members[from] === undefined) {
            // new participant
            this.members[from] = member;
            logger.log('entered', from, member);
            if (member.isFocus) {
                this._initFocus(from, jid);
            } else {
                this.eventEmitter.emit(
                    XMPPEvents.MUC_MEMBER_JOINED,
                    from, member.nick, member.role, member.isHiddenDomain);
            }
        } else {
            // Presence update for existing participant
            // Watch role change:
            var memberOfThis = this.members[from];
            if (memberOfThis.role != member.role) {
                memberOfThis.role = member.role;
                this.eventEmitter.emit(
                    XMPPEvents.MUC_ROLE_CHANGED, from, member.role);
            }

            if (member.isFocus) {
                // From time to time first few presences of the focus are not
                // containing it's jid. That way we can mark later the focus member
                // instead of not marking it at all and not starting the conference.
                // FIXME: Maybe there is a better way to handle this issue. It seems
                // there is some period of time in prosody that the configuration
                // form is received but not applied. And if any participant joins
                // during that period of time the first presence from the focus
                // won't conain <item jid="focus..." />.
                memberOfThis.isFocus = true;
                this._initFocus(from, jid);
            }

            // store the new display name
            if(member.displayName)
                memberOfThis.displayName = member.displayName;
        }

        // after we had fired member or room joined events, lets fire events
        // for the rest info we got in presence
        for(let i = 0; i < nodes.length; i++)
        {
            const node = nodes[i];
            switch(node.tagName)
            {
                case "nick":
                    if(!member.isFocus) {
                        var displayName = this.xmpp.options.displayJids
                            ? Strophe.getResourceFromJid(from) : member.nick;

                        if (displayName && displayName.length > 0) {
                            this.eventEmitter.emit(
                                XMPPEvents.DISPLAY_NAME_CHANGED, from, displayName);
                        }
                    }
                    break;
                case "bridgeNotAvailable":
                    if (member.isFocus && !this.noBridgeAvailable) {
                        this.noBridgeAvailable = true;
                        this.eventEmitter.emit(XMPPEvents.BRIDGE_DOWN);
                    }
                    break;
                case "jibri-recording-status":
                    jibri = node;
                    break;
                case "call-control":
                    var att = node.attributes;
                    if(!att)
                        break;
                    this.phoneNumber = att.phone || null;
                    this.phonePin = att.pin || null;
                    this.eventEmitter.emit(XMPPEvents.PHONE_NUMBER_CHANGED);
                    break;
                default:
                    this.processNode(node, from);
            }
        }

        // Trigger status message update
        if (member.status) {
            this.eventEmitter.emit(XMPPEvents.PRESENCE_STATUS, from, member.status);
        }

        if(jibri)
        {
            this.lastJibri = jibri;
            if(this.recording)
                this.recording.handleJibriPresence(jibri);
        }
    }

    /**
     * Initialize some properties when the focus participant is verified.
     * @param from jid of the focus
     * @param mucJid the jid of the focus in the muc
     */
    _initFocus (from, mucJid) {
        this.focusMucJid = from;
        if(!this.recording) {
            this.recording = new Recorder(this.options.recordingType,
                this.eventEmitter, this.connection, this.focusMucJid,
                this.options.jirecon, this.roomjid);
            if(this.lastJibri)
                this.recording.handleJibriPresence(this.lastJibri);
        }
        logger.info("Ignore focus: " + from + ", real JID: " + mucJid);
    }

    /**
     * Sets the special listener to be used for "command"s whose name starts with
     * "jitsi_participant_".
     */
    setParticipantPropertyListener (listener) {
        this.participantPropertyListener = listener;
    }

    /**
     * Makes the underlying JingleSession generate new SSRC for the recvonly
     * video stream.
     * @deprecated
     */
    generateRecvonlySsrc() {
        if (this.session) {
            this.session.generateRecvonlySsrc();
        } else {
            logger.warn("Unable to generate recvonly SSRC - no session");
        }
    }

    processNode (node, from) {
        // make sure we catch all errors coming from any handler
        // otherwise we can remove the presence handler from strophe
        try {
            var tagHandler = this.presHandlers[node.tagName];
            if (node.tagName.startsWith("jitsi_participant_")) {
                tagHandler = this.participantPropertyListener;
            }

            if(tagHandler) {
                tagHandler(node, Strophe.getResourceFromJid(from), from);
            }
        } catch (e) {
            GlobalOnErrorHandler.callErrorHandler(e);
            logger.error('Error processing:' + node.tagName + ' node.', e);
        }
    }

    sendMessage (body, nickname) {
        var msg = $msg({to: this.roomjid, type: 'groupchat'});
        msg.c('body', body).up();
        if (nickname) {
            msg.c('nick', {xmlns: 'http://jabber.org/protocol/nick'}).t(nickname).up().up();
        }
        this.connection.send(msg);
        this.eventEmitter.emit(XMPPEvents.SENDING_CHAT_MESSAGE, body);
    }

    setSubject (subject) {
        var msg = $msg({to: this.roomjid, type: 'groupchat'});
        msg.c('subject', subject);
        this.connection.send(msg);
    }

    /**
     * Called when participant leaves.
     * @param jid the jid of the participant that leaves
     * @param skipEvents optional params to skip any events, including check
     * whether this is the focus that left
     */
    onParticipantLeft (jid, skipEvents) {

        delete this.lastPresences[jid];

        if(skipEvents)
            return;

        this.eventEmitter.emit(XMPPEvents.MUC_MEMBER_LEFT, jid);

        this.moderator.onMucMemberLeft(jid);
    }

    onPresenceUnavailable (pres, from) {
        // room destroyed ?
        if ($(pres).find('>x[xmlns="http://jabber.org/protocol/muc#user"]' +
            '>destroy').length) {
            var reason;
            var reasonSelect = $(pres).find(
                    '>x[xmlns="http://jabber.org/protocol/muc#user"]' +
                    '>destroy>reason');
            if (reasonSelect.length) {
                reason = reasonSelect.text();
            }

            this._dispose();

            this.eventEmitter.emit(XMPPEvents.MUC_DESTROYED, reason);
            this.connection.emuc.doLeave(this.roomjid);
            return true;
        }

        // Status code 110 indicates that this notification is "self-presence".
        var isSelfPresence = $(pres).find(
                '>x[xmlns="http://jabber.org/protocol/muc#user"]>status[code="110"]'
            ).length !== 0;
        var isKick = $(pres).find(
                '>x[xmlns="http://jabber.org/protocol/muc#user"]>status[code="307"]'
            ).length !== 0;

        if (!isSelfPresence) {
            delete this.members[from];
            this.onParticipantLeft(from, false);
        }
        // If the status code is 110 this means we're leaving and we would like
        // to remove everyone else from our view, so we trigger the event.
        else if (Object.keys(this.members).length > 0) {
            for (const i in this.members) {
                const member = this.members[i];
                delete this.members[i];
                this.onParticipantLeft(i, member.isFocus);
            }
            this.connection.emuc.doLeave(this.roomjid);

            // we fire muc_left only if this is not a kick,
            // kick has both statuses 110 and 307.
            if (!isKick)
                this.eventEmitter.emit(XMPPEvents.MUC_LEFT);
        }

        if (isKick && this.myroomjid === from) {
            this._dispose();
            this.eventEmitter.emit(XMPPEvents.KICKED);
        }
    }

    onMessage (msg, from) {
        var nick =
            $(msg).find('>nick[xmlns="http://jabber.org/protocol/nick"]')
                .text() ||
            Strophe.getResourceFromJid(from);

        var txt = $(msg).find('>body').text();
        var type = msg.getAttribute("type");
        if (type == "error") {
            this.eventEmitter.emit(XMPPEvents.CHAT_ERROR_RECEIVED,
                $(msg).find('>text').text(), txt);
            return true;
        }

        var subject = $(msg).find('>subject');
        if (subject.length) {
            var subjectText = subject.text();
            if (subjectText || subjectText === "") {
                this.eventEmitter.emit(XMPPEvents.SUBJECT_CHANGED, subjectText);
                logger.log("Subject is changed to " + subjectText);
            }
        }

        // xep-0203 delay
        var stamp = $(msg).find('>delay').attr('stamp');

        if (!stamp) {
            // or xep-0091 delay, UTC timestamp
            stamp = $(msg).find('>[xmlns="jabber:x:delay"]').attr('stamp');

            if (stamp) {
                // the format is CCYYMMDDThh:mm:ss
                var dateParts = stamp.match(/(\d{4})(\d{2})(\d{2}T\d{2}:\d{2}:\d{2})/);
                stamp = dateParts[1] + "-" + dateParts[2] + "-" + dateParts[3] + "Z";
            }
        }

        if (from==this.roomjid && $(msg).find('>x[xmlns="http://jabber.org/protocol/muc#user"]>status[code="104"]').length) {
          this.discoRoomInfo();
        }

        if (txt) {
            logger.log('chat', nick, txt);
            this.eventEmitter.emit(XMPPEvents.MESSAGE_RECEIVED,
                from, nick, txt, this.myroomjid, stamp);
        }
    }

    onPresenceError (pres, from) {
        if ($(pres).find('>error[type="auth"]>not-authorized[xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"]').length) {
            logger.log('on password required', from);
            this.eventEmitter.emit(XMPPEvents.PASSWORD_REQUIRED);
        } else if ($(pres).find(
            '>error[type="cancel"]>not-allowed[xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"]').length) {
            var toDomain = Strophe.getDomainFromJid(pres.getAttribute('to'));
            if (toDomain === this.xmpp.options.hosts.anonymousdomain) {
                // enter the room by replying with 'not-authorized'. This would
                // result in reconnection from authorized domain.
                // We're either missing Jicofo/Prosody config for anonymous
                // domains or something is wrong.
                this.eventEmitter.emit(XMPPEvents.ROOM_JOIN_ERROR);

            } else {
                logger.warn('onPresError ', pres);
                this.eventEmitter.emit(XMPPEvents.ROOM_CONNECT_NOT_ALLOWED_ERROR);
            }
        } else if($(pres).find('>error>service-unavailable').length) {
            logger.warn('Maximum users limit for the room has been reached',
                pres);
            this.eventEmitter.emit(XMPPEvents.ROOM_MAX_USERS_ERROR);
        } else {
            logger.warn('onPresError ', pres);
            this.eventEmitter.emit(XMPPEvents.ROOM_CONNECT_ERROR);
        }
    }

    kick (jid) {
        var kickIQ = $iq({to: this.roomjid, type: 'set'})
            .c('query', {xmlns: 'http://jabber.org/protocol/muc#admin'})
            .c('item', {nick: Strophe.getResourceFromJid(jid), role: 'none'})
            .c('reason').t('You have been kicked.').up().up().up();

        this.connection.sendIQ(
            kickIQ,
            function (result) {
                logger.log('Kick participant with jid: ', jid, result);
            },
            function (error) {
                logger.log('Kick participant error: ', error);
            });
    }

    lockRoom (key, onSuccess, onError, onNotSupported) {
        //http://xmpp.org/extensions/xep-0045.html#roomconfig
        var ob = this;
        this.connection.sendIQ($iq({to: this.roomjid, type: 'get'}).c('query', {xmlns: 'http://jabber.org/protocol/muc#owner'}),
            function (res) {
                if ($(res).find('>query>x[xmlns="jabber:x:data"]>field[var="muc#roomconfig_roomsecret"]').length) {
                    var formsubmit = $iq({to: ob.roomjid, type: 'set'}).c('query', {xmlns: 'http://jabber.org/protocol/muc#owner'});
                    formsubmit.c('x', {xmlns: 'jabber:x:data', type: 'submit'});
                    formsubmit.c('field', {'var': 'FORM_TYPE'}).c('value').t('http://jabber.org/protocol/muc#roomconfig').up().up();
                    formsubmit.c('field', {'var': 'muc#roomconfig_roomsecret'}).c('value').t(key).up().up();
                    // Fixes a bug in prosody 0.9.+ https://code.google.com/p/lxmppd/issues/detail?id=373
                    formsubmit.c('field', {'var': 'muc#roomconfig_whois'}).c('value').t('anyone').up().up();
                    // FIXME: is muc#roomconfig_passwordprotectedroom required?
                    ob.connection.sendIQ(formsubmit,
                        onSuccess,
                        onError);
                } else {
                    onNotSupported();
                }
            }, onError);
    }

    addToPresence (key, values) {
        values.tagName = key;
        this.removeFromPresence(key);
        this.presMap.nodes.push(values);
    }

    removeFromPresence (key) {
        var nodes = this.presMap.nodes.filter(function(node) {
            return key !== node.tagName;});
        this.presMap.nodes = nodes;
    }

    addPresenceListener (name, handler) {
        this.presHandlers[name] = handler;
    }

    removePresenceListener (name) {
        delete this.presHandlers[name];
    }

    /**
     * Checks if the user identified by given <tt>mucJid</tt> is the conference
     * focus.
     * @param mucJid the full MUC address of the user to be checked.
     * @returns {boolean|null} <tt>true</tt> if MUC user is the conference focus or
     * <tt>false</tt> if is not. When given <tt>mucJid</tt> does not exist in
     * the MUC then <tt>null</tt> is returned.
     */
    isFocus (mucJid) {
        var member = this.members[mucJid];
        if (member) {
            return member.isFocus;
        } else {
            return null;
        }
    }

    isModerator () {
        return this.role === 'moderator';
    }

    getMemberRole (peerJid) {
        if (this.members[peerJid]) {
            return this.members[peerJid].role;
        }
        return null;
    }

    setJingleSession (session){
        this.session = session;
    }

    /**
     * Replaces oldStream with newStream and performs a single offer/answer
     *  cycle after both operations are done.  Either oldStream or newStream
     *  can be null; replacing a valid 'oldStream' with a null 'newStream'
     *  effectively just removes 'oldStream'
     * @param oldStream the current stream in use to be replaced
     * @param newStream the new stream to use
     * @returns {Promise}
     */
    replaceStream (oldStream, newStream) {
        if (this.session) {
            return this.session.replaceStream(oldStream, newStream);
        }
        return Promise.resolve();
    }

    /**
     * Remove stream.
     * @param stream stream that will be removed.
     * @param callback callback executed after successful stream removal.
     * @param errorCallback callback executed if stream removal fail.
     * @param ssrcInfo object with information about the SSRCs associated with the
     * stream.
     */
    removeStream (stream, callback, errorCallback, ssrcInfo) {
        if(!this.session) {
            callback();
            return;
        }
        this.session.removeStream(stream, callback, errorCallback, ssrcInfo);
    }

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
    addStream (stream, callback, errorCallback, ssrcInfo, dontModifySources) {
        if(this.session) {
            // FIXME: will block switchInProgress on true value in case of exception
            this.session.addStream(stream, callback, errorCallback, ssrcInfo,
                dontModifySources);
        } else {
            // We are done immediately
            logger.warn("No conference handler or conference not started yet");
            callback();
        }
    }

    /**
     * Generate ssrc info object for a stream with the following properties:
     * - ssrcs - Array of the ssrcs associated with the stream.
     * - groups - Array of the groups associated with the stream.
     */
    generateNewStreamSSRCInfo () {
        if(!this.session) {
            logger.warn("The call haven't been started. " +
                "Cannot generate ssrc info at the moment!");
            return null;
        }
        return this.session.generateNewStreamSSRCInfo();
    }

    setVideoMute (mute, callback) {
        this.sendVideoInfoPresence(mute);
        if(callback)
            callback(mute);
    }

    setAudioMute (mute, callback) {
        return this.sendAudioInfoPresence(mute, callback);
    }

    addAudioInfoToPresence (mute) {
        this.removeFromPresence("audiomuted");
        this.addToPresence("audiomuted",
            {attributes:
            {"xmlns": "http://jitsi.org/jitmeet/audio"},
                value: mute.toString()});
    }

    sendAudioInfoPresence  (mute, callback) {
        this.addAudioInfoToPresence(mute);
        if(this.connection) {
            this.sendPresence();
        }
        if(callback)
            callback();
    }

    addVideoInfoToPresence (mute) {
        this.removeFromPresence("videomuted");
        this.addToPresence("videomuted",
            {attributes:
            {"xmlns": "http://jitsi.org/jitmeet/video"},
                value: mute.toString()});
    }

    sendVideoInfoPresence (mute) {
        this.addVideoInfoToPresence(mute);
        if(!this.connection)
            return;
        this.sendPresence();
    }

    remoteTrackAdded (data) {
        // Will figure out current muted status by looking up owner's presence
        var pres = this.lastPresences[data.owner];
        if(pres) {
            var mediaType = data.mediaType;
            var mutedNode = null;
            if (mediaType === MediaType.AUDIO) {
                mutedNode = filterNodeFromPresenceJSON(pres, "audiomuted");
            } else if (mediaType === MediaType.VIDEO) {
                mutedNode = filterNodeFromPresenceJSON(pres, "videomuted");
                var videoTypeNode = filterNodeFromPresenceJSON(pres, "videoType");
                if(videoTypeNode
                    && videoTypeNode.length > 0
                    && videoTypeNode[0])
                    data.videoType = videoTypeNode[0]["value"];
            } else {
                logger.warn("Unsupported media type: " + mediaType);
                data.muted = null;
            }

            if (mutedNode) {
                data.muted = mutedNode.length > 0 &&
                             mutedNode[0] &&
                             mutedNode[0]["value"] === "true";
            }
        }

        this.eventEmitter.emit(XMPPEvents.REMOTE_TRACK_ADDED, data);
    }

    /**
     * Returns true if the recording is supproted and false if not.
     */
    isRecordingSupported () {
        if(this.recording)
            return this.recording.isSupported();
        return false;
    }

    /**
     * Returns null if the recording is not supported, "on" if the recording started
     * and "off" if the recording is not started.
     */
    getRecordingState () {
        return (this.recording) ? this.recording.getState() : undefined;
    }

    /**
     * Returns the url of the recorded video.
     */
    getRecordingURL () {
        return (this.recording) ? this.recording.getURL() : null;
    }

    /**
     * Starts/stops the recording
     * @param token token for authentication
     * @param statusChangeHandler {function} receives the new status as argument.
     */
    toggleRecording (options, statusChangeHandler) {
        if(this.recording)
            return this.recording.toggleRecording(options, statusChangeHandler);

        return statusChangeHandler("error",
            new Error("The conference is not created yet!"));
    }

    /**
     * Returns true if the SIP calls are supported and false otherwise
     */
    isSIPCallingSupported () {
        if(this.moderator)
            return this.moderator.isSipGatewayEnabled();
        return false;
    }

    /**
     * Dials a number.
     * @param number the number
     */
    dial (number) {
        return this.connection.rayo.dial(number, "fromnumber",
            Strophe.getNodeFromJid(this.myroomjid), this.password,
            this.focusMucJid);
    }

    /**
     * Hangup an existing call
     */
    hangup () {
        return this.connection.rayo.hangup();
    }

    /**
     * Returns the phone number for joining the conference.
     */
    getPhoneNumber () {
        return this.phoneNumber;
    }

    /**
     * Returns the pin for joining the conference with phone.
     */
    getPhonePin () {
        return this.phonePin;
    }

    /**
     * Returns the connection state for the current session.
     */
    getConnectionState () {
        if(!this.session)
            return null;
        return this.session.getIceConnectionState();
    }

    /**
     * Mutes remote participant.
     * @param jid of the participant
     * @param mute
     */
    muteParticipant (jid, mute) {
        logger.info("set mute", mute);
        var iqToFocus = $iq(
            {to: this.focusMucJid, type: 'set'})
            .c('mute', {
                xmlns: 'http://jitsi.org/jitmeet/audio',
                jid: jid
            })
            .t(mute.toString())
            .up();

        this.connection.sendIQ(
            iqToFocus,
            function (result) {
                logger.log('set mute', result);
            },
            function (error) {
                logger.log('set mute error', error);
            });
    }

    onMute (iq) {
        var from = iq.getAttribute('from');
        if (from !== this.focusMucJid) {
            logger.warn("Ignored mute from non focus peer");
            return false;
        }
        var mute = $(iq).find('mute');
        if (mute.length) {
            var doMuteAudio = mute.text() === "true";
            this.eventEmitter.emit(XMPPEvents.AUDIO_MUTED_BY_FOCUS, doMuteAudio);
        }
        return true;
    }

    /**
     * Leaves the room. Closes the jingle session.
     * @returns {Promise} which is resolved if XMPPEvents.MUC_LEFT is received less
     * than 5s after sending presence unavailable. Otherwise the promise is
     * rejected.
     */
    leave () {
        this._dispose();
        return new Promise((resolve, reject) => {
            let timeout = setTimeout(() => onMucLeft(true), 5000);
            let eventEmitter = this.eventEmitter;
            function onMucLeft(doReject = false) {
                eventEmitter.removeListener(XMPPEvents.MUC_LEFT, onMucLeft);
                clearTimeout(timeout);
                if(doReject) {
                    // the timeout expired
                    reject(new Error("The timeout for the confirmation about " +
                        "leaving the room expired."));
                } else {
                    resolve();
                }
            }
            eventEmitter.on(XMPPEvents.MUC_LEFT, onMucLeft);
            this.doLeave();
        });
    }

    /**
     * Disposes the conference, closes the jingle session.
     */
    _dispose () {
        if (this.session) {
            this.session.close();
        }
    }
}
