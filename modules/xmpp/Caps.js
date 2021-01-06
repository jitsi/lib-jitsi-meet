/* global $ */

import { b64_sha1, Strophe } from 'strophe.js'; // eslint-disable-line camelcase

import XMPPEvents from '../../service/xmpp/XMPPEvents';
import Listenable from '../util/Listenable';

const logger = require('jitsi-meet-logger').getLogger(__filename);

/**
 * The property
 */
const IDENTITY_PROPERTIES = [ 'category', 'type', 'lang', 'name' ];
const IDENTITY_PROPERTIES_FOR_COMPARE = [ 'category', 'type', 'lang' ];
const HASH = 'sha-1';

export const ERROR_FEATURE_VERSION_MISMATCH = 'Feature version mismatch';

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
 * Produces a sha-1 from provided identity and features values.
 *
 * @param {Array<Object>} identities - The identity objects.
 * @param {Array<string>} features - The features.
 * @returns {string}
 */
function generateSha(identities, features) {
    const sortedIdentities = identities.sort(compareIdentities).reduce(
        (accumulatedValue, identity) => `${
            IDENTITY_PROPERTIES.reduce(
                (tmp, key, idx) =>
                    tmp
                        + (idx === 0 ? '' : '/')
                        + (identity[key] ? identity[key] : ''),
                '')
        }<`, '');
    const sortedFeatures = features.sort().reduce(
        (tmp, feature) => `${tmp + feature}<`, '');

    return b64_sha1(sortedIdentities + sortedFeatures);
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
                + '(disco plugin is required)!');
        }

        this.versionToCapabilities = Object.create(null);
        this.jidToVersion = Object.create(null);
        this.version = '';
        this.rooms = new Set();

        // We keep track of features added outside the library and we publish them
        // in the presence of the participant for simplicity, avoiding the disco info request-response.
        this.externalFeatures = new Set();

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
     * @param {boolean} external whether this feature was added externally to the library.
     * We put features used directly by the clients (is jibri, remote-control enabled etc.) in the presence
     * to avoid additional disco-info queries by those clients.
     */
    addFeature(feature, submit = false, external = false) {
        this.disco.addFeature(feature);
        this._generateVersion();

        if (external && !this.externalFeatures.has(feature)) {
            this.externalFeatures.add(feature);
            this.rooms.forEach(room => this._updateRoomWithExternalFeatures(room));
        }

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
     * @param {boolean} external whether this feature was added externally to the library.
     */
    removeFeature(feature, submit = false, external = false) {
        this.disco.removeFeature(feature);
        this._generateVersion();

        if (external && this.externalFeatures.has(feature)) {
            this.externalFeatures.delete(feature);
            this.rooms.forEach(room => this._updateRoomWithExternalFeatures(room));
        }

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
     * Updates the presences in the room based on the current values in externalFeatures.
     * @param {ChatRoom} room the room to update.
     * @private
     */
    _updateRoomWithExternalFeatures(room) {
        if (this.externalFeatures.size === 0) {
            room.removeFromPresence('features');
        } else {
            const children = [];

            this.externalFeatures.forEach(f => {
                children.push({
                    'tagName': 'feature',
                    attributes: { 'var': f }
                });
            });

            room.addToPresence('features', { children });
        }
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

            return this._getDiscoInfo(jid, node, timeout)
                .then(({ features, identities }) => {
                    if (user) {
                        const sha = generateSha(
                            Array.from(identities),
                            Array.from(features)
                        );
                        const receivedNode = `${user.node}#${sha}`;

                        if (receivedNode === node) {
                            this.versionToCapabilities[receivedNode] = features;

                            return features;
                        }

                        // Check once if it has been cached asynchronously.
                        if (this.versionToCapabilities[receivedNode]) {
                            return this.versionToCapabilities[receivedNode];
                        }

                        logger.error(`Expected node ${node} but received ${
                            receivedNode}`);

                        return Promise.reject(ERROR_FEATURE_VERSION_MISMATCH);
                    }

                    return features;
                });
        }

        return Promise.resolve(this.versionToCapabilities[user.version]);
    }

    /**
     * Returns a set with the features for a host.
     * @param {String} jid the jid of the host
     * @param {int} timeout the timeout in ms for reply from the host.
     * @returns {Promise<Set<String>, Error>}
     */
    getFeaturesAndIdentities(jid, node, timeout = 5000) {
        return this._getDiscoInfo(jid, node, timeout);
    }

    /**
     * Returns a set with the features and identities for a host.
     * @param {String} jid the jid of the host
     * @param {String|null} node the node to query
     * @param {int} timeout the timeout in ms for reply from the host.
     * @returns {Promise<Object>}
     * @private
     */
    _getDiscoInfo(jid, node, timeout) {
        return new Promise((resolve, reject) =>
            this.disco.info(jid, node, response => {
                const features = new Set();
                const identities = new Set();

                $(response)
                    .find('>query>feature')
                    .each(
                        (_, el) => features.add(el.getAttribute('var')));
                $(response)
                    .find('>query>identity')
                    .each(
                        (_, el) => identities.add({
                            type: el.getAttribute('type'),
                            name: el.getAttribute('name'),
                            category: el.getAttribute('category')
                        }));
                resolve({
                    features,
                    identities });
            }, reject, timeout)
        );
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

        this._updateRoomWithExternalFeatures(room);
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
    }

    /**
     * Generates the value for the "ver" attribute.
     */
    _generateVersion() {
        this.version
            = generateSha(this.disco._identities, this.disco._features);

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
            this.eventEmitter.emit(XMPPEvents.PARTICIPANT_FEATURES_CHANGED, from);
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
