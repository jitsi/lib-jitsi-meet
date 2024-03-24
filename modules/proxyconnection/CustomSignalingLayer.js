import SignalingLayer from '../../service/RTC/SignalingLayer';

/**
 * Custom semi-mock implementation for the Proxy connection service.
 */
export default class CustomSignalingLayer extends SignalingLayer {

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
    getSSRCOwner() {
        return undefined;
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
    setTrackMuteStatus(sourceName, muted) { // eslint-disable-line no-unused-vars
        return false;
    }

    /**
     * @inheritDoc
     */
    setTrackVideoType(sourceName, videoType) { // eslint-disable-line no-unused-vars
        return false;
    }
}
