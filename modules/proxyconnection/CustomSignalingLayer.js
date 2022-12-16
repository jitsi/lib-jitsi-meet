import { getLogger } from '@jitsi/logger';

import SignalingLayer from '../../service/RTC/SignalingLayer';

const logger = getLogger(__filename);

/**
 * Custom semi-mock implementation for the Proxy connection service.
 */
export default class CustomSignalingLayer extends SignalingLayer {
    /**
     * Creates new instance.
     */
    constructor() {
        super();

        /**
         * A map that stores SSRCs of remote streams.
         * @type {Map<number, string>} maps SSRC number to jid
         */
        this.ssrcOwners = new Map();

        /**
         *
         * @type {ChatRoom|null}
         */
        this.chatRoom = null;
    }

    /**
     * @inheritDoc
     */
    getPeerMediaInfo(owner, mediaType, sourceName) { // eslint-disable-line no-unused-vars
        return {};
    }

    /**
     * @inheritDoc
     */
    getPeerSourceInfo(owner, sourceName) { // eslint-disable-line no-unused-vars
        return undefined;
    }

    /**
     * @inheritDoc
     */
    getSSRCOwner(ssrc) {
        return this.ssrcOwners.get(ssrc);
    }

    /**
     * @inheritDoc
     */
    getTrackSourceName(ssrc) { // eslint-disable-line no-unused-vars
        return undefined;
    }

    /**
     * @inheritDoc
     */
    removeSSRCOwners(ssrcList) {
        if (!ssrcList?.length) {
            return;
        }

        for (const ssrc of ssrcList) {
            this.ssrcOwners.delete(ssrc);
        }
    }

    /**
     * Sets the <tt>ChatRoom</tt> instance used.
     * @param {ChatRoom} room
     */
    setChatRoom(room) {
        this.chatRoom = room;
    }

    /**
     * @inheritDoc
     */
    setSSRCOwner(ssrc, endpointId) {
        if (typeof ssrc !== 'number') {
            throw new TypeError(`SSRC(${ssrc}) must be a number`);
        }

        // Now signaling layer instance is shared between different JingleSessionPC instances, so although very unlikely
        // an SSRC conflict could potentially occur. Log a message to make debugging easier.
        const existingOwner = this.ssrcOwners.get(ssrc);

        if (existingOwner && existingOwner !== endpointId) {
            logger.error(`SSRC owner re-assigned from ${existingOwner} to ${endpointId}`);
        }
        this.ssrcOwners.set(ssrc, endpointId);
    }

    /**
     * @inheritDoc
     */
    setTrackMuteStatus(sourceName, muted) { // eslint-disable-line no-unused-vars
        return false;
    }

    /**
     * @inheritDoc
     */
    setTrackVideoType(sourceName, videoType) { // eslint-disable-line no-unused-vars
        return false;
    }

    /**
     * @inheritDoc
     */
    setTrackSourceName(ssrc, sourceName) { // eslint-disable-line no-unused-vars
    }

    /**
     * @inheritDoc
     */
    updateSsrcOwnersOnLeave(id) {
        const ssrcs = Array.from(this.ssrcOwners)
            .filter(entry => entry[1] === id)
            .map(entry => entry[0]);

        if (!ssrcs?.length) {
            return;
        }

        this.removeSSRCOwners(ssrcs);
    }
}
