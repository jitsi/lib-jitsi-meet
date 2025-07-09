import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import ChatRoom from './ChatRoom';
import XMPP from './xmpp';

export const IDENTITY_TYPE = 'file-sharing';

/**
 * The file metadata used in file sharing.
 * Fields like `authorParticipantId`, `authorParticipantJid`, and `authorParticipantName` and `conferenceFullName` will
 * be set by the backend, so passing them is optional.
 */
export type IFileMetadata = {
    /**
     * The ID of the participant who uploaded the file.
     */
    authorParticipantId?: string;

    /**
     * The connection JID of the participant who uploaded the file.
     */
    authorParticipantJid?: string;

    /**
     * The name of the participant who uploaded the file.
     */
    authorParticipantName?: string;

    /**
     * The jid of the conference where the file was uploaded.
     */
    conferenceFullName?: string;

    /**
     * The unique ID of the file.
     */
    fileId: string;

    /**
     * The name of the file.
     */
    fileName: string;

    /**
     * The size of the file in bytes.
     */
    fileSize: number;

    /**
     * The file type (file extension).
     */
    fileType: string;

    /**
     * The time when it was uploaded.
     */
    timestamp: number;
};

/**
 * The FileSharing logic.
 */
export default class FileSharing {
    private _mainRoom: ChatRoom;
    private _xmpp: XMPP;

    /**
     * Constructs File sharing manager for a room.
     *
     * @param {ChatRoom} room the main room.
     */
    constructor(room: ChatRoom) {
        this._mainRoom = room;
        this._xmpp = room.xmpp;

        this._handleMessages = this._handleMessages.bind(this);
        this._mainRoom.xmpp.addListener(XMPPEvents.FILE_SHARING_EVENT, this._handleMessages);
    }

    /**
     * Stops listening for events.
     */
    dispose() {
        this._mainRoom.xmpp.removeListener(XMPPEvents.FILE_SHARING_EVENT, this._handleMessages);
    }

    /**
     * Whether AV moderation is supported on backend.
     *
     * @returns {boolean} whether AV moderation is supported on backend.
     */
    isSupported() {
        return Boolean(this._xmpp.fileSharingComponentAddress);
    }

    /**
     * Returns the file sharing identity type (service name).
     *
     * @returns {string} the file sharing service name.
     */
    getIdentityType() {
        return IDENTITY_TYPE;
    }

    /**
     * Adds a file to the file sharing component after the file has been uploaded.
     * @param metadata - The metadata of the file to be added.
     */
    addFile(metadata: IFileMetadata) {
        const message = {
            type: 'add',
            xmlns: 'http://jitsi.org/jitmeet'
        };

        this._sendMessage(message, metadata);
    }

    /**
     * Removes a file from the file sharing component after the file was deleted.
     * @param fileId - The file ID of the file to be removed.
     */
    removeFile(fileId: string) {
        const message = {
            fileId,
            type: 'remove',
            xmlns: 'http://jitsi.org/jitmeet'
        };

        this._sendMessage(message);
    }

    /**
     * Helper to send a file sharing message to the component.
     *
     * @param {Object} message - Command that needs to be sent.
     * @param {Object} content - The content to add to the element created if any.
     */
    _sendMessage(message: object, content?: object) {
        const msg = $msg({ to: this._xmpp.fileSharingComponentAddress });

        msg.c(IDENTITY_TYPE, message, content ? JSON.stringify(content) : undefined).up();

        this._xmpp.connection.send(msg);
    }

    /**
     * Handles a message for file sharing.
     *
     * @param {object} payload - Arbitrary data.
     */
    _handleMessages(payload) {
        switch (payload.event) {
        case 'add':

            this._mainRoom.eventEmitter.emit(XMPPEvents.FILE_SHARING_FILE_ADDED, payload.file);

            break;
        case 'remove': {
            this._mainRoom.eventEmitter.emit(XMPPEvents.FILE_SHARING_FILE_REMOVED, payload.fileId);
            break;
        }
        case 'list': {
            this._mainRoom.eventEmitter.emit(XMPPEvents.FILE_SHARING_FILES_RECEIVED, payload.files);
            break;
        }
        }
    }
}
