import { getLogger } from '@jitsi/logger';

import { MediaType } from '../../service/RTC/MediaType';
import SignalingLayer from '../../service/RTC/SignalingLayer';
import ChatRoom from '../xmpp/ChatRoom';

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
    getPeerMediaInfo(owner: string, mediaType: MediaType, sourceName: string): { muted: boolean; videoType?: string; } { // eslint-disable-line @typescript-eslint/no-unused-vars
        return { muted: false };
    }

    /**
     * @inheritDoc
     */
    getPeerSourceInfo(owner: string, sourceName: string): any { // eslint-disable-line @typescript-eslint/no-unused-vars
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
    getTrackSourceName(ssrc: number): string | undefined { // eslint-disable-line @typescript-eslint/no-unused-vars
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
    setTrackMuteStatus(sourceName: string, muted: boolean): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
        return false;
    }

    /**
     * @inheritDoc
     */
    setTrackVideoType(sourceName: string, videoType: string): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
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
