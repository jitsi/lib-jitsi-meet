/* global $ */

import { getLogger } from '@jitsi/logger';
import isEqual from 'lodash.isequal';
import { $iq, $msg, $pres, Strophe } from 'strophe.js';

import * as JitsiTranscriptionStatus from '../../JitsiTranscriptionStatus';
import { MediaType } from '../../service/RTC/MediaType';
import { VideoType } from '../../service/RTC/VideoType';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import GlobalOnErrorHandler from '../util/GlobalOnErrorHandler';
import Listenable from '../util/Listenable';

import AVModeration from './AVModeration';
import BreakoutRooms from './BreakoutRooms';
import Lobby from './Lobby';
import XmppConnection from './XmppConnection';
import Moderator from './moderator';

const logger = getLogger(__filename);

export const parser = {
    packet2JSON(xmlElement, nodes) {
        for (const child of Array.from(xmlElement.children)) {
            const node = {
                attributes: {},
                children: [],
                tagName: child.tagName
            };

            for (const attr of Array.from(child.attributes)) {
                node.attributes[attr.name] = attr.value;
            }
            const text = Strophe.getText(child);

            if (text) {
                // Using Strophe.getText will do work for traversing all direct
                // child text nodes but returns an escaped value, which is not
                // desirable at this point.
                node.value = Strophe.xmlunescape(text);
            }
            nodes.push(node);
            this.packet2JSON(child, node.children);
        }
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
export function filterNodeFromPresenceJSON(pres, nodeName) {
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
 * Array of affiliations that are allowed in members only room.
 * @type {string[]}
 */
const MEMBERS_AFFILIATIONS = [ 'owner', 'admin', 'member' ];

/**
 *
 */
export default class ChatRoom extends Listenable {

    /* eslint-disable max-params */

    /**
     *
     * @param {XmppConnection} connection - The XMPP connection instance.
     * @param jid
     * @param password
     * @param XMPP
     * @param options
     * @param {boolean} options.disableFocus - when set to {@code false} will
     * not invite Jicofo into the room.
     * @param {boolean} options.disableDiscoInfo - when set to {@code false} will skip disco info.
     * This is intended to be used only for lobby rooms.
     * @param {boolean} options.enableLobby - when set to {@code false} will skip creating lobby room.
     * @param {boolean} options.hiddenFromRecorderFeatureEnabled - when set to {@code true} we will check identity tag
     * for node presence.
     */
    constructor(connection, jid, password, XMPP, options) {
        super();
        this.xmpp = XMPP;
        this.connection = connection;
        this.roomjid = Strophe.getBareJidFromJid(jid);
        this.myroomjid = jid;
        this.password = password;
        this.replaceParticipant = false;
        logger.info(`Joined MUC as ${this.myroomjid}`);
        this.members = {};
        this.presMap = {};
        this.presHandlers = {};
        this._removeConnListeners = [];
        this.joined = false;
        this.inProgressEmitted = false;
        this.role = null;
        this.focusMucJid = null;
        this.noBridgeAvailable = false;
        this.options = options || {};
        this.moderator
            = new Moderator(this.roomjid, this.xmpp, this.eventEmitter, {
                connection: this.xmpp.options,
                conference: this.options
            });
        if (typeof this.options.enableLobby === 'undefined' || this.options.enableLobby) {
            this.lobby = new Lobby(this);
        }
        this.avModeration = new AVModeration(this);
        this.breakoutRooms = new BreakoutRooms(this);
        this.initPresenceMap(options);
        this.lastPresences = {};
        this.phoneNumber = null;
        this.phonePin = null;
        this.connectionTimes = {};
        this.participantPropertyListener = null;

        this.locked = false;
        this.transcriptionStatus = JitsiTranscriptionStatus.OFF;
    }

    /* eslint-enable max-params */

    /**
     *
     */
    initPresenceMap(options = {}) {
        this.presMap.to = this.myroomjid;
        this.presMap.xns = 'http://jabber.org/protocol/muc';
        this.presMap.nodes = [];

        if (options.statsId) {
            this.presMap.nodes.push({
                'tagName': 'stats-id',
                'value': options.statsId
            });
        }

        this.presenceUpdateTime = Date.now();
    }

    /**
     * Joins the chat room.
     * @param {string} password - Password to unlock room on joining.
     * @returns {Promise} - resolved when join completes. At the time of this
     * writing it's never rejected.
     */
    join(password, replaceParticipant) {
        this.password = password;
        this.replaceParticipant = replaceParticipant;

        return new Promise(resolve => {
            this.options.disableFocus
                && logger.info(`Conference focus disabled for ${this.roomjid}`);

            const preJoin
                = this.options.disableFocus
                    ? Promise.resolve()
                    : this.moderator.allocateConferenceFocus();

            preJoin.then(() => {
                this.sendPresence(true);
                this._removeConnListeners.push(
                    this.connection.addEventListener(
                        XmppConnection.Events.CONN_STATUS_CHANGED,
                        this.onConnStatusChanged.bind(this))
                );
                resolve();
            });
        });
    }

    /**
     *
     * @param fromJoin - Whether this is initial presence to join the room.
     */
    sendPresence(fromJoin) {
        const to = this.presMap.to;

        if (!this.connection || !this.connection.connected || !to || (!this.joined && !fromJoin)) {
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
            if (this.replaceParticipant) {
                pres.c('flip_device').up();
            }

            pres.c('x', { xmlns: this.presMap.xns });

            if (this.password) {
                pres.c('password').t(this.password).up();
            }
            if (this.options.billingId) {
                pres.c('billingid').t(this.options.billingId).up();
            }

            pres.up();
        }

        parser.json2packet(this.presMap.nodes, pres);

        // we store time we last synced presence state
        this.presenceSyncTime = Date.now();

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
        // FIXME do not use Strophe.Connection in the ChatRoom directly
        !this.connection.isUsingWebSocket && this.connection.flush();
        this.connection.send(pres);
        this.connection.flush();
    }

    /**
     *
     */
    discoRoomInfo() {
        // https://xmpp.org/extensions/xep-0045.html#disco-roominfo

        const getInfo
            = $iq({
                type: 'get',
                to: this.roomjid
            })
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

            const meetingIdValEl
                = $(result).find('>query>x[type="result"]>field[var="muc#roominfo_meetingId"]>value');

            if (meetingIdValEl.length) {
                this.setMeetingId(meetingIdValEl.text());
            } else {
                logger.warn('No meeting ID from backend');
            }

            const membersOnly = $(result).find('>query>feature[var="muc_membersonly"]').length === 1;

            const lobbyRoomField
                = $(result).find('>query>x[type="result"]>field[var="muc#roominfo_lobbyroom"]>value');

            if (this.lobby) {
                this.lobby.setLobbyRoomJid(lobbyRoomField && lobbyRoomField.length ? lobbyRoomField.text() : undefined);
            }

            const isBreakoutField
                = $(result).find('>query>x[type="result"]>field[var="muc#roominfo_isbreakout"]>value');
            const isBreakoutRoom = Boolean(isBreakoutField?.text());

            this.breakoutRooms._setIsBreakoutRoom(isBreakoutRoom);

            const breakoutMainRoomField
                = $(result).find('>query>x[type="result"]>field[var="muc#roominfo_breakout_main_room"]>value');

            if (breakoutMainRoomField?.length) {
                this.breakoutRooms._setMainRoomJid(breakoutMainRoomField.text());
            }

            if (membersOnly !== this.membersOnlyEnabled) {
                this.membersOnlyEnabled = membersOnly;
                this.eventEmitter.emit(XMPPEvents.MUC_MEMBERS_ONLY_CHANGED, membersOnly);
            }

        }, error => {
            GlobalOnErrorHandler.callErrorHandler(error);
            logger.error('Error getting room info: ', error);
        });
    }

    /**
     * Sets the meeting unique Id (received from the backend).
     *
     * @param {string} meetingId - The new meetings id.
     * @returns {void}
     */
    setMeetingId(meetingId) {
        if (this.meetingId !== meetingId) {
            if (this.meetingId) {
                logger.warn(`Meeting Id changed from:${this.meetingId} to:${meetingId}`);
            }
            this.meetingId = meetingId;
            this.eventEmitter.emit(XMPPEvents.MEETING_ID_SET, meetingId);
        }
    }

    /**
     *
     */
    createNonAnonymousRoom() {
        // http://xmpp.org/extensions/xep-0045.html#createroom-reserved

        if (this.options.disableDiscoInfo) {
            return;
        }

        const getForm = $iq({ type: 'get',
            to: this.roomjid })
            .c('query', { xmlns: 'http://jabber.org/protocol/muc#owner' })
            .c('x', { xmlns: 'jabber:x:data',
                type: 'submit' });

        this.connection.sendIQ(getForm, form => {
            if (!$(form).find(
                    '>query>x[xmlns="jabber:x:data"]'
                    + '>field[var="muc#roomconfig_whois"]').length) {
                const errmsg = 'non-anonymous rooms not supported';

                GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
                logger.error(errmsg);

                return;
            }

            const formSubmit = $iq({ to: this.roomjid,
                type: 'set' })
                .c('query', { xmlns: 'http://jabber.org/protocol/muc#owner' });

            formSubmit.c('x', { xmlns: 'jabber:x:data',
                type: 'submit' });

            formSubmit.c('field', { 'var': 'FORM_TYPE' })
                .c('value')
                .t('http://jabber.org/protocol/muc#roomconfig').up().up();

            formSubmit.c('field', { 'var': 'muc#roomconfig_whois' })
                .c('value').t('anyone').up().up();

            this.connection.sendIQ(formSubmit);

        }, error => {
            GlobalOnErrorHandler.callErrorHandler(error);
            logger.error('Error getting room configuration form: ', error);
        });
    }

    /**
     * Handles Xmpp Connection status updates.
     *
     * @param {Strophe.Status} status - The Strophe connection status.
     */
    onConnStatusChanged(status) {
        // Send cached presence when the XMPP connection is re-established.
        if (status === XmppConnection.Status.CONNECTED) {
            this.sendPresence();
        }
    }

    /**
     *
     * @param pres
     */
    onPresence(pres) {
        const from = pres.getAttribute('from');
        const member = {};
        const statusEl = pres.getElementsByTagName('status')[0];

        if (statusEl) {
            member.status = statusEl.textContent || '';
        }
        let hasStatusUpdate = false;
        let hasVersionUpdate = false;
        const xElement
            = pres.getElementsByTagNameNS(
                'http://jabber.org/protocol/muc#user', 'x')[0];
        const mucUserItem
            = xElement && xElement.getElementsByTagName('item')[0];

        member.isReplaceParticipant
            = pres.getElementsByTagName('flip_device').length;

        member.affiliation
            = mucUserItem && mucUserItem.getAttribute('affiliation');
        member.role = mucUserItem && mucUserItem.getAttribute('role');

        // Focus recognition
        const jid = mucUserItem && mucUserItem.getAttribute('jid');

        member.jid = jid;
        member.isFocus
            = jid && jid.indexOf(`${this.moderator.getFocusUserJid()}/`) === 0;
        member.isHiddenDomain
            = jid && jid.indexOf('@') > 0
                && this.options.hiddenDomain
                    === jid.substring(jid.indexOf('@') + 1, jid.indexOf('/'));

        this.eventEmitter.emit(XMPPEvents.PRESENCE_RECEIVED, {
            fromHiddenDomain: member.isHiddenDomain,
            presence: pres
        });

        const xEl = pres.querySelector('x');

        if (xEl) {
            xEl.remove();
        }

        const nodes = [];

        parser.packet2JSON(pres, nodes);
        this.lastPresences[from] = nodes;

        // process nodes to extract data needed for MUC_JOINED and
        // MUC_MEMBER_JOINED events
        const extractIdentityInformation = node => {
            const identity = {};
            const userInfo = node.children.find(c => c.tagName === 'user');

            if (userInfo) {
                identity.user = {};
                const tags = [ 'id', 'name', 'avatar' ];

                if (this.options.hiddenFromRecorderFeatureEnabled) {
                    tags.push('hidden-from-recorder');
                }

                for (const tag of tags) {
                    const child
                        = userInfo.children.find(c => c.tagName === tag);

                    if (child) {
                        identity.user[tag] = child.value;
                    }
                }
            }
            const groupInfo = node.children.find(c => c.tagName === 'group');

            if (groupInfo) {
                identity.group = groupInfo.value;
            }

            return identity;
        };

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            switch (node.tagName) {
            case 'bot': {
                const { attributes } = node;

                if (!attributes) {
                    break;
                }
                const { type } = attributes;

                member.botType = type;
                break;
            }
            case 'nick':
                member.nick = node.value;
                break;
            case 'userId':
                member.id = node.value;
                break;
            case 'stats-id':
                member.statsID = node.value;
                break;
            case 'identity':
                member.identity = extractIdentityInformation(node);
                break;
            case 'features': {
                member.features = this._extractFeatures(node);
                break;
            }
            case 'stat': {
                const { attributes } = node;

                if (!attributes) {
                    break;
                }
                const { name } = attributes;

                if (name === 'version') {
                    member.version = attributes.value;
                }
                break;
            }
            }
        }

        if (!this.joined && !this.inProgressEmitted) {
            const now = this.connectionTimes['muc.join.started'] = window.performance.now();

            logger.log('(TIME) MUC join started:\t', now);

            this.eventEmitter.emit(XMPPEvents.MUC_JOIN_IN_PROGRESS);
            this.inProgressEmitted = true;
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

                // Re-send presence in case any presence updates were added,
                // but blocked from sending, during the join process.
                // send the presence only if there was a modification after we had synced it
                if (this.presenceUpdateTime >= this.presenceSyncTime) {
                    this.sendPresence();
                }

                this.eventEmitter.emit(XMPPEvents.MUC_JOINED);

                // Now let's check the disco-info to retrieve the
                // meeting Id if any
                !this.options.disableDiscoInfo && this.discoRoomInfo();
            }
        } else if (jid === undefined) {
            logger.info('Ignoring member with undefined JID');
        } else if (this.members[from] === undefined) {
            // new participant
            this.members[from] = member;
            logger.log('entered', from, member);
            hasStatusUpdate = member.status !== undefined;
            hasVersionUpdate = member.version !== undefined;
            if (member.isFocus) {
                this._initFocus(from, member.features);
            } else {
                // identity is being added to member joined, so external
                // services can be notified for that (currently identity is
                // not used inside library)
                this.eventEmitter.emit(
                    XMPPEvents.MUC_MEMBER_JOINED,
                    from,
                    member.nick,
                    member.role,
                    member.isHiddenDomain,
                    member.statsID,
                    member.status,
                    member.identity,
                    member.botType,
                    member.jid,
                    member.features,
                    member.isReplaceParticipant);

                // we are reporting the status with the join
                // so we do not want a second event about status update
                hasStatusUpdate = false;
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

            // affiliation changed
            if (memberOfThis.affiliation !== member.affiliation) {
                memberOfThis.affiliation = member.affiliation;
            }

            // fire event that botType had changed
            if (memberOfThis.botType !== member.botType) {
                memberOfThis.botType = member.botType;
                this.eventEmitter.emit(
                    XMPPEvents.MUC_MEMBER_BOT_TYPE_CHANGED,
                    from,
                    member.botType);
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
                // presence from the focus won't contain
                // <item jid="focus..." />.
                // By default we are disabling the waiting for form submission in order to use the room
                // and we had enabled by default that jids are public in the room ,
                // so this case should not happen, if public jid is turned off we will receive the jid
                // when we become moderator in the room
                memberOfThis.isFocus = true;
                this._initFocus(from, member.features);
            }

            // store the new display name
            if (member.displayName) {
                memberOfThis.displayName = member.displayName;
            }

            // update stored status message to be able to detect changes
            if (memberOfThis.status !== member.status) {
                hasStatusUpdate = true;
                memberOfThis.status = member.status;
            }

            if (memberOfThis.version !== member.version) {
                hasVersionUpdate = true;
                memberOfThis.version = member.version;
            }

            if (!isEqual(memberOfThis.features, member.features)) {
                memberOfThis.features = member.features;
                this.eventEmitter.emit(XMPPEvents.PARTICIPANT_FEATURES_CHANGED, from, member.features);
            }
        }

        // after we had fired member or room joined events, lets fire events
        // for the rest info we got in presence
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            switch (node.tagName) {
            case 'nick':
                if (!member.isFocus) {
                    const displayName
                        = this.xmpp.options.displayJids
                            ? Strophe.getResourceFromJid(from)
                            : member.nick;

                    this.eventEmitter.emit(
                        XMPPEvents.DISPLAY_NAME_CHANGED,
                        from,
                        displayName);
                }
                break;
            case 'bridgeNotAvailable':
                if (member.isFocus && !this.noBridgeAvailable) {
                    this.noBridgeAvailable = true;
                    this.eventEmitter.emit(XMPPEvents.BRIDGE_DOWN);
                }
                break;
            case 'conference-properties':
                if (member.isFocus) {
                    const properties = {};

                    for (let j = 0; j < node.children.length; j++) {
                        const { attributes } = node.children[j];

                        if (attributes && attributes.key) {
                            properties[attributes.key] = attributes.value;
                        }
                    }

                    this.eventEmitter.emit(XMPPEvents.CONFERENCE_PROPERTIES_CHANGED, properties);

                    // Log if Jicofo supports restart by terminate only once. This conference property does not change
                    // during the call.
                    if (typeof this.restartByTerminateSupported === 'undefined') {
                        this.restartByTerminateSupported = properties['support-terminate-restart'] === 'true';
                        logger.info(`Jicofo supports restart by terminate: ${this.supportsRestartByTerminate()}`);
                    }
                }
                break;
            case 'transcription-status': {
                const { attributes } = node;

                if (!attributes) {
                    break;
                }

                const { status } = attributes;

                if (status && status !== this.transcriptionStatus) {
                    this.transcriptionStatus = status;
                    this.eventEmitter.emit(
                        XMPPEvents.TRANSCRIPTION_STATUS_CHANGED,
                        status
                    );
                }


                break;
            }
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

        // Trigger status message update if necessary
        if (hasStatusUpdate) {
            this.eventEmitter.emit(
                XMPPEvents.PRESENCE_STATUS,
                from,
                member.status);
        }

        if (hasVersionUpdate) {
            logger.info(`Received version for ${jid}: ${member.version}`);
        }
    }

    /**
     * Extracts the features from the presence.
     * @param node the node to process.
     * @return features the Set of features where extracted data is added.
     * @private
     */
    _extractFeatures(node) {
        const features = new Set();

        for (let j = 0; j < node.children.length; j++) {
            const { attributes } = node.children[j];

            if (attributes && attributes.var) {
                features.add(attributes.var);
            }
        }

        return features;
    }

    /**
     * Initialize some properties when the focus participant is verified.
     * @param from jid of the focus
     * @param features the features reported in jicofo presence
     */
    _initFocus(from, features) {
        this.focusMucJid = from;
        this.focusFeatures = features;
    }

    /**
     * Sets the special listener to be used for "command"s whose name starts
     * with "jitsi_participant_".
     */
    setParticipantPropertyListener(listener) {
        this.participantPropertyListener = listener;
    }

    /**
     * Checks if Jicofo supports restarting Jingle session after 'session-terminate'.
     * @returns {boolean}
     */
    supportsRestartByTerminate() {
        return this.restartByTerminateSupported;
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
     * Send text message to the other participants in the conference
     * @param message
     * @param elementName
     */
    sendMessage(message, elementName) {
        const msg = $msg({ to: this.roomjid,
            type: 'groupchat' });

        // We are adding the message in a packet extension. If this element
        // is different from 'body', we add a custom namespace.
        // e.g. for 'json-message' extension of message stanza.
        if (elementName === 'body') {
            msg.c(elementName, {}, message);
        } else {
            msg.c(elementName, { xmlns: 'http://jitsi.org/jitmeet' }, message);
        }

        this.connection.send(msg);
        this.eventEmitter.emit(XMPPEvents.SENDING_CHAT_MESSAGE, message);
    }

    /* eslint-disable max-params */
    /**
     * Send private text message to another participant of the conference
     * @param id id/muc resource of the receiver
     * @param message
     * @param elementName
     */
    sendPrivateMessage(id, message, elementName) {
        const msg = $msg({ to: `${this.roomjid}/${id}`,
            type: 'chat' });

        // We are adding the message in packet. If this element is different
        // from 'body', we add our custom namespace for the same.
        // e.g. for 'json-message' message extension.
        if (elementName === 'body') {
            msg.c(elementName, message).up();
        } else {
            msg.c(elementName, { xmlns: 'http://jitsi.org/jitmeet' }, message)
                .up();
        }

        this.connection.send(msg);
        this.eventEmitter.emit(
            XMPPEvents.SENDING_PRIVATE_CHAT_MESSAGE, message);
    }
    /* eslint-enable max-params */

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
        // ignore presence
        if ($(pres).find('>ignore[xmlns="http://jitsi.org/jitmeet/"]').length) {
            return true;
        }

        // room destroyed ?
        const destroySelect = $(pres).find('>x[xmlns="http://jabber.org/protocol/muc#user"]>destroy');

        if (destroySelect.length) {
            let reason;
            const reasonSelect
                = $(pres).find(
                    '>x[xmlns="http://jabber.org/protocol/muc#user"]'
                        + '>destroy>reason');

            if (reasonSelect.length) {
                reason = reasonSelect.text();
            }

            this.eventEmitter.emit(XMPPEvents.MUC_DESTROYED, reason, destroySelect.attr('jid'));
            this.connection.emuc.doLeave(this.roomjid);

            return true;
        }

        // Status code 110 indicates that this notification is "self-presence".
        const isSelfPresence
            = $(pres)
                .find(
                    '>x[xmlns="http://jabber.org/protocol/muc#user"]>'
                        + 'status[code="110"]')
                .length;
        const isKick
            = $(pres)
                .find(
                    '>x[xmlns="http://jabber.org/protocol/muc#user"]'
                        + '>status[code="307"]')
                .length;
        const membersKeys = Object.keys(this.members);
        const isReplaceParticipant = $(pres).find('flip_device').length;

        if (isKick) {
            const actorSelect
                = $(pres)
                .find('>x[xmlns="http://jabber.org/protocol/muc#user"]>item>actor');
            let actorNick;

            if (actorSelect.length) {
                actorNick = actorSelect.attr('nick');
            }

            let reason;
            const reasonSelect
                = $(pres).find(
                '>x[xmlns="http://jabber.org/protocol/muc#user"]'
                + '>item>reason');

            if (reasonSelect.length) {
                reason = reasonSelect.text();
            }

            // we first fire the kicked so we can show the participant
            // who kicked, before notifying that participant left
            // we fire kicked for us and for any participant kicked
            this.eventEmitter.emit(
                XMPPEvents.KICKED,
                isSelfPresence,
                actorNick,
                Strophe.getResourceFromJid(from),
                reason,
                isReplaceParticipant);
        }

        if (isSelfPresence) {
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
        } else {
            delete this.members[from];
            this.onParticipantLeft(from, false);
        }
    }

    /**
     *
     * @param msg
     * @param from
     */
    onMessage(msg, from) {
        const type = msg.getAttribute('type');

        if (type === 'error') {
            const settingsErrorMsg = $(msg).find('>settings-error>text').text();

            if (settingsErrorMsg.length) {
                this.eventEmitter.emit(XMPPEvents.SETTINGS_ERROR_RECEIVED, settingsErrorMsg);

                return true;
            }
            const errorMsg = $(msg).find('>error>text').text();

            this.eventEmitter.emit(XMPPEvents.CHAT_ERROR_RECEIVED, errorMsg);

            return true;
        }

        const txt = $(msg).find('>body').text();
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

        if (from === this.roomjid) {
            let invite;

            if ($(msg).find('>x[xmlns="http://jabber.org/protocol/muc#user"]>status[code="104"]').length) {
                this.discoRoomInfo();
            } else if ((invite = $(msg).find('>x[xmlns="http://jabber.org/protocol/muc#user"]>invite'))
                        && invite.length) {
                const passwordSelect = $(msg).find('>x[xmlns="http://jabber.org/protocol/muc#user"]>password');
                let password;

                if (passwordSelect && passwordSelect.length) {
                    password = passwordSelect.text();
                }

                this.eventEmitter.emit(XMPPEvents.INVITE_MESSAGE_RECEIVED,
                    from, invite.attr('from'), txt, password);
            }
        }

        const jsonMessage = $(msg).find('>json-message').text();

        if (jsonMessage) {
            const parsedJson = this.xmpp.tryParseJSONAndVerify(jsonMessage);

            // We emit this event if the message is a valid json, and is not
            // delivered after a delay, i.e. stamp is undefined.
            // e.g. - subtitles should not be displayed if delayed.
            if (parsedJson && stamp === undefined) {
                this.eventEmitter.emit(XMPPEvents.JSON_MESSAGE_RECEIVED,
                    from, parsedJson);

                return;
            }
        }

        if (txt) {
            if (type === 'chat') {
                this.eventEmitter.emit(XMPPEvents.PRIVATE_MESSAGE_RECEIVED,
                        from, txt, this.myroomjid, stamp);
            } else if (type === 'groupchat') {
                this.eventEmitter.emit(XMPPEvents.MESSAGE_RECEIVED,
                        from, txt, this.myroomjid, stamp);
            }
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
        } else if ($(pres)
            .find(
                '>error[type="auth"]'
                + '>registration-required['
                + 'xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"]').length) {

            // let's extract the lobby jid from the custom field
            const lobbyRoomNode = $(pres).find('>error[type="auth"]>lobbyroom');
            let lobbyRoomJid;

            if (lobbyRoomNode.length) {
                lobbyRoomJid = lobbyRoomNode.text();
            } else {
                // let's fallback to old location of lobbyroom node, TODO: to be removed in the future once
                // everything is updated
                const lobbyRoomOldNode = $(pres).find('>lobbyroom');

                if (lobbyRoomOldNode.length) {
                    lobbyRoomJid = lobbyRoomOldNode.text();
                }
            }

            this.eventEmitter.emit(XMPPEvents.ROOM_CONNECT_MEMBERS_ONLY_ERROR, lobbyRoomJid);
        } else {
            logger.warn('onPresError ', pres);
            this.eventEmitter.emit(XMPPEvents.ROOM_CONNECT_ERROR);
        }
    }

    /**
     *
     * @param jid
     * @param affiliation
     */
    setAffiliation(jid, affiliation) {
        const grantIQ = $iq({
            to: this.roomjid,
            type: 'set'
        })
        .c('query', { xmlns: 'http://jabber.org/protocol/muc#admin' })
        .c('item', {
            affiliation,
            jid: Strophe.getBareJidFromJid(jid)
        })
        .c('reason').t(`Your affiliation has been changed to '${affiliation}'.`)
        .up().up().up();

        this.connection.sendIQ(
            grantIQ,
            result => logger.log('Set affiliation of participant with jid: ', jid, 'to', affiliation, result),
            error => logger.log('Set affiliation of participant error: ', error));
    }

    /**
     *
     * @param jid
     * @param reason
     */
    kick(jid, reason = 'You have been kicked.') {
        const kickIQ = $iq({ to: this.roomjid,
            type: 'set' })
            .c('query', { xmlns: 'http://jabber.org/protocol/muc#admin' })
            .c('item', { nick: Strophe.getResourceFromJid(jid),
                role: 'none' })
            .c('reason').t(reason).up().up().up();

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
                    formsubmit
                        .c('field',
                             { 'var': 'muc#roomconfig_passwordprotectedroom' })
                        .c('value')
                        .t(key === null || key.length === 0 ? '0' : '1')
                        .up()
                        .up();

                    // if members only enabled
                    if (this.membersOnlyEnabled) {
                        formsubmit
                            .c('field', { 'var': 'muc#roomconfig_membersonly' })
                            .c('value')
                            .t('true')
                            .up()
                            .up();
                    }

                    // Fixes a bug in prosody 0.9.+
                    // https://prosody.im/issues/issue/373
                    formsubmit
                        .c('field', { 'var': 'muc#roomconfig_whois' })
                        .c('value')
                        .t('anyone')
                        .up()
                        .up();

                    this.connection.sendIQ(
                        formsubmit,
                        () => {

                            // we set the password in chat room so we can use it
                            // later when dialing out
                            this.password = key;
                            onSuccess();
                        },
                        onError);
                } else {
                    onNotSupported();
                }
            },
            onError);
    }

    /* eslint-enable max-params */

    /**
     * Turns off or on the members only config for the main room.
     *
     * @param {boolean} enabled - Whether to turn it on or off.
     * @param onSuccess - optional callback.
     * @param onError - optional callback.
     */
    setMembersOnly(enabled, onSuccess, onError) {
        if (enabled && Object.values(this.members).filter(m => !m.isFocus).length) {
            // first grant membership to all that are in the room
            // currently there is a bug in prosody where it handles only the first item
            // that's why we will send iq per member
            Object.values(this.members).forEach(m => {
                if (m.jid && !MEMBERS_AFFILIATIONS.includes(m.affiliation)) {
                    this.xmpp.connection.sendIQ(
                        $iq({
                            to: this.roomjid,
                            type: 'set' })
                        .c('query', {
                            xmlns: 'http://jabber.org/protocol/muc#admin' })
                        .c('item', {
                            'affiliation': 'member',
                            'jid': Strophe.getBareJidFromJid(m.jid)
                        }).up().up());
                }
            });
        }

        const errorCallback = onError ? onError : () => {}; // eslint-disable-line no-empty-function

        this.xmpp.connection.sendIQ(
            $iq({
                to: this.roomjid,
                type: 'get'
            }).c('query', { xmlns: 'http://jabber.org/protocol/muc#owner' }),
            res => {
                if ($(res).find('>query>x[xmlns="jabber:x:data"]>field[var="muc#roomconfig_membersonly"]').length) {
                    const formToSubmit
                        = $iq({
                            to: this.roomjid,
                            type: 'set'
                        }).c('query', { xmlns: 'http://jabber.org/protocol/muc#owner' });

                    formToSubmit.c('x', {
                        xmlns: 'jabber:x:data',
                        type: 'submit'
                    });
                    formToSubmit
                        .c('field', { 'var': 'FORM_TYPE' })
                        .c('value')
                        .t('http://jabber.org/protocol/muc#roomconfig')
                        .up()
                        .up();
                    formToSubmit
                        .c('field', { 'var': 'muc#roomconfig_membersonly' })
                        .c('value')
                        .t(enabled ? 'true' : 'false')
                        .up()
                        .up();

                    // if room is locked from other participant or we are locking it
                    if (this.locked) {
                        formToSubmit
                            .c('field',
                                { 'var': 'muc#roomconfig_passwordprotectedroom' })
                            .c('value')
                            .t('1')
                            .up()
                            .up();
                    }

                    this.xmpp.connection.sendIQ(formToSubmit, onSuccess, errorCallback);
                } else {
                    errorCallback(new Error('Setting members only room not supported!'));
                }
            },
            errorCallback);
    }

    /**
     * Adds the key to the presence map, overriding any previous value.
     * This method is used by jibri.
     *
     * @param key The key to add or replace.
     * @param values The new values.
     * @returns {boolean|null} <tt>true</tt> if the operation succeeded or <tt>false</tt> when no add or replce was
     * performed as the value was already there.
     * @deprecated Use 'addOrReplaceInPresence' instead. TODO: remove it from here and jibri.
     */
    addToPresence(key, values) {
        return this.addOrReplaceInPresence(key, values);
    }

    /**
     * Adds the key to the presence map, overriding any previous value.
     * @param key The key to add or replace.
     * @param values The new values.
     * @returns {boolean|null} <tt>true</tt> if the operation succeeded or <tt>false</tt> when no add or replace was
     * performed as the value was already there.
     */
    addOrReplaceInPresence(key, values) {
        values.tagName = key;

        const matchingNodes = this.presMap.nodes.filter(node => key === node.tagName);

        // if we have found just one, let's check is it the same
        if (matchingNodes.length === 1 && isEqual(matchingNodes[0], values)) {
            return false;
        }

        this.removeFromPresence(key);
        this.presMap.nodes.push(values);
        this.presenceUpdateTime = Date.now();

        return true;
    }

    /**
     * Retrieves a value from the presence map.
     *
     * @param {string} key - The key to find the value for.
     * @returns {Object?}
     */
    getFromPresence(key) {
        return this.presMap.nodes.find(node => key === node.tagName);
    }

    /**
     * Removes a key from the presence map.
     * @param key
     */
    removeFromPresence(key) {
        const nodes = this.presMap.nodes.filter(node => key !== node.tagName);

        this.presMap.nodes = nodes;
        this.presenceUpdateTime = Date.now();
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
     */
    addAudioInfoToPresence(mute) {
        const audioMutedTagName = 'audiomuted';

        // we skip adding it as muted is default value
        if (mute && !this.getFromPresence(audioMutedTagName)) {
            return false;
        }

        return this.addOrReplaceInPresence(
            audioMutedTagName,
            {
                value: mute.toString()
            });
    }

    /**
     *
     * @param mute
     */
    addVideoInfoToPresence(mute) {
        const videoMutedTagName = 'videomuted';

        // we skip adding it as muted is default value
        if (mute && !this.getFromPresence(videoMutedTagName)) {
            return false;
        }

        return this.addOrReplaceInPresence(
            videoMutedTagName,
            {
                value: mute.toString()
            });
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
            muted: true, // muted by default
            videoType: mediaType === MediaType.VIDEO ? VideoType.CAMERA : undefined // 'camera' by default
        };
        let mutedNode = null;

        if (mediaType === MediaType.AUDIO) {
            mutedNode = filterNodeFromPresenceJSON(pres, 'audiomuted');
        } else if (mediaType === MediaType.VIDEO) {
            mutedNode = filterNodeFromPresenceJSON(pres, 'videomuted');
            const codecTypeNode = filterNodeFromPresenceJSON(pres, 'jitsi_participant_codecType');
            const videoTypeNode = filterNodeFromPresenceJSON(pres, 'videoType');

            if (videoTypeNode.length > 0) {
                data.videoType = videoTypeNode[0].value;
            }
            if (codecTypeNode.length > 0) {
                data.codecType = codecTypeNode[0].value;
            }
        } else {
            logger.error(`Unsupported media type: ${mediaType}`);

            return null;
        }

        if (mutedNode.length > 0) {
            data.muted = mutedNode[0].value === 'true';
        }

        return data;
    }

    /**
     * Returns the last presence advertised by a MUC member.
     * @param {string} mucNick
     * @returns {*}
     */
    getLastPresence(mucNick) {
        return this.lastPresences[`${this.roomjid}/${mucNick}`];
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
     *
     * @returns {Lobby}
     */
    getLobby() {
        return this.lobby;
    }

    /**
     * @returns {AVModeration}
     */
    getAVModeration() {
        return this.avModeration;
    }

    /**
     * @returns {BreakoutRooms}
     */
    getBreakoutRooms() {
        return this.breakoutRooms;
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
     * Returns the meeting unique ID if any came from backend.
     *
     * @returns {string} - The meeting ID.
     */
    getMeetingId() {
        return this.meetingId;
    }

    /**
     * Mutes remote participant.
     * @param jid of the participant
     * @param mute
     * @param mediaType
     */
    muteParticipant(jid, mute, mediaType) {
        logger.info('set mute', mute, jid);
        const iqToFocus = $iq(
            { to: this.focusMucJid,
                type: 'set' })
            .c('mute', {
                xmlns: `http://jitsi.org/jitmeet/${mediaType}`,
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
     * TODO: Document
     * @param iq
     */
    onMute(iq) {
        const from = iq.getAttribute('from');

        if (from !== this.focusMucJid) {
            logger.warn('Ignored mute from non focus peer');

            return;
        }
        const mute = $(iq).find('mute');

        if (mute.length && mute.text() === 'true') {
            this.eventEmitter.emit(XMPPEvents.AUDIO_MUTED_BY_FOCUS, mute.attr('actor'));
        } else {
            // XXX Why do we support anything but muting? Why do we encode the
            // value in the text of the element? Why do we use a separate XML
            // namespace?
            logger.warn('Ignoring a mute request which does not explicitly '
                + 'specify a positive mute command.');
        }
    }

    /**
     * TODO: Document
     * @param iq
     */
    onMuteVideo(iq) {
        const from = iq.getAttribute('from');

        if (from !== this.focusMucJid) {
            logger.warn('Ignored mute from non focus peer');

            return;
        }
        const mute = $(iq).find('mute');

        if (mute.length && mute.text() === 'true') {
            this.eventEmitter.emit(XMPPEvents.VIDEO_MUTED_BY_FOCUS, mute.attr('actor'));
        } else {
            // XXX Why do we support anything but muting? Why do we encode the
            // value in the text of the element? Why do we use a separate XML
            // namespace?
            logger.warn('Ignoring a mute request which does not explicitly '
                + 'specify a positive mute command.');
        }
    }

    /**
     * Clean any listeners or resources, executed on leaving.
     */
    clean() {
        this._removeConnListeners.forEach(remove => remove());
        this._removeConnListeners = [];

        this.joined = false;
        this.inProgressEmitted = false;
    }

    /**
     * Leaves the room. Closes the jingle session.
     * @returns {Promise} which is resolved if XMPPEvents.MUC_LEFT is received
     * less than 5s after sending presence unavailable. Otherwise the promise is
     * rejected.
     */
    leave() {
        this.avModeration.dispose();
        this.breakoutRooms.dispose();

        const promises = [];

        this.lobby?.lobbyRoom && promises.push(this.lobby.leave());

        promises.push(new Promise((resolve, reject) => {
            let timeout = -1;

            const onMucLeft = (doReject = false) => {
                this.eventEmitter.removeListener(XMPPEvents.MUC_LEFT, onMucLeft);
                clearTimeout(timeout);
                if (doReject) {
                    // The timeout expired. Make sure we clean the EMUC state.
                    this.connection.emuc.doLeave(this.roomjid);
                    reject(new Error('The timeout for the confirmation about leaving the room expired.'));
                } else {
                    resolve();
                }
            };

            timeout = setTimeout(() => onMucLeft(true), 5000);

            this.clean();
            this.eventEmitter.on(XMPPEvents.MUC_LEFT, onMucLeft);
            this.doLeave();
        }));

        return Promise.allSettled(promises);
    }
}

/* eslint-enable newline-per-chained-call */
