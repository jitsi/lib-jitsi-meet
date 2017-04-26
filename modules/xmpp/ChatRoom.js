/* global $, $pres, $iq, $msg, __filename, Strophe */
import { getLogger } from 'jitsi-meet-logger';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import Listenable from '../util/Listenable';
import * as MediaType from '../../service/RTC/MediaType';
import Moderator from './moderator';
import Recorder from './recording';
import XMPPEvents from '../../service/xmpp/XMPPEvents';

const logger = getLogger(__filename);

const parser = {
    packet2JSON(packet, nodes) {
        const self = this;

        // eslint-disable-next-line newline-per-chained-call
        $(packet).children().each(function() {
            // eslint-disable-next-line no-invalid-this
            const tagName = $(this).prop('tagName');
            const node = {
                tagName
            };

            node.attributes = {};

            // eslint-disable-next-line no-invalid-this
            $($(this)[0].attributes).each((index, attr) => {
                node.attributes[attr.name] = attr.value;
            });

            // eslint-disable-next-line no-invalid-this
            const text = Strophe.getText($(this)[0]);

            if (text) {
                node.value = text;
            }
            node.children = [];
            nodes.push(node);

            // eslint-disable-next-line no-invalid-this
            self.packet2JSON($(this), node.children);
        });
    },
    json2packet(nodes, packet) {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            if (node) {
                packet.c(node.tagName, node.attributes);
                if (node.value) {
                    packet.t(node.value);
                }
                if (node.children) {
                    this.json2packet(node.children, packet);
                }
                packet.up();
            }
        }

        // packet.up();
    }
};

/**
 * Returns array of JS objects from the presence JSON associated with the passed
 / nodeName
 * @param pres the presence JSON
 * @param nodeName the name of the node (videomuted, audiomuted, etc)
 */
function filterNodeFromPresenceJSON(pres, nodeName) {
    const res = [];

    for (let i = 0; i < pres.length; i++) {
        if (pres[i].tagName === nodeName) {
            res.push(pres[i]);
        }
    }

    return res;
}

// XXX As ChatRoom constructs XMPP stanzas and Strophe is build around the idea
// of chaining function calls, allow long function call chains.
/* eslint-disable newline-per-chained-call */

/**
 *
 */
export default class ChatRoom extends Listenable {

    /* eslint-disable max-params */

    /**
     *
     * @param connection
     * @param jid
     * @param password
     * @param XMPP
     * @param options
     */
    constructor(connection, jid, password, XMPP, options) {
        super();
        this.xmpp = XMPP;
        this.connection = connection;
        this.roomjid = Strophe.getBareJidFromJid(jid);
        this.myroomjid = jid;
        this.password = password;
        logger.info(`Joined MUC as ${this.myroomjid}`);
        this.members = {};
        this.presMap = {};
        this.presHandlers = {};
        this.joined = false;
        this.role = null;
        this.focusMucJid = null;
        this.noBridgeAvailable = false;
        this.options = options || {};
        this.moderator
            = new Moderator(this.roomjid, this.xmpp, this.eventEmitter, {
                connection: this.xmpp.options,
                conference: this.options
            });
        this.initPresenceMap();
        this.lastPresences = {};
        this.phoneNumber = null;
        this.phonePin = null;
        this.connectionTimes = {};
        this.participantPropertyListener = null;

        this.locked = false;
    }

    /* eslint-enable max-params */

    /**
     *
     */
    initPresenceMap() {
        this.presMap.to = this.myroomjid;
        this.presMap.xns = 'http://jabber.org/protocol/muc';
        this.presMap.nodes = [];
        this.presMap.nodes.push({
            'tagName': 'user-agent',
            'value': navigator.userAgent,
            'attributes': { xmlns: 'http://jitsi.org/jitmeet/user-agent' }
        });

        // We need to broadcast 'videomuted' status from the beginning, cause
        // Jicofo makes decisions based on that. Initialize it with 'false'
        // here.
        this.addVideoInfoToPresence(false);
    }

    /**
     *
     * @param devices
     */
    updateDeviceAvailability(devices) {
        this.presMap.nodes.push({
            'tagName': 'devices',
            'children': [
                {
                    'tagName': 'audio',
                    'value': devices.audio
                },
                {
                    'tagName': 'video',
                    'value': devices.video
                }
            ]
        });
    }

    /**
     *
     * @param password
     */
    join(password) {
        this.password = password;
        this.moderator.allocateConferenceFocus(() => this.sendPresence(true));
    }

    /**
     *
     * @param fromJoin
     */
    sendPresence(fromJoin) {
        const to = this.presMap.to;

        if (!to || (!this.joined && !fromJoin)) {
            // Too early to send presence - not initialized
            return;
        }

        const pres = $pres({ to });

        // xep-0045 defines: "including in the initial presence stanza an empty
        // <x/> element qualified by the 'http://jabber.org/protocol/muc'
        // namespace" and subsequent presences should not include that or it can
        // be considered as joining, and server can send us the message history
        // for the room on every presence
        if (fromJoin) {
            pres.c('x', { xmlns: this.presMap.xns });

            if (this.password) {
                pres.c('password').t(this.password).up();
            }
            pres.up();
        }

        parser.json2packet(this.presMap.nodes, pres);
        this.connection.send(pres);
        if (fromJoin) {
            // XXX We're pressed for time here because we're beginning a complex
            // and/or lengthy conference-establishment process which supposedly
            // involves multiple RTTs. We don't have the time to wait for
            // Strophe to decide to send our IQ.
            this.connection.flush();
        }
    }

    /**
     * Sends the presence unavailable, signaling the server
     * we want to leave the room.
     */
    doLeave() {
        logger.log('do leave', this.myroomjid);
        const pres = $pres({ to: this.myroomjid,
            type: 'unavailable' });

        this.presMap.length = 0;

        // XXX Strophe is asynchronously sending by default. Unfortunately, that
        // means that there may not be enough time to send the unavailable
        // presence. Switching Strophe to synchronous sending is not much of an
        // option because it may lead to a noticeable delay in navigating away
        // from the current location. As a compromise, we will try to increase
        // the chances of sending the unavailable presence within the short time
        // span that we have upon unloading by invoking flush() on the
        // connection. We flush() once before sending/queuing the unavailable
        // presence in order to attemtp to have the unavailable presence at the
        // top of the send queue. We flush() once more after sending/queuing the
        // unavailable presence in order to attempt to have it sent as soon as
        // possible.
        this.connection.flush();
        this.connection.send(pres);
        this.connection.flush();
    }

    /**
     *
     */
    discoRoomInfo() {
      // https://xmpp.org/extensions/xep-0045.html#disco-roominfo

        const getInfo = $iq({ type: 'get',
            to: this.roomjid })
        .c('query', { xmlns: Strophe.NS.DISCO_INFO });

        this.connection.sendIQ(getInfo, result => {
            const locked
                = $(result).find('>query>feature[var="muc_passwordprotected"]')
                        .length
                    === 1;

            if (locked !== this.locked) {
                this.eventEmitter.emit(XMPPEvents.MUC_LOCK_CHANGED, locked);
                this.locked = locked;
            }
        }, error => {
            GlobalOnErrorHandler.callErrorHandler(error);
            logger.error('Error getting room info: ', error);
        });
    }

    /**
     *
     */
    createNonAnonymousRoom() {
        // http://xmpp.org/extensions/xep-0045.html#createroom-reserved

        const getForm = $iq({ type: 'get',
            to: this.roomjid })
            .c('query', { xmlns: 'http://jabber.org/protocol/muc#owner' })
            .c('x', { xmlns: 'jabber:x:data',
                type: 'submit' });

        const self = this;

        this.connection.sendIQ(getForm, form => {
            if (!$(form).find(
                    '>query>x[xmlns="jabber:x:data"]'
                    + '>field[var="muc#roomconfig_whois"]').length) {
                const errmsg = 'non-anonymous rooms not supported';

                GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
                logger.error(errmsg);

                return;
            }

            const formSubmit = $iq({ to: self.roomjid,
                type: 'set' })
                .c('query', { xmlns: 'http://jabber.org/protocol/muc#owner' });

            formSubmit.c('x', { xmlns: 'jabber:x:data',
                type: 'submit' });

            formSubmit.c('field', { 'var': 'FORM_TYPE' })
                .c('value')
                .t('http://jabber.org/protocol/muc#roomconfig').up().up();

            formSubmit.c('field', { 'var': 'muc#roomconfig_whois' })
                .c('value').t('anyone').up().up();

            self.connection.sendIQ(formSubmit);

        }, error => {
            GlobalOnErrorHandler.callErrorHandler(error);
            logger.error('Error getting room configuration form: ', error);
        });
    }

    /**
     *
     * @param pres
     */
    onPresence(pres) {
        const from = pres.getAttribute('from');

        // Parse roles.
        const member = {};

        member.show = $(pres).find('>show').text();
        member.status = $(pres).find('>status').text();
        const mucUserItem
            = $(pres).find(
                '>x[xmlns="http://jabber.org/protocol/muc#user"]>item');

        member.affiliation = mucUserItem.attr('affiliation');
        member.role = mucUserItem.attr('role');

        // Focus recognition
        const jid = mucUserItem.attr('jid');

        member.jid = jid;
        member.isFocus
            = jid && jid.indexOf(`${this.moderator.getFocusUserJid()}/`) === 0;
        member.isHiddenDomain
            = jid && jid.indexOf('@') > 0
                && this.options.hiddenDomain
                    === jid.substring(jid.indexOf('@') + 1, jid.indexOf('/'));

        $(pres).find('>x').remove();
        const nodes = [];

        parser.packet2JSON(pres, nodes);
        this.lastPresences[from] = nodes;
        let jibri = null;

        // process nodes to extract data needed for MUC_JOINED and
        // MUC_MEMBER_JOINED events

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            switch (node.tagName) {
            case 'nick':
                member.nick = node.value;
                break;
            case 'userId':
                member.id = node.value;
                break;
            }
        }

        if (from === this.myroomjid) {
            const newRole
                = member.affiliation === 'owner' ? member.role : 'none';

            if (this.role !== newRole) {
                this.role = newRole;
                this.eventEmitter.emit(
                    XMPPEvents.LOCAL_ROLE_CHANGED,
                    this.role);
            }
            if (!this.joined) {
                this.joined = true;
                const now = this.connectionTimes['muc.joined']
                    = window.performance.now();

                logger.log('(TIME) MUC joined:\t', now);

                // set correct initial state of locked
                if (this.password) {
                    this.locked = true;
                }

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
            const memberOfThis = this.members[from];

            if (memberOfThis.role !== member.role) {
                memberOfThis.role = member.role;
                this.eventEmitter.emit(
                    XMPPEvents.MUC_ROLE_CHANGED, from, member.role);
            }

            if (member.isFocus) {
                // From time to time first few presences of the focus are not
                // containing it's jid. That way we can mark later the focus
                // member instead of not marking it at all and not starting the
                // conference.
                // FIXME: Maybe there is a better way to handle this issue. It
                // seems there is some period of time in prosody that the
                // configuration form is received but not applied. And if any
                // participant joins during that period of time the first
                // presence from the focus won't conain <item jid="focus..." />.
                memberOfThis.isFocus = true;
                this._initFocus(from, jid);
            }

            // store the new display name
            if (member.displayName) {
                memberOfThis.displayName = member.displayName;
            }
        }

        // after we had fired member or room joined events, lets fire events
        // for the rest info we got in presence
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            switch (node.tagName) {
            case 'nick':
                if (!member.isFocus) {
                    const displayName = this.xmpp.options.displayJids
                            ? Strophe.getResourceFromJid(from) : member.nick;

                    if (displayName && displayName.length > 0) {
                        this.eventEmitter.emit(
                            XMPPEvents.DISPLAY_NAME_CHANGED,
                            from,
                            displayName);
                    }
                }
                break;
            case 'bridgeNotAvailable':
                if (member.isFocus && !this.noBridgeAvailable) {
                    this.noBridgeAvailable = true;
                    this.eventEmitter.emit(XMPPEvents.BRIDGE_DOWN);
                }
                break;
            case 'jibri-recording-status':
                jibri = node;
                break;
            case 'call-control': {
                const att = node.attributes;

                if (!att) {
                    break;
                }
                this.phoneNumber = att.phone || null;
                this.phonePin = att.pin || null;
                this.eventEmitter.emit(XMPPEvents.PHONE_NUMBER_CHANGED);
                break;
            }
            default:
                this.processNode(node, from);
            }
        }

        // Trigger status message update
        if (member.status) {
            this.eventEmitter.emit(
                XMPPEvents.PRESENCE_STATUS,
                from,
                member.status);
        }

        if (jibri) {
            this.lastJibri = jibri;
            if (this.recording) {
                this.recording.handleJibriPresence(jibri);
            }
        }
    }

    /**
     * Initialize some properties when the focus participant is verified.
     * @param from jid of the focus
     * @param mucJid the jid of the focus in the muc
     */
    _initFocus(from, mucJid) {
        this.focusMucJid = from;
        if (!this.recording) {
            this.recording = new Recorder(this.options.recordingType,
                this.eventEmitter, this.connection, this.focusMucJid,
                this.options.jirecon, this.roomjid);
            if (this.lastJibri) {
                this.recording.handleJibriPresence(this.lastJibri);
            }
        }
        logger.info(`Ignore focus: ${from}, real JID: ${mucJid}`);
    }

    /**
     * Sets the special listener to be used for "command"s whose name starts
     * with "jitsi_participant_".
     */
    setParticipantPropertyListener(listener) {
        this.participantPropertyListener = listener;
    }

    /**
     *
     * @param node
     * @param from
     */
    processNode(node, from) {
        // make sure we catch all errors coming from any handler
        // otherwise we can remove the presence handler from strophe
        try {
            let tagHandlers = this.presHandlers[node.tagName];

            if (node.tagName.startsWith('jitsi_participant_')) {
                tagHandlers = [ this.participantPropertyListener ];
            }

            if (tagHandlers) {
                tagHandlers.forEach(handler => {
                    handler(node, Strophe.getResourceFromJid(from), from);
                });
            }
        } catch (e) {
            GlobalOnErrorHandler.callErrorHandler(e);
            logger.error(`Error processing:${node.tagName} node.`, e);
        }
    }

    /**
     *
     * @param body
     * @param nickname
     */
    sendMessage(body, nickname) {
        const msg = $msg({ to: this.roomjid,
            type: 'groupchat' });

        msg.c('body', body).up();
        if (nickname) {
            msg.c('nick', { xmlns: 'http://jabber.org/protocol/nick' })
                .t(nickname)
                .up()
                .up();
        }
        this.connection.send(msg);
        this.eventEmitter.emit(XMPPEvents.SENDING_CHAT_MESSAGE, body);
    }

    /**
     *
     * @param subject
     */
    setSubject(subject) {
        const msg = $msg({ to: this.roomjid,
            type: 'groupchat' });

        msg.c('subject', subject);
        this.connection.send(msg);
    }

    /**
     * Called when participant leaves.
     * @param jid the jid of the participant that leaves
     * @param skipEvents optional params to skip any events, including check
     * whether this is the focus that left
     */
    onParticipantLeft(jid, skipEvents) {

        delete this.lastPresences[jid];

        if (skipEvents) {
            return;
        }

        this.eventEmitter.emit(XMPPEvents.MUC_MEMBER_LEFT, jid);

        this.moderator.onMucMemberLeft(jid);
    }

    /**
     *
     * @param pres
     * @param from
     */
    onPresenceUnavailable(pres, from) {
        // room destroyed ?
        if ($(pres).find('>x[xmlns="http://jabber.org/protocol/muc#user"]'
            + '>destroy').length) {
            let reason;
            const reasonSelect = $(pres).find(
                    '>x[xmlns="http://jabber.org/protocol/muc#user"]'
                    + '>destroy>reason');

            if (reasonSelect.length) {
                reason = reasonSelect.text();
            }

            this.eventEmitter.emit(XMPPEvents.MUC_DESTROYED, reason);
            this.connection.emuc.doLeave(this.roomjid);

            return true;
        }

        // Status code 110 indicates that this notification is "self-presence".
        const isSelfPresence
            = $(pres)
                    .find(
                        '>x[xmlns="http://jabber.org/protocol/muc#user"]>'
                            + 'status[code="110"]')
                    .length
                !== 0;
        const isKick
            = $(pres)
                    .find(
                        '>x[xmlns="http://jabber.org/protocol/muc#user"]'
                            + '>status[code="307"]')
                    .length
                !== 0;
        const membersKeys = Object.keys(this.members);

        if (!isSelfPresence) {
            delete this.members[from];
            this.onParticipantLeft(from, false);
        } else if (membersKeys.length > 0) {
            // If the status code is 110 this means we're leaving and we would
            // like to remove everyone else from our view, so we trigger the
            // event.
            membersKeys.forEach(jid => {
                const member = this.members[jid];

                delete this.members[jid];
                this.onParticipantLeft(jid, member.isFocus);
            });
            this.connection.emuc.doLeave(this.roomjid);

            // we fire muc_left only if this is not a kick,
            // kick has both statuses 110 and 307.
            if (!isKick) {
                this.eventEmitter.emit(XMPPEvents.MUC_LEFT);
            }
        }

        if (isKick && this.myroomjid === from) {
            this.eventEmitter.emit(XMPPEvents.KICKED);
        }
    }

    /**
     *
     * @param msg
     * @param from
     */
    onMessage(msg, from) {
        const nick
            = $(msg).find('>nick[xmlns="http://jabber.org/protocol/nick"]')
                .text()
            || Strophe.getResourceFromJid(from);

        const txt = $(msg).find('>body').text();
        const type = msg.getAttribute('type');

        if (type === 'error') {
            this.eventEmitter.emit(XMPPEvents.CHAT_ERROR_RECEIVED,
                $(msg).find('>text').text(), txt);

            return true;
        }

        const subject = $(msg).find('>subject');

        if (subject.length) {
            const subjectText = subject.text();

            if (subjectText || subjectText === '') {
                this.eventEmitter.emit(XMPPEvents.SUBJECT_CHANGED, subjectText);
                logger.log(`Subject is changed to ${subjectText}`);
            }
        }

        // xep-0203 delay
        let stamp = $(msg).find('>delay').attr('stamp');

        if (!stamp) {
            // or xep-0091 delay, UTC timestamp
            stamp = $(msg).find('>[xmlns="jabber:x:delay"]').attr('stamp');

            if (stamp) {
                // the format is CCYYMMDDThh:mm:ss
                const dateParts
                    = stamp.match(/(\d{4})(\d{2})(\d{2}T\d{2}:\d{2}:\d{2})/);

                stamp = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}Z`;
            }
        }

        if (from === this.roomjid
                && $(msg)
                    .find(
                        '>x[xmlns="http://jabber.org/protocol/muc#user"]'
                            + '>status[code="104"]')
                    .length) {
            this.discoRoomInfo();
        }

        if (txt) {
            logger.log('chat', nick, txt);
            this.eventEmitter.emit(XMPPEvents.MESSAGE_RECEIVED,
                from, nick, txt, this.myroomjid, stamp);
        }
    }

    /**
     *
     * @param pres
     * @param from
     */
    onPresenceError(pres, from) {
        if ($(pres)
                .find(
                    '>error[type="auth"]'
                        + '>not-authorized['
                        + 'xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"]')
                .length) {
            logger.log('on password required', from);
            this.eventEmitter.emit(XMPPEvents.PASSWORD_REQUIRED);
        } else if ($(pres)
                .find(
                    '>error[type="cancel"]'
                        + '>not-allowed['
                        + 'xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"]')
                .length) {
            const toDomain = Strophe.getDomainFromJid(pres.getAttribute('to'));

            if (toDomain === this.xmpp.options.hosts.anonymousdomain) {
                // enter the room by replying with 'not-authorized'. This would
                // result in reconnection from authorized domain.
                // We're either missing Jicofo/Prosody config for anonymous
                // domains or something is wrong.
                this.eventEmitter.emit(XMPPEvents.ROOM_JOIN_ERROR);

            } else {
                logger.warn('onPresError ', pres);
                this.eventEmitter.emit(
                    XMPPEvents.ROOM_CONNECT_NOT_ALLOWED_ERROR);
            }
        } else if ($(pres).find('>error>service-unavailable').length) {
            logger.warn('Maximum users limit for the room has been reached',
                pres);
            this.eventEmitter.emit(XMPPEvents.ROOM_MAX_USERS_ERROR);
        } else {
            logger.warn('onPresError ', pres);
            this.eventEmitter.emit(XMPPEvents.ROOM_CONNECT_ERROR);
        }
    }

    /**
     *
     * @param jid
     */
    kick(jid) {
        const kickIQ = $iq({ to: this.roomjid,
            type: 'set' })
            .c('query', { xmlns: 'http://jabber.org/protocol/muc#admin' })
            .c('item', { nick: Strophe.getResourceFromJid(jid),
                role: 'none' })
            .c('reason').t('You have been kicked.').up().up().up();

        this.connection.sendIQ(
            kickIQ,
            result => logger.log('Kick participant with jid: ', jid, result),
            error => logger.log('Kick participant error: ', error));
    }

    /* eslint-disable max-params */

    /**
     *
     * @param key
     * @param onSuccess
     * @param onError
     * @param onNotSupported
     */
    lockRoom(key, onSuccess, onError, onNotSupported) {
        // http://xmpp.org/extensions/xep-0045.html#roomconfig
        this.connection.sendIQ(
            $iq({
                to: this.roomjid,
                type: 'get'
            })
                .c('query', { xmlns: 'http://jabber.org/protocol/muc#owner' }),
            res => {
                if ($(res)
                        .find(
                            '>query>x[xmlns="jabber:x:data"]'
                                + '>field[var="muc#roomconfig_roomsecret"]')
                        .length) {
                    const formsubmit
                        = $iq({
                            to: this.roomjid,
                            type: 'set'
                        })
                            .c('query', {
                                xmlns: 'http://jabber.org/protocol/muc#owner'
                            });

                    formsubmit.c('x', {
                        xmlns: 'jabber:x:data',
                        type: 'submit'
                    });
                    formsubmit
                        .c('field', { 'var': 'FORM_TYPE' })
                        .c('value')
                        .t('http://jabber.org/protocol/muc#roomconfig')
                        .up()
                        .up();
                    formsubmit
                        .c('field', { 'var': 'muc#roomconfig_roomsecret' })
                        .c('value')
                        .t(key)
                        .up()
                        .up();

                    // Fixes a bug in prosody 0.9.+
                    // https://code.google.com/p/lxmppd/issues/detail?id=373
                    formsubmit
                        .c('field', { 'var': 'muc#roomconfig_whois' })
                        .c('value')
                        .t('anyone')
                        .up()
                        .up();

                    // FIXME: is muc#roomconfig_passwordprotectedroom required?
                    this.connection.sendIQ(formsubmit, onSuccess, onError);
                } else {
                    onNotSupported();
                }
            },
            onError);
    }

    /* eslint-enable max-params */

    /**
     *
     * @param key
     * @param values
     */
    addToPresence(key, values) {
        values.tagName = key;
        this.removeFromPresence(key);
        this.presMap.nodes.push(values);
    }

    /**
     *
     * @param key
     */
    removeFromPresence(key) {
        const nodes = this.presMap.nodes.filter(node => key !== node.tagName);

        this.presMap.nodes = nodes;
    }

    /**
     *
     * @param name
     * @param handler
     */
    addPresenceListener(name, handler) {
        if (typeof handler !== 'function') {
            throw new Error('"handler" is not a function');
        }
        let tagHandlers = this.presHandlers[name];

        if (!tagHandlers) {
            this.presHandlers[name] = tagHandlers = [];
        }
        if (tagHandlers.indexOf(handler) === -1) {
            tagHandlers.push(handler);
        } else {
            logger.warn(
                `Trying to add the same handler more than once for: ${name}`);
        }
    }

    /**
     *
     * @param name
     * @param handler
     */
    removePresenceListener(name, handler) {
        const tagHandlers = this.presHandlers[name];
        const handlerIdx = tagHandlers ? tagHandlers.indexOf(handler) : -1;

        // eslint-disable-next-line no-negated-condition
        if (handlerIdx !== -1) {
            tagHandlers.splice(handlerIdx, 1);
        } else {
            logger.warn(`Handler for: ${name} was not registered`);
        }
    }

    /**
     * Checks if the user identified by given <tt>mucJid</tt> is the conference
     * focus.
     * @param mucJid the full MUC address of the user to be checked.
     * @returns {boolean|null} <tt>true</tt> if MUC user is the conference focus
     * or <tt>false</tt> if is not. When given <tt>mucJid</tt> does not exist in
     * the MUC then <tt>null</tt> is returned.
     */
    isFocus(mucJid) {
        const member = this.members[mucJid];

        if (member) {
            return member.isFocus;
        }

        return null;
    }

    /**
     *
     */
    isModerator() {
        return this.role === 'moderator';
    }

    /**
     *
     * @param peerJid
     */
    getMemberRole(peerJid) {
        if (this.members[peerJid]) {
            return this.members[peerJid].role;
        }

        return null;
    }

    /**
     *
     * @param mute
     * @param callback
     */
    setVideoMute(mute, callback) {
        this.sendVideoInfoPresence(mute);
        if (callback) {
            callback(mute);
        }
    }

    /**
     *
     * @param mute
     * @param callback
     */
    setAudioMute(mute, callback) {
        return this.sendAudioInfoPresence(mute, callback);
    }

    /**
     *
     * @param mute
     */
    addAudioInfoToPresence(mute) {
        this.removeFromPresence('audiomuted');
        this.addToPresence('audiomuted',
            { attributes:
            { 'xmlns': 'http://jitsi.org/jitmeet/audio' },
                value: mute.toString() });
    }

    /**
     *
     * @param mute
     * @param callback
     */
    sendAudioInfoPresence(mute, callback) {
        this.addAudioInfoToPresence(mute);
        if (this.connection) {
            this.sendPresence();
        }
        if (callback) {
            callback();
        }
    }

    /**
     *
     * @param mute
     */
    addVideoInfoToPresence(mute) {
        this.removeFromPresence('videomuted');
        this.addToPresence('videomuted',
            { attributes:
            { 'xmlns': 'http://jitsi.org/jitmeet/video' },
                value: mute.toString() });
    }

    /**
     *
     * @param mute
     */
    sendVideoInfoPresence(mute) {
        this.addVideoInfoToPresence(mute);
        if (!this.connection) {
            return;
        }
        this.sendPresence();
    }

    /**
     * Obtains the info about given media advertised in the MUC presence of
     * the participant identified by the given endpoint JID.
     * @param {string} endpointId the endpoint ID mapped to the participant
     * which corresponds to MUC nickname.
     * @param {MediaType} mediaType the type of the media for which presence
     * info will be obtained.
     * @return {PeerMediaInfo} presenceInfo an object with media presence
     * info or <tt>null</tt> either if there is no presence available or if
     * the media type given is invalid.
     */
    getMediaPresenceInfo(endpointId, mediaType) {
        // Will figure out current muted status by looking up owner's presence
        const pres = this.lastPresences[`${this.roomjid}/${endpointId}`];

        if (!pres) {
            // No presence available
            return null;
        }
        const data = {
            muted: false, // unmuted by default
            videoType: undefined // no video type by default
        };
        let mutedNode = null;

        if (mediaType === MediaType.AUDIO) {
            mutedNode = filterNodeFromPresenceJSON(pres, 'audiomuted');
        } else if (mediaType === MediaType.VIDEO) {
            mutedNode = filterNodeFromPresenceJSON(pres, 'videomuted');
            const videoTypeNode = filterNodeFromPresenceJSON(pres, 'videoType');

            if (videoTypeNode.length > 0) {
                data.videoType = videoTypeNode[0].value;
            }
        } else {
            logger.error(`Unsupported media type: ${mediaType}`);

            return null;
        }

        data.muted = mutedNode.length > 0 && mutedNode[0].value === 'true';

        return data;
    }

    /**
     * Returns true if the recording is supproted and false if not.
     */
    isRecordingSupported() {
        if (this.recording) {
            return this.recording.isSupported();
        }

        return false;
    }

    /**
     * Returns null if the recording is not supported, "on" if the recording
     * started and "off" if the recording is not started.
     */
    getRecordingState() {
        return this.recording ? this.recording.getState() : undefined;
    }

    /**
     * Returns the url of the recorded video.
     */
    getRecordingURL() {
        return this.recording ? this.recording.getURL() : null;
    }

    /**
     * Starts/stops the recording
     * @param token token for authentication
     * @param statusChangeHandler {function} receives the new status as
     * argument.
     */
    toggleRecording(options, statusChangeHandler) {
        if (this.recording) {
            return this.recording.toggleRecording(options, statusChangeHandler);
        }

        return statusChangeHandler('error',
            new Error('The conference is not created yet!'));
    }

    /**
     * Returns true if the SIP calls are supported and false otherwise
     */
    isSIPCallingSupported() {
        if (this.moderator) {
            return this.moderator.isSipGatewayEnabled();
        }

        return false;
    }

    /**
     * Dials a number.
     * @param number the number
     */
    dial(number) {
        return this.connection.rayo.dial(number, 'fromnumber',
            Strophe.getBareJidFromJid(this.myroomjid), this.password,
            this.focusMucJid);
    }

    /**
     * Hangup an existing call
     */
    hangup() {
        return this.connection.rayo.hangup();
    }

    /**
     * Returns the phone number for joining the conference.
     */
    getPhoneNumber() {
        return this.phoneNumber;
    }

    /**
     * Returns the pin for joining the conference with phone.
     */
    getPhonePin() {
        return this.phonePin;
    }

    /**
     * Mutes remote participant.
     * @param jid of the participant
     * @param mute
     */
    muteParticipant(jid, mute) {
        logger.info('set mute', mute);
        const iqToFocus = $iq(
            { to: this.focusMucJid,
                type: 'set' })
            .c('mute', {
                xmlns: 'http://jitsi.org/jitmeet/audio',
                jid
            })
            .t(mute.toString())
            .up();

        this.connection.sendIQ(
            iqToFocus,
            result => logger.log('set mute', result),
            error => logger.log('set mute error', error));
    }

    /**
     *
     * @param iq
     */
    onMute(iq) {
        const from = iq.getAttribute('from');

        if (from !== this.focusMucJid) {
            logger.warn('Ignored mute from non focus peer');

            return false;
        }
        const mute = $(iq).find('mute');

        if (mute.length) {
            const doMuteAudio = mute.text() === 'true';

            this.eventEmitter.emit(
                XMPPEvents.AUDIO_MUTED_BY_FOCUS,
                doMuteAudio);
        }

        return true;
    }

    /**
     * Leaves the room. Closes the jingle session.
     * @returns {Promise} which is resolved if XMPPEvents.MUC_LEFT is received
     * less than 5s after sending presence unavailable. Otherwise the promise is
     * rejected.
     */
    leave() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => onMucLeft(true), 5000);
            const eventEmitter = this.eventEmitter;

            /**
             *
             * @param doReject
             */
            function onMucLeft(doReject = false) {
                eventEmitter.removeListener(XMPPEvents.MUC_LEFT, onMucLeft);
                clearTimeout(timeout);
                if (doReject) {
                    // the timeout expired
                    reject(new Error('The timeout for the confirmation about '
                        + 'leaving the room expired.'));
                } else {
                    resolve();
                }
            }
            eventEmitter.on(XMPPEvents.MUC_LEFT, onMucLeft);
            this.doLeave();
        });
    }
}

/* eslint-enable newline-per-chained-call */
