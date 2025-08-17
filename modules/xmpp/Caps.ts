import { Strophe } from 'strophe.js'; // eslint-disable-line camelcase

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import Listenable from '../util/Listenable';
import $ from '../util/XMLParser';

import ChatRoom from './ChatRoom';
import sha1 from './sha1';

/**
 * The property
 */
const IDENTITY_PROPERTIES = [ 'category', 'type', 'lang', 'name' ];
const IDENTITY_PROPERTIES_FOR_COMPARE = [ 'category', 'type', 'lang' ];
const HASH = 'sha-1';

type Identity = {
    category: string;
    lang?: string;
    name?: string;
    type: string;
};

/**
 *
 * @param a
 * @param b
 */
function compareIdentities(a: Identity, b: Identity): number {
    let res = 0;

    IDENTITY_PROPERTIES_FOR_COMPARE.some(key =>
        (res = ((a[key as keyof Identity] > b[key as keyof Identity]) && 1) || ((a[key as keyof Identity] < b[key as keyof Identity]) && -1)) !== 0
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
function generateSha(identities: Identity[], features: string[]): string {
    const sortedIdentities = identities.sort(compareIdentities).reduce(
        (accumulatedValue, identity) => `${
            IDENTITY_PROPERTIES.reduce(
                (tmp, key, idx) =>
                    tmp
                        + (idx === 0 ? '' : '/')
                        + (identity[key as keyof Identity] ? identity[key as keyof Identity] : ''),
                '')
        }<`, '');
    const sortedFeatures = features.sort().reduce(
        (tmp, feature) => `${tmp + feature}<`, '');

    return sha1.b64_sha1(sortedIdentities + sortedFeatures);
}

/**
 * Parses the disco-info node and returns the sets of features and identities.
 * @param {String} node The node with results to parse.
 * @returns {{features: Set<string>, identities: Set<Identity>}}
 */
export function parseDiscoInfo(node: Element): { features: Set<string>; identities: Set<Identity>; } {
    const features = new Set<string>();
    const identities = new Set<Identity>();

    $(node).find('>query>feature')
        .each((_: unknown, el: Element) => features.add(el.getAttribute('var') || ''));
    $(node).find('>query>identity')
        .each((_: unknown, el: Element) => identities.add({
            category: el.getAttribute('category') || '',
            name: el.getAttribute('name') || '',
            type: el.getAttribute('type') || ''
        }));

    return {
        features,
        identities
    };
}

/**
 * Implements xep-0115 ( http://xmpp.org/extensions/xep-0115.html )
 */
export default class Caps extends Listenable {
    public node: string;
    public disco: any; // Todo - strophe.disco
    public version: string;
    public rooms: Set<ChatRoom>;
    public externalFeatures: Set<string>;
    /**
     * Constructs new Caps instance.
     * @param {Strophe.Connection} connection the strophe connection object
     * @param {String} node the value of the node attribute of the "c" xml node
     * that will be sent to the other participants
     */
    constructor(connection: Strophe.Connection = {}, node: string = 'http://jitsi.org/jitsimeet') {
        super();
        this.node = node;
        this.disco = connection.disco;
        if (!this.disco) {
            throw new Error(
                'Missing strophe-plugins '
                + '(disco plugin is required)!');
        }

        this.version = '';
        this.rooms = new Set<ChatRoom>();

        // We keep track of features added outside the library and we publish them
        // in the presence of the participant for simplicity, avoiding the disco info request-response.
        this.externalFeatures = new Set<string>();

        const emuc = connection.emuc;

        emuc.addListener(XMPPEvents.EMUC_ROOM_ADDED,
            (room: ChatRoom) => this._addChatRoom(room));
        emuc.addListener(XMPPEvents.EMUC_ROOM_REMOVED,
            (room: ChatRoom) => this._removeChatRoom(room));
        Object.keys(emuc.rooms).forEach((jid: string) => {
            this._addChatRoom(emuc.rooms[jid]);
        });

        Strophe.addNamespace('CAPS', 'http://jabber.org/protocol/caps');
        this.disco.addFeature(Strophe.NS.CAPS);
    }


    /**
     * Returns a set with the features and identities for a host.
     * @param {String} jid the jid of the host
     * @param {String|null} node the node to query
     * @param {int} timeout the timeout in ms for reply from the host.
     * @returns {Promise<{features: Set<string>, identities: Set<Identity>}>}
     * @private
     */
    private _getDiscoInfo(jid: string, node: string | null, timeout: number): Promise<{ features: Set<string>; identities: Set<Identity>; }> {
        return new Promise((resolve, reject) =>
            this.disco.info(jid, node, (response: Element) => {
                resolve(parseDiscoInfo(response));
            }, reject, timeout)
        );
    }

    /**
     * Adds ChatRoom instance to the list of rooms. Adds listeners to the room
     * and adds "c" element to the presences of the room.
     * @param {ChatRoom} room the room.
     */
    private _addChatRoom(room: ChatRoom): void {
        this.rooms.add(room);
        this._fixChatRoomPresenceMap(room);

        this._updateRoomWithExternalFeatures(room);
    }

    /**
     * Creates/updates the "c" xml node into the presence of the passed room.
     * @param {ChatRoom} room the room.
     */
    private _fixChatRoomPresenceMap(room: ChatRoom): void {
        room.addOrReplaceInPresence('c', {
            attributes: {
                hash: HASH,
                node: this.node,
                ver: this.version,
                xmlns: Strophe.NS.CAPS
            }
        });
    }

    /**
     * Generates the value for the "ver" attribute.
     */
    private _generateVersion(): void {
        this.version
            = generateSha(this.disco._identities, this.disco._features);

        this._notifyVersionChanged();
    }


    /**
     * Handles this.version changes.
     */
    private _notifyVersionChanged(): void {
        // update the version for all rooms
        this.rooms.forEach(room => this._fixChatRoomPresenceMap(room));
    }

    /**
     * Removes ChatRoom instance from the list of rooms. Removes listeners
     * added from the Caps class.
     * @param {ChatRoom} room the room.
     */
    private _removeChatRoom(room: ChatRoom): void {
        this.rooms.delete(room);
    }

    /**
     * Updates the presences in the room based on the current values in externalFeatures.
     * @param {ChatRoom} room the room to update.
     * @private
     */
    private _updateRoomWithExternalFeatures(room: ChatRoom): void {
        if (this.externalFeatures.size === 0) {
            room.removeFromPresence('features');
        } else {
            const children: Array<{ attributes: { var: string; }; tagName: string; }> = [];

            this.externalFeatures.forEach(f => {
                children.push({
                    attributes: { 'var': f },
                    'tagName': 'feature'
                });
            });

            room.addOrReplaceInPresence('features', { children });
        }
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
    public addFeature(feature: string, submit: boolean = false, external: boolean = false): void {
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
     * Returns a set with the features for a host.
     * @param {String} jid the jid of the host
     * @param {int} timeout the timeout in ms for reply from the host.
     * @returns {Promise<{features: Set<string>, identities: Set<Identity>}>}
     */
    public getFeaturesAndIdentities(jid: string, node: string, timeout: number = 5000): Promise<{ features: Set<string>; identities: Set<Identity>; }> {
        return this._getDiscoInfo(jid, node, timeout);
    }

    /**
     * Removes a feature from the list of supported features for the local
     * participant
     * @param {String} feature the name of the feature.
     * @param {boolean} submit if true - new presence with updated "c" node
     * will be sent.
     * @param {boolean} external whether this feature was added externally to the library.
     */
    public removeFeature(feature: string, submit: boolean = false, external: boolean = false): void {
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
    public submit(): void {
        this.rooms.forEach(room => room.sendPresence(undefined));
    }
}
