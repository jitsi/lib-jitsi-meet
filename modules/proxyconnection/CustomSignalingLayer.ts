import { getLogger } from '@jitsi/logger';

import { MediaType } from '../../service/RTC/MediaType';
import SignalingLayer from '../../service/RTC/SignalingLayer';
import ChatRoom from '../xmpp/ChatRoom';
import type { IPeerMediaInfo } from '../../service/RTC/SignalingLayer';
const logger = getLogger('modules/proxyconnection/CustomSignalingLayer');

/**
 * Custom semi-mock implementation for the Proxy connection service.
 */
export default class CustomSignalingLayer extends SignalingLayer {
    /**
     * A map that stores SSRCs of remote streams.
     * @type {Map<number, string>} maps SSRC number to jid
     */
    private ssrcOwners: Map<number, string>;

    /**
     *
     * @type {ChatRoom|null}
     */
    public chatRoom: ChatRoom | null;

    /**
     * Creates new instance.
     */
    constructor() {
        super();

        this.ssrcOwners = new Map<number, string>();
        this.chatRoom = null;
    }

    /**
     * @inheritDoc
     */
    getPeerMediaInfo(_owner: string, _mediaType: MediaType, _sourceName: string): IPeerMediaInfo {
        return { muted: false };
    }

    /**
     * @inheritDoc
     */
    getPeerSourceInfo(_owner: string, _sourceName: string): any {
        return undefined;
    }

    /**
     * @inheritDoc
     */
    getSSRCOwner(ssrc: number): string | undefined {
        return this.ssrcOwners.get(ssrc);
    }

    /**
     * @inheritDoc
     */
    getTrackSourceName(_ssrc: number): string | undefined {
        return undefined;
    }

    /**
     * @inheritDoc
     */
    removeSSRCOwners(ssrcList: number[]): void {
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
    setChatRoom(room: ChatRoom): void {
        this.chatRoom = room;
    }

    /**
     * @inheritDoc
     */
    setSSRCOwner(ssrc: number, endpointId: string): void {
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
    setTrackMuteStatus(_sourceName: string, _muted: boolean): boolean {
        return false;
    }

    /**
     * @inheritDoc
     */
    setTrackVideoType(_sourceName: string, _videoType: string): boolean {
        return false;
    }

    /**
     * @inheritDoc
     */
    updateSsrcOwnersOnLeave(id: string): void {
        const ssrcs = Array.from(this.ssrcOwners)
            .filter((entry: [number, string]) => entry[1] === id)
            .map((entry: [number, string]) => entry[0]);

        if (!ssrcs?.length) {
            return;
        }

        this.removeSSRCOwners(ssrcs);
    }
}
