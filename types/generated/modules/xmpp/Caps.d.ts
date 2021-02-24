export const ERROR_FEATURE_VERSION_MISMATCH: "Feature version mismatch";
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
    constructor(connection?: any, node?: string);
    node: string;
    disco: any;
    versionToCapabilities: any;
    jidToVersion: any;
    version: string;
    rooms: any;
    externalFeatures: any;
    _onMucMemberLeft: any;
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
    addFeature(feature: string, submit?: boolean, external?: boolean): void;
    /**
     * Removes a feature from the list of supported features for the local
     * participant
     * @param {String} feature the name of the feature.
     * @param {boolean} submit if true - new presence with updated "c" node
     * will be sent.
     * @param {boolean} external whether this feature was added externally to the library.
     */
    removeFeature(feature: string, submit?: boolean, external?: boolean): void;
    /**
     * Sends new presence stanza for every room from the list of rooms.
     */
    submit(): void;
    /**
     * Updates the presences in the room based on the current values in externalFeatures.
     * @param {ChatRoom} room the room to update.
     * @private
     */
    private _updateRoomWithExternalFeatures;
    /**
     * Returns a set with the features for a participant.
     * @param {String} jid the jid of the participant
     * @param {int} timeout the timeout in ms for reply from the participant.
     * @returns {Promise<Set<String>, Error>}
     */
    getFeatures(jid: string, timeout?: any): Promise<any, Error>;
    /**
     * Returns a set with the features for a host.
     * @param {String} jid the jid of the host
     * @param {int} timeout the timeout in ms for reply from the host.
     * @returns {Promise<Set<String>, Error>}
     */
    getFeaturesAndIdentities(jid: string, node: any, timeout?: any): Promise<any, Error>;
    /**
     * Returns a set with the features and identities for a host.
     * @param {String} jid the jid of the host
     * @param {String|null} node the node to query
     * @param {int} timeout the timeout in ms for reply from the host.
     * @returns {Promise<Object>}
     * @private
     */
    private _getDiscoInfo;
    /**
     * Adds ChatRoom instance to the list of rooms. Adds listeners to the room
     * and adds "c" element to the presences of the room.
     * @param {ChatRoom} room the room.
     */
    _addChatRoom(room: any): void;
    /**
     * Removes ChatRoom instance from the list of rooms. Removes listeners
     * added from the Caps class.
     * @param {ChatRoom} room the room.
     */
    _removeChatRoom(room: any): void;
    /**
     * Creates/updates the "c" xml node into the presence of the passed room.
     * @param {ChatRoom} room the room.
     */
    _fixChatRoomPresenceMap(room: any): void;
    /**
     * Handles this.version changes.
     */
    _notifyVersionChanged(): void;
    /**
     * Generates the value for the "ver" attribute.
     */
    _generateVersion(): void;
    /**
     * Parses the "c" xml node from presence.
     * @param {DOMElement} stanza the presence packet
     */
    _handleCaps(stanza: any): boolean;
    /**
     * Removes entry from this.jidToVersion map.
     * @param {String} jid the jid to be removed.
     */
    _removeJidToVersionEntry(jid: string): void;
}
import Listenable from "../util/Listenable";
