import { getLogger } from '@jitsi/logger';
import { isEqual } from 'lodash-es';

import { MediaType } from '../../service/RTC/MediaType';
import { ASSUMED_BANDWIDTH_BPS, LAST_N_UNLIMITED } from '../../service/RTC/StandardVideoQualitySettings';

const logger = getLogger(__filename);
const MAX_HEIGHT = 2160;

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
     */
    constructor(conference) {
        this._conference = conference;
        this._rtc = conference.rtc;
        const { config } = conference.options;

        // The number of videos requested from the bridge, -1 represents unlimited or all available videos.
        this._lastN = config?.startLastN ?? (config?.channelLastN || LAST_N_UNLIMITED);

        // The number representing the maximum video height the local client should receive from the bridge.
        this._maxFrameHeight = MAX_HEIGHT;

        /**
         * The map that holds the max frame height requested per remote source for p2p connection.
         *
         * @type Map<string, number>
         */
        this._sourceReceiverConstraints = new Map();

        /**
         * The number of bps requested from the bridge.
         */
        this._assumedBandwidthBps = ASSUMED_BANDWIDTH_BPS;

        this._lastNLimitedByCpu = false;
        this._receiveResolutionLimitedByCpu = false;

        // The default receiver video constraints.
        this._receiverVideoConstraints = {
            assumedBandwidthBps: this._assumedBandwidthBps,
            lastN: this._lastN
        };
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
     * Updates the source based constraints based on the maxHeight set.
     *
     * @param {number} maxFrameHeight - the height to be requested for remote sources.
     * @returns {void}
     */
    _updateIndividualConstraints(maxFrameHeight) {
        const individualConstraints = this._receiverVideoConstraints.constraints;

        if (individualConstraints && Object.keys(individualConstraints).length) {
            for (const value of Object.values(individualConstraints)) {
                value.maxHeight = maxFrameHeight ?? Math.min(value.maxHeight, this._maxFrameHeight);
            }
        } else {
            this._receiverVideoConstraints.defaultConstraints = { 'maxHeight': this._maxFrameHeight };
        }
    }

    /**
     * Returns the last set of receiver constraints that were set on the bridge channel.
     *
     * @returns {Object}
     */
    getCurrentReceiverConstraints() {
        return this._receiverVideoConstraints;
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
     * Checks whether last-n was lowered because of a cpu limitation.
     *
     * @returns {boolean}
     */
    isLastNLimitedByCpu() {
        return this._lastNLimitedByCpu;
    }

    /**
     * Handles the {@link JitsiConferenceEvents.MEDIA_SESSION_STARTED}, that is when the conference creates new media
     * session. The preferred receive frameHeight is applied on the media session.
     *
     * @param {JingleSessionPC} mediaSession - the started media session.
     * @returns {void}
     */
    onMediaSessionStarted(mediaSession) {
        if (mediaSession.isP2P) {
            mediaSession.setReceiverVideoConstraint(this._getDefaultSourceReceiverConstraints(mediaSession));
        } else {
            this._rtc.setReceiverVideoConstraints(this._receiverVideoConstraints);
        }
    }

    /**
     * Sets the assumed bandwidth bps the local participant should receive from remote participants.
     *
     * @param {number|undefined} assumedBandwidthBps - the new value.
     * @returns {void}
     */
    setAssumedBandwidthBps(assumedBandwidthBps) {
        if (this._receiverVideoConstraints.assumedBandwidthBps !== assumedBandwidthBps) {
            this._receiverVideoConstraints.assumedBandwidthBps = assumedBandwidthBps;
            this._rtc.setReceiverVideoConstraints(this._receiverVideoConstraints);
        }
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
            this._receiverVideoConstraints.lastN = value;
            this._rtc.setReceiverVideoConstraints(this._receiverVideoConstraints);
        }
    }

    /**
     * Updates the lastNLimitedByCpu field.
     *
     * @param {boolean} enabled
     * @returns {void}
     */
    setLastNLimitedByCpu(enabled) {
        if (this._lastNLimitedByCpu !== enabled) {
            this._lastNLimitedByCpu = enabled;
            logger.info(`ReceiveVideoController - Setting the lastNLimitedByCpu flag to ${enabled}`);
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
            } else {
                this._updateIndividualConstraints(maxFrameHeight);
                this._rtc.setReceiverVideoConstraints(this._receiverVideoConstraints);
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
        const constraintsChanged = !isEqual(this._receiverVideoConstraints, constraints);

        if (constraintsChanged || this._lastNLimitedByCpu || this._receiveResolutionLimitedByCpu) {
            this._receiverVideoConstraints = constraints;

            this._assumedBandwidthBps = constraints.assumedBandwidthBps ?? this._assumedBandwidthBps;
            this._lastN = typeof constraints.lastN !== 'undefined' && !this._lastNLimitedByCpu
                ? constraints.lastN : this._lastN;
            this._receiverVideoConstraints.lastN = this._lastN;
            this._receiveResolutionLimitedByCpu && this._updateIndividualConstraints();

            // Send the contraints on the bridge channel.
            this._rtc.setReceiverVideoConstraints(this._receiverVideoConstraints);

            const p2pSession = this._conference.getMediaSessions().find(session => session.isP2P);

            if (!p2pSession || !this._receiverVideoConstraints.constraints) {
                return;
            }

            const mappedConstraints = Array.from(Object.entries(this._receiverVideoConstraints.constraints))
                .map(constraint => {
                    constraint[1] = constraint[1].maxHeight;

                    return constraint;
                });

            this._sourceReceiverConstraints = new Map(mappedConstraints);

            // Send the receiver constraints to the peer through a "content-modify" message.
            p2pSession.setReceiverVideoConstraint(this._sourceReceiverConstraints);
        }
    }

    /**
     * Updates the receivedResolutioLimitedByCpu field.
     *
     * @param {booem} enabled
     * @return {void}
     */
    setReceiveResolutionLimitedByCpu(enabled) {
        if (this._receiveResolutionLimitedByCpu !== enabled) {
            this._receiveResolutionLimitedByCpu = enabled;
            logger.info(`ReceiveVideoController - Setting the receiveResolutionLimitedByCpu flag to ${enabled}`);
        }
    }
}
