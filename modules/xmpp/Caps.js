/* global $, b64_sha1, Strophe */
import XMPPEvents from '../../service/xmpp/XMPPEvents';
import Listenable from '../util/Listenable';

/**
 * The property
 */
const IDENTITY_PROPERTIES = [ 'category', 'type', 'lang', 'name' ];
const IDENTITY_PROPERTIES_FOR_COMPARE = [ 'category', 'type', 'lang' ];
const HASH = 'sha-1';

/**
 *
 * @param a
 * @param b
 */
function compareIdentities(a, b) {
    let res = 0;

    IDENTITY_PROPERTIES_FOR_COMPARE.some(key =>
        (res = ((a[key] > b[key]) && 1) || ((a[key] < b[key]) && -1)) !== 0
    );

    return res;
}

/**
 * Implements xep-0115 ( http://xmpp.org/extensions/xep-0115.html )
 */
export default class Caps extends Listenable {
    /**
     * Constructs new Caps instance.
     * @param {Strophe.Connection} connection the strophe connection object
     * @param {String} node the value of the node attribute of the "c" xml node
     * that will be sent to the other participants
     */
    constructor(connection = {}, node = 'http://jitsi.org/jitsimeet') {
        super();
        this.node = node;
        this.disco = connection.disco;
        if (!this.disco) {
            throw new Error(
                'Missing strophe-plugins '
                + '(disco and caps plugins are required)!');
        }

        this.versionToCapabilities = Object.create(null);
        this.jidToVersion = Object.create(null);
        this.version = '';
        this.rooms = new Set();

        const emuc = connection.emuc;

        emuc.addListener(XMPPEvents.EMUC_ROOM_ADDED,
            room => this._addChatRoom(room));
        emuc.addListener(XMPPEvents.EMUC_ROOM_REMOVED,
            room => this._removeChatRoom(room));
        Object.keys(emuc.rooms).forEach(jid => {
            this._addChatRoom(emuc.rooms[jid]);
        });

        Strophe.addNamespace('CAPS', 'http://jabber.org/protocol/caps');
        this.disco.addFeature(Strophe.NS.CAPS);
        connection.addHandler(this._handleCaps.bind(this), Strophe.NS.CAPS);

        this._onMucMemberLeft = this._removeJidToVersionEntry.bind(this);
    }

    /**
     * Adds new feature to the list of supported features for the local
     * participant
     * @param {String} feature the name of the feature.
     * @param {boolean} submit if true - new presence with updated "c" node
     * will be sent.
     */
    addFeature(feature, submit = false) {
        this.disco.addFeature(feature);
        this._generateVersion();
        if (submit) {
            this.submit();
        }
    }

    /**
     * Removes a feature from the list of supported features for the local
     * participant
     * @param {String} feature the name of the feature.
     * @param {boolean} submit if true - new presence with updated "c" node
     * will be sent.
     */
    removeFeature(feature, submit = false) {
        this.disco.removeFeature(feature);
        this._generateVersion();
        if (submit) {
            this.submit();
        }
    }

    /**
     * Sends new presence stanza for every room from the list of rooms.
     */
    submit() {
        this.rooms.forEach(room => room.sendPresence());
    }

    /**
     * Returns a set with the features for a participant.
     * @param {String} jid the jid of the participant
     * @param {int} timeout the timeout in ms for reply from the participant.
     * @returns {Promise<Set<String>, Error>}
     */
    getFeatures(jid, timeout = 5000) {
        const user
            = jid in this.jidToVersion ? this.jidToVersion[jid] : null;

        if (!user || !(user.version in this.versionToCapabilities)) {
            const node = user ? `${user.node}#${user.version}` : null;


            return new Promise((resolve, reject) =>
                this.disco.info(jid, node, response => {
                    const features = new Set();

                    $(response)
                        .find('>query>feature')
                        .each(
                            (idx, el) => features.add(el.getAttribute('var')));
                    if (user) {
                            // TODO: Maybe use the version + node + hash
                            // as keys?
                        this.versionToCapabilities[user.version]
                                = features;
                    }
                    resolve(features);
                }, reject, timeout)
            );
        }

        return Promise.resolve(this.versionToCapabilities[user.version]);
    }

    /**
     * Adds ChatRoom instance to the list of rooms. Adds listeners to the room
     * and adds "c" element to the presences of the room.
     * @param {ChatRoom} room the room.
     */
    _addChatRoom(room) {
        this.rooms.add(room);
        room.addListener(XMPPEvents.MUC_MEMBER_LEFT, this._onMucMemberLeft);
        this._fixChatRoomPresenceMap(room);
    }

    /**
     * Removes ChatRoom instance from the list of rooms. Removes listeners
     * added from the Caps class.
     * @param {ChatRoom} room the room.
     */
    _removeChatRoom(room) {
        this.rooms.delete(room);
        room.removeListener(XMPPEvents.MUC_MEMBER_LEFT, this._onMucMemberLeft);
    }

    /**
     * Creates/updates the "c" xml node into the presence of the passed room.
     * @param {ChatRoom} room the room.
     */
    _fixChatRoomPresenceMap(room) {
        room.addToPresence('c', {
            attributes: {
                xmlns: Strophe.NS.CAPS,
                hash: HASH,
                node: this.node,
                ver: this.version
            }
        });
    }

    /**
     * Handles this.version changes.
     */
    _notifyVersionChanged() {
        // update the version for all rooms
        this.rooms.forEach(room => this._fixChatRoomPresenceMap(room));
        this.submit();
    }

    /**
     * Generates the value for the "ver" attribute.
     */
    _generateVersion() {
        const identities = this.disco._identities.sort(compareIdentities);
        const features = this.disco._features.sort();

        this.version = b64_sha1(
            identities.reduce(
                    (accumulatedValue, identity) =>
                        `${IDENTITY_PROPERTIES.reduce(
                                (tmp, key, idx) =>
                                    tmp
                                        + (idx === 0 ? '' : '/')
                                        + identity[key],
                                '')
                             }<`,
                    '')
                + features.reduce((tmp, feature) => `${tmp + feature}<`, ''));
        this._notifyVersionChanged();
    }

    /**
     * Parses the "c" xml node from presence.
     * @param {DOMElement} stanza the presence packet
     */
    _handleCaps(stanza) {
        const from = stanza.getAttribute('from');
        const caps = stanza.querySelector('c');
        const version = caps.getAttribute('ver');
        const node = caps.getAttribute('node');
        const oldVersion = this.jidToVersion[from];

        this.jidToVersion[from] = { version,
            node };
        if (oldVersion && oldVersion.version !== version) {
            this.eventEmitter.emit(XMPPEvents.PARTCIPANT_FEATURES_CHANGED,
                from);
        }

        // return true to not remove the handler from Strophe
        return true;
    }

    /**
     * Removes entry from this.jidToVersion map.
     * @param {String} jid the jid to be removed.
     */
    _removeJidToVersionEntry(jid) {
        if (jid in this.jidToVersion) {
            delete this.jidToVersion[jid];
        }
    }
}
