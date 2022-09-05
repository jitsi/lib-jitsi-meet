export const SOURCE_INFO_PRESENCE_ELEMENT: "SourceInfo";
/**
 * Default XMPP implementation of the {@link SignalingLayer} interface. Obtains
 * the data from the MUC presence.
 */
export default class SignalingLayerImpl extends SignalingLayer {
    /**
     * Creates new instance.
     */
    constructor();
    /**
     * A map that stores SSRCs of remote streams. And is used only locally
     * We store the mapping when jingle is received, and later is used
     * onaddstream webrtc event where we have only the ssrc
     * FIXME: This map got filled and never cleaned and can grow during long
     * conference
     * @type {Map<number, string>} maps SSRC number to jid
     */
    ssrcOwners: Map<number, string>;
    /**
     *
     * @type {ChatRoom|null}
     */
    chatRoom: any | null;
    /**
     * @type {Map<SourceName, SourceInfo>}
     * @private
     */
    private _localSourceState;
    /**
     * @type {Map<EndpointId, Map<SourceName, SourceInfo>>}
     * @private
     */
    private _remoteSourceState;
    /**
     * A map that stores the source name of a track identified by it's ssrc.
     * We store the mapping when jingle is received, and later is used
     * onaddstream webrtc event where we have only the ssrc
     * FIXME: This map got filled and never cleaned and can grow during long
     * conference
     * @type {Map<number, string>} maps SSRC number to source name
     */
    _sourceNames: Map<number, string>;
    /**
     * Adds <SourceInfo> element to the local presence.
     *
     * @returns {void}
     * @private
     */
    private _addLocalSourceInfoToPresence;
    /**
     * Check is given endpoint has advertised <SourceInfo/> in it's presence which means that the source name signaling
     * is used by this endpoint.
     *
     * @param {EndpointId} endpointId
     * @returns {boolean}
     */
    _doesEndpointSendNewSourceInfo(endpointId: any): boolean;
    /**
     * Sets the <tt>ChatRoom</tt> instance used and binds presence listeners.
     * @param {ChatRoom} room
     */
    setChatRoom(room: any): void;
    _audioMuteHandler: (node: any, from: any) => void;
    _videoMuteHandler: (node: any, from: any) => void;
    _videoTypeHandler: (node: any, from: any) => void;
    /**
     * Binds event listeners to the chat room instance.
     * @param {ChatRoom} room
     * @private
     * @returns {void}
     */
    private _bindChatRoomEventHandlers;
    _sourceInfoHandler: (node: any, mucNick: any) => void;
    _memberLeftHandler: (jid: any) => void;
    /**
     * Finds the first source of given media type for the given endpoint.
     * @param endpointId
     * @param mediaType
     * @returns {SourceInfo|null}
     * @private
     */
    private _findEndpointSourceInfoForMediaType;
}
import SignalingLayer from "../../service/RTC/SignalingLayer";
