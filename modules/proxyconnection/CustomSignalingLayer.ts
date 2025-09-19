import { getLogger } from '@jitsi/logger';

import { MediaType } from '../../service/RTC/MediaType';
import { type IPeerMediaInfo, default as SignalingLayer } from '../../service/RTC/SignalingLayer';
import ChatRoom from '../xmpp/ChatRoom';

const logger = getLogger('proxyconnection:CustomSignalingLayer');

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
    public chatRoom: Nullable<ChatRoom>;

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
    override getPeerMediaInfo(_owner: string, _mediaType: MediaType, _sourceName: string): IPeerMediaInfo {
        return { };
    }

    /**
     * @inheritDoc
     */
    override getPeerSourceInfo(_owner: string, _sourceName: string): any {
        return undefined;
    }

    /**
     * @inheritDoc
     */
    override getSSRCOwner(ssrc: number): Optional<string> {
        return this.ssrcOwners.get(ssrc);
    }

    /**
     * @inheritDoc
     */
    override getTrackSourceName(_ssrc: number): Optional<string> {
        return undefined;
    }

    /**
     * @inheritDoc
     */
    override removeSSRCOwners(ssrcList: number[]): void {
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
    override setSSRCOwner(ssrc: number, endpointId: string): void {
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
    override setTrackMuteStatus(_sourceName: string, _muted: boolean): boolean {
        return false;
    }

    /**
     * @inheritDoc
     */
    override setTrackVideoType(_sourceName: string, _videoType: string): boolean {
        return false;
    }

    /**
     * @inheritDoc
     */
    override updateSsrcOwnersOnLeave(id: string): void {
        const ssrcs = Array.from(this.ssrcOwners)
            .filter((entry: [number, string]) => entry[1] === id)
            .map((entry: [number, string]) => entry[0]);

        if (!ssrcs?.length) {
            return;
        }

        this.removeSSRCOwners(ssrcs);
    }
}
