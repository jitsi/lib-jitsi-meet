import { getLogger } from '@jitsi/logger';
import isEqual from 'lodash.isequal';
import { $msg } from 'strophe.js';

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import { JITSI_MEET_MUC_TYPE } from './xmpp';

const logger = getLogger(__filename);

/**
 * Helper class for handling room metadata.
 */
export default class RoomMetadata {
    room: any;
    _metadata: any;

    /**
     * Constructs lobby room.
     *
     * @param {ChatRoom} room the room we are in.
     */
    constructor(room) {
        this.room = room;

        this._handleMessages = this._handleMessages.bind(this);
        this.room.xmpp.addListener(XMPPEvents.ROOM_METADATA_EVENT, this._handleMessages);

        this._metadata = {};
    }

    /**
     * Stops listening for events.
     */
    dispose() {
        this.room.xmpp.removeListener(XMPPEvents.ROOM_METADATA_EVENT, this._handleMessages);
    }

    /**
     * Sets metadata for the given key.
     *
     * @param {string} key - key under which the metadata will be stored.
     * @param {object} data - data to be stored.
     */
    setMetadata(key, data) {
        if (!this.isSupported() || !this.room.isModerator()) {
            logger.error(`Cannot set room metadata - supported:${this.isSupported()},
                moderator:${this.room.isModerator()}`);

            return;
        }

        const message = {
            key,
            data
        };

        this._sendMessage(message);
    }

    /**
     * Gets the stored metadata (all of it).
     *
     * @returns The stored metadata.
     */
    getMetadata() {
        return this._metadata;
    }

    /**
     * Whether Breakout Rooms support is enabled in the backend or not.
     */
    isSupported() {
        return Boolean(this.getComponentAddress());
    }

    /**
     * Gets the address of the Breakout Rooms XMPP component.
     *
     * @returns The address of the component.
     */
    getComponentAddress() {
        return this.room.xmpp.roomMetadataComponentAddress;
    }

    /**
     * Handles a message with metadata updates.
     *
     * @param {object} payload - Arbitrary data.
     */
    _handleMessages(payload) {
        const { metadata } = payload;

        if (!metadata || isEqual(this._metadata, metadata)) {
            return;
        }

        this._metadata = metadata;
        this.room.eventEmitter.emit(XMPPEvents.ROOM_METADATA_UPDATED, metadata);
    }

    /**
     * Helper to send a breakout rooms message to the component.
     *
     * @param {Object} message - Command that needs to be sent.
     */
    _sendMessage(message) {
        message[JITSI_MEET_MUC_TYPE] = 'room_metadata';

        const msg = $msg({ to: this.getComponentAddress() });

        msg.c('room_metadata', {
            room: this.room.roomjid,
            xmlns: 'http://jitsi.org/jitmeet'
        }, JSON.stringify(message)).up();

        this.room.xmpp.connection.send(msg);
    }
}
