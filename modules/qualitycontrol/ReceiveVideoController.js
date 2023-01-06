import { getLogger } from '@jitsi/logger';
import isEqual from 'lodash.isequal';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import { MediaType } from '../../service/RTC/MediaType';

const logger = getLogger(__filename);
const MAX_HEIGHT = 2160;
const LASTN_UNLIMITED = -1;

/**
 * This class translates the legacy signaling format between the client and the bridge (that affects bandwidth
 * allocation) to the new format described here https://github.com/jitsi/jitsi-videobridge/blob/master/doc/allocation.md
 */
class ReceiverVideoConstraints {
    /**
     * Creates a new instance.
     *
     * @param {number} lastN - Number of videos to be requested from the bridge.
     */
    constructor(lastN) {
        // The number of videos requested from the bridge.
        this._lastN = lastN ?? LASTN_UNLIMITED;

        // The number representing the maximum video height the local client should receive from the bridge/peer.
        this._maxFrameHeight = MAX_HEIGHT;

        this._receiverVideoConstraints = {
            constraints: {},
            defaultConstraints: { 'maxHeight': this._maxFrameHeight },
            lastN: this._lastN
        };
    }

    /**
     * Returns the receiver video constraints that need to be sent on the bridge channel or to the remote peer.
     */
    get constraints() {
        this._receiverVideoConstraints.lastN = this._lastN;
        if (Object.keys(this._receiverVideoConstraints.constraints)?.length) {
            /* eslint-disable no-unused-vars */
            for (const [ key, value ] of Object.entries(this._receiverVideoConstraints.constraints)) {
                value.maxHeight = this._maxFrameHeight;
            }
        } else {
            this._receiverVideoConstraints.defaultConstraints = { 'maxHeight': this._maxFrameHeight };
        }

        return this._receiverVideoConstraints;
    }

    /**
     * Updates the lastN field of the ReceiverVideoConstraints sent to the bridge.
     *
     * @param {number} value
     * @returns {boolean} Returns true if the the value has been updated, false otherwise.
     */
    updateLastN(value) {
        const changed = this._lastN !== value;

        if (changed) {
            this._lastN = value;
            logger.debug(`Updating ReceiverVideoConstraints lastN(${value})`);
        }

        return changed;
    }

    /**
     * Updates the resolution (height requested) in the contraints field of the ReceiverVideoConstraints
     * sent to the bridge.
     *
     * @param {number} maxFrameHeight
     * @requires {boolean} Returns true if the the value has been updated, false otherwise.
     */
    updateReceiveResolution(maxFrameHeight) {
        const changed = this._maxFrameHeight !== maxFrameHeight;

        if (changed) {
            this._maxFrameHeight = maxFrameHeight;
            logger.debug(`Updating receive maxFrameHeight: ${maxFrameHeight}`);
        }

        return changed;
    }

    /**
     * Updates the receiver constraints sent to the bridge.
     *
     * @param {Object} videoConstraints
     * @returns {boolean} Returns true if the the value has been updated, false otherwise.
     */
    updateReceiverVideoConstraints(videoConstraints) {
        const changed = !isEqual(this._receiverVideoConstraints, videoConstraints);

        if (changed) {
            this._receiverVideoConstraints = videoConstraints;
            logger.debug(`Updating ReceiverVideoConstraints ${JSON.stringify(videoConstraints)}`);
        }

        return changed;
    }
}

/**
 * This class manages the receive video contraints for a given {@link JitsiConference}. These constraints are
 * determined by the application based on how the remote video streams need to be displayed. This class is responsible
 * for communicating these constraints to the bridge over the bridge channel.
 */
export default class ReceiveVideoController {
    /**
     * Creates a new instance for a given conference.
     *
     * @param {JitsiConference} conference the conference instance for which the new instance will be managing
     * the receive video quality constraints.
     * @param {RTC} rtc the rtc instance which is responsible for initializing the bridge channel.
     */
    constructor(conference, rtc) {
        this._conference = conference;
        this._rtc = rtc;
        const { config } = conference.options;

        // The number of videos requested from the bridge, -1 represents unlimited or all available videos.
        this._lastN = config?.startLastN ?? (config?.channelLastN || LASTN_UNLIMITED);

        // The number representing the maximum video height the local client should receive from the bridge.
        this._maxFrameHeight = MAX_HEIGHT;

        /**
         * The map that holds the max frame height requested per remote source for p2p connection.
         *
         * @type Map<string, number>
         */
        this._sourceReceiverConstraints = new Map();

        // The default receiver video constraints.
        this._receiverVideoConstraints = new ReceiverVideoConstraints(this._lastN);

        this._conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            session => this._onMediaSessionStarted(session));
    }

    /**
     * Returns a map of all the remote source names and the corresponding max frame heights.
     *
     * @param {JingleSessionPC} mediaSession - the media session.
     * @param {number} maxFrameHeight - the height to be requested for remote sources.
     * @returns
     */
    _getDefaultSourceReceiverConstraints(mediaSession, maxFrameHeight) {
        const height = maxFrameHeight ?? MAX_HEIGHT;
        const remoteVideoTracks = mediaSession.peerconnection?.getRemoteTracks(null, MediaType.VIDEO) || [];
        const receiverConstraints = new Map();

        for (const track of remoteVideoTracks) {
            receiverConstraints.set(track.getSourceName(), height);
        }

        return receiverConstraints;
    }

    /**
     * Handles the {@link JitsiConferenceEvents.MEDIA_SESSION_STARTED}, that is when the conference creates new media
     * session. The preferred receive frameHeight is applied on the media session.
     *
     * @param {JingleSessionPC} mediaSession - the started media session.
     * @returns {void}
     * @private
     */
    _onMediaSessionStarted(mediaSession) {
        if (mediaSession.isP2P) {
            mediaSession.setReceiverVideoConstraint(this._getDefaultSourceReceiverConstraints(mediaSession));
        } else {
            this._rtc.setReceiverVideoConstraints(this._receiverVideoConstraints.constraints);
        }
    }

    /**
     * Returns the lastN value for the conference.
     *
     * @returns {number}
     */
    getLastN() {
        return this._lastN;
    }

    /**
     * Selects a new value for "lastN". The requested amount of videos are going to be delivered after the value is
     * in effect. Set to -1 for unlimited or all available videos.
     *
     * @param {number} value the new value for lastN.
     * @returns {void}
     */
    setLastN(value) {
        if (this._lastN !== value) {
            this._lastN = value;
            if (this._receiverVideoConstraints.updateLastN(value)) {
                this._rtc.setReceiverVideoConstraints(this._receiverVideoConstraints.constraints);
            }
        }
    }

    /**
     * Sets the maximum video resolution the local participant should receive from remote participants.
     *
     * @param {number|undefined} maxFrameHeight - the new value.
     * @returns {void}
     */
    setPreferredReceiveMaxFrameHeight(maxFrameHeight) {
        this._maxFrameHeight = maxFrameHeight;

        for (const session of this._conference.getMediaSessions()) {
            if (session.isP2P) {
                session.setReceiverVideoConstraint(this._getDefaultSourceReceiverConstraints(session, maxFrameHeight));
            } else if (this._receiverVideoConstraints.updateReceiveResolution(maxFrameHeight)) {
                this._rtc.setReceiverVideoConstraints(this._receiverVideoConstraints.constraints);
            }
        }
    }

    /**
     * Sets the receiver constraints for the conference.
     *
     * @param {Object} constraints The video constraints.
     */
    setReceiverConstraints(constraints) {
        if (!constraints) {
            return;
        }
        const isEndpointsFormat = Object.keys(constraints).includes('onStageEndpoints', 'selectedEndpoints');

        if (isEndpointsFormat) {
            throw new Error(
                '"onStageEndpoints" and "selectedEndpoints" are not supported when sourceNameSignaling is enabled.'
            );
        }
        const constraintsChanged = this._receiverVideoConstraints.updateReceiverVideoConstraints(constraints);

        if (constraintsChanged) {
            this._lastN = constraints.lastN ?? this._lastN;

            // Send the contraints on the bridge channel.
            this._rtc.setReceiverVideoConstraints(constraints);

            const p2pSession = this._conference.getMediaSessions().find(session => session.isP2P);

            if (!p2pSession) {
                return;
            }

            const mappedConstraints = Array.from(Object.entries(constraints.constraints))
                .map(constraint => {
                    constraint[1] = constraint[1].maxHeight;

                    return constraint;
                });

            this._sourceReceiverConstraints = new Map(mappedConstraints);

            // Send the receiver constraints to the peer through a "content-modify" message.
            p2pSession.setReceiverVideoConstraint(this._sourceReceiverConstraints);
        }
    }
}
