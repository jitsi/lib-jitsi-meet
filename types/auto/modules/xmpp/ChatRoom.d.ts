/**
 * Returns array of JS objects from the presence JSON associated with the passed
 / nodeName
 * @param pres the presence JSON
 * @param nodeName the name of the node (videomuted, audiomuted, etc)
 */
export function filterNodeFromPresenceJSON(pres: any, nodeName: any): any[];
export namespace parser {
    function packet2JSON(xmlElement: any, nodes: any): void;
    function packet2JSON(xmlElement: any, nodes: any): void;
    function json2packet(nodes: any, packet: any): void;
    function json2packet(nodes: any, packet: any): void;
}
/**
 *
 */
export default class ChatRoom extends Listenable {
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
    constructor(connection: XmppConnection, jid: any, password: any, XMPP: any, options: any);
    xmpp: any;
    connection: XmppConnection;
    roomjid: any;
    myroomjid: any;
    password: any;
    replaceParticipant: boolean;
    members: {};
    presMap: {};
    presHandlers: {};
    _removeConnListeners: any[];
    joined: boolean;
    inProgressEmitted: boolean;
    role: any;
    focusMucJid: any;
    noBridgeAvailable: boolean;
    options: any;
    moderator: Moderator;
    lobby: Lobby;
    avModeration: AVModeration;
    breakoutRooms: BreakoutRooms;
    lastPresences: {};
    phoneNumber: any;
    phonePin: any;
    connectionTimes: {};
    participantPropertyListener: any;
    locked: boolean;
    transcriptionStatus: JitsiTranscriptionStatus.JitsiTranscriptionStatus;
    /**
     *
     */
    initPresenceMap(options?: {}): void;
    presenceUpdateTime: number;
    /**
     * Joins the chat room.
     * @param {string} password - Password to unlock room on joining.
     * @returns {Promise} - resolved when join completes. At the time of this
     * writing it's never rejected.
     */
    join(password: string, replaceParticipant: any): Promise<any>;
    /**
     *
     * @param fromJoin - Whether this is initial presence to join the room.
     */
    sendPresence(fromJoin: any): void;
    presenceSyncTime: number;
    /**
     * Sends the presence unavailable, signaling the server
     * we want to leave the room.
     */
    doLeave(): void;
    /**
     *
     */
    discoRoomInfo(): void;
    membersOnlyEnabled: any;
    /**
     * Sets the meeting unique Id (received from the backend).
     *
     * @param {string} meetingId - The new meetings id.
     * @returns {void}
     */
    setMeetingId(meetingId: string): void;
    meetingId: any;
    /**
     *
     */
    createNonAnonymousRoom(): void;
    /**
     * Handles Xmpp Connection status updates.
     *
     * @param {Strophe.Status} status - The Strophe connection status.
     */
    onConnStatusChanged(status: any): void;
    /**
     *
     * @param pres
     */
    onPresence(pres: any): void;
    restartByTerminateSupported: boolean;
    /**
     * Extracts the features from the presence.
     * @param node the node to process.
     * @return features the Set of features where extracted data is added.
     * @private
     */
    private _extractFeatures;
    /**
     * Initialize some properties when the focus participant is verified.
     * @param from jid of the focus
     * @param features the features reported in jicofo presence
     */
    _initFocus(from: any, features: any): void;
    focusFeatures: any;
    /**
     * Sets the special listener to be used for "command"s whose name starts
     * with "jitsi_participant_".
     */
    setParticipantPropertyListener(listener: any): void;
    /**
     * Checks if Jicofo supports restarting Jingle session after 'session-terminate'.
     * @returns {boolean}
     */
    supportsRestartByTerminate(): boolean;
    /**
     *
     * @param node
     * @param from
     */
    processNode(node: any, from: any): void;
    /**
     * Send text message to the other participants in the conference
     * @param message
     * @param elementName
     */
    sendMessage(message: any, elementName: any): void;
    /**
     * Send private text message to another participant of the conference
     * @param id id/muc resource of the receiver
     * @param message
     * @param elementName
     */
    sendPrivateMessage(id: any, message: any, elementName: any): void;
    /**
     *
     * @param subject
     */
    setSubject(subject: any): void;
    /**
     * Called when participant leaves.
     * @param jid the jid of the participant that leaves
     * @param skipEvents optional params to skip any events, including check
     * whether this is the focus that left
     */
    onParticipantLeft(jid: any, skipEvents: any): void;
    /**
     *
     * @param pres
     * @param from
     */
    onPresenceUnavailable(pres: any, from: any): boolean;
    /**
     *
     * @param msg
     * @param from
     */
    onMessage(msg: any, from: any): boolean;
    /**
     *
     * @param pres
     * @param from
     */
    onPresenceError(pres: any, from: any): void;
    /**
     *
     * @param jid
     * @param affiliation
     */
    setAffiliation(jid: any, affiliation: any): void;
    /**
     *
     * @param jid
     * @param reason
     */
    kick(jid: any, reason?: string): void;
    /**
     *
     * @param key
     * @param onSuccess
     * @param onError
     * @param onNotSupported
     */
    lockRoom(key: any, onSuccess: any, onError: any, onNotSupported: any): void;
    /**
     * Turns off or on the members only config for the main room.
     *
     * @param {boolean} enabled - Whether to turn it on or off.
     * @param onSuccess - optional callback.
     * @param onError - optional callback.
     */
    setMembersOnly(enabled: boolean, onSuccess: any, onError: any): void;
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
    addToPresence(key: any, values: any): boolean | null;
    /**
     * Adds the key to the presence map, overriding any previous value.
     * @param key The key to add or replace.
     * @param values The new values.
     * @returns {boolean|null} <tt>true</tt> if the operation succeeded or <tt>false</tt> when no add or replace was
     * performed as the value was already there.
     */
    addOrReplaceInPresence(key: any, values: any): boolean | null;
    /**
     * Retrieves a value from the presence map.
     *
     * @param {string} key - The key to find the value for.
     * @returns {Object?}
     */
    getFromPresence(key: string): any | null;
    /**
     * Removes a key from the presence map.
     * @param key
     */
    removeFromPresence(key: any): void;
    /**
     *
     * @param name
     * @param handler
     */
    addPresenceListener(name: any, handler: any): void;
    /**
     *
     * @param name
     * @param handler
     */
    removePresenceListener(name: any, handler: any): void;
    /**
     * Checks if the user identified by given <tt>mucJid</tt> is the conference
     * focus.
     * @param mucJid the full MUC address of the user to be checked.
     * @returns {boolean|null} <tt>true</tt> if MUC user is the conference focus
     * or <tt>false</tt> if is not. When given <tt>mucJid</tt> does not exist in
     * the MUC then <tt>null</tt> is returned.
     */
    isFocus(mucJid: any): boolean | null;
    /**
     *
     */
    isModerator(): boolean;
    /**
     *
     * @param peerJid
     */
    getMemberRole(peerJid: any): any;
    /**
     *
     * @param mute
     */
    addAudioInfoToPresence(mute: any): boolean;
    /**
     *
     * @param mute
     */
    addVideoInfoToPresence(mute: any): boolean;
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
    getMediaPresenceInfo(endpointId: string, mediaType: MediaType): any;
    /**
     * Returns the last presence advertised by a MUC member.
     * @param {string} mucNick
     * @returns {*}
     */
    getLastPresence(mucNick: string): any;
    /**
     * Returns true if the SIP calls are supported and false otherwise
     */
    isSIPCallingSupported(): boolean;
    /**
     * Dials a number.
     * @param number the number
     */
    dial(number: any): any;
    /**
     * Hangup an existing call
     */
    hangup(): any;
    /**
     *
     * @returns {Lobby}
     */
    getLobby(): Lobby;
    /**
     * @returns {AVModeration}
     */
    getAVModeration(): AVModeration;
    /**
     * @returns {BreakoutRooms}
     */
    getBreakoutRooms(): BreakoutRooms;
    /**
     * Returns the phone number for joining the conference.
     */
    getPhoneNumber(): any;
    /**
     * Returns the pin for joining the conference with phone.
     */
    getPhonePin(): any;
    /**
     * Returns the meeting unique ID if any came from backend.
     *
     * @returns {string} - The meeting ID.
     */
    getMeetingId(): string;
    /**
     * Mutes remote participant.
     * @param jid of the participant
     * @param mute
     * @param mediaType
     */
    muteParticipant(jid: any, mute: any, mediaType: any): void;
    /**
     * TODO: Document
     * @param iq
     */
    onMute(iq: any): void;
    /**
     * TODO: Document
     * @param iq
     */
    onMuteVideo(iq: any): void;
    /**
     * Clean any listeners or resources, executed on leaving.
     */
    clean(): void;
    /**
     * Leaves the room. Closes the jingle session.
     * @returns {Promise} which is resolved if XMPPEvents.MUC_LEFT is received
     * less than 5s after sending presence unavailable. Otherwise the promise is
     * rejected.
     */
    leave(): Promise<any>;
}
import Listenable from "../util/Listenable";
import XmppConnection from "./XmppConnection";
import Moderator from "./moderator";
import Lobby from "./Lobby";
import AVModeration from "./AVModeration";
import BreakoutRooms from "./BreakoutRooms";
import * as JitsiTranscriptionStatus from "../../JitsiTranscriptionStatus";
import { MediaType } from "../../service/RTC/MediaType";
