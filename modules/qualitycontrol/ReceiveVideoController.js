import { getLogger } from 'jitsi-meet-logger';
import isEqual from 'lodash.isequal';

import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

const logger = getLogger(__filename);
const MAX_HEIGHT_ONSTAGE = 2160;
const MAX_HEIGHT_THUMBNAIL = 180;
const LASTN_UNLIMITED = -1;

/**
 * This class translates the legacy signaling format between the client and the bridge (that affects bandwidth
 * allocation) to the new format described here https://github.com/jitsi/jitsi-videobridge/blob/master/doc/allocation.md
 */
export class ReceiverVideoConstraints {
    /**
     * Creates a new instance.
     */
    constructor() {
        // Default constraints used for endpoints that are not explicitly included in constraints.
        // These constraints are used for endpoints that are thumbnails in the stage view.
        this._defaultConstraints = { 'maxHeight': MAX_HEIGHT_THUMBNAIL };

        // The number of videos requested from the bridge.
        this._lastN = LASTN_UNLIMITED;

        // The number representing the maximum video height the local client should receive from the bridge.
        this._maxFrameHeight = MAX_HEIGHT_ONSTAGE;

        // The endpoint IDs of the participants that are currently selected.
        this._selectedEndpoints = [];

        this._receiverVideoConstraints = {
            constraints: {},
            defaultConstraints: this.defaultConstraints,
            lastN: this._lastN,
            onStageEndpoints: [],
            selectedEndpoints: this._selectedEndpoints
        };
    }

    /**
     * Returns the receiver video constraints that need to be sent on the bridge channel.
     */
    get constraints() {
        this._receiverVideoConstraints.lastN = this._lastN;

        if (!this._selectedEndpoints.length) {
            return this._receiverVideoConstraints;
        }

        // The client is assumed to be in TileView if it has selected more than one endpoint, otherwise it is
        // assumed to be in StageView.
        this._receiverVideoConstraints.constraints = {};
        if (this._selectedEndpoints.length > 1) {
            /**
             * Tile view.
             * Only the default constraints are specified here along with lastN (if it is set).
             * {
             *  'colibriClass': 'ReceiverVideoConstraints',
             *  'defaultConstraints': { 'maxHeight': 360 }
             * }
             */
            this._receiverVideoConstraints.defaultConstraints = { 'maxHeight': this._maxFrameHeight };
            this._receiverVideoConstraints.onStageEndpoints = [];
            this._receiverVideoConstraints.selectedEndpoints = [];
        } else {
            /**
             * Stage view.
             * The participant on stage is specified in onStageEndpoints and a higher maxHeight is specified
             * for that endpoint while a default maxHeight of 180 is applied to all the other endpoints.
             * {
             *  'colibriClass': 'ReceiverVideoConstraints',
             *  'onStageEndpoints': ['A'],
             *  'defaultConstraints': { 'maxHeight':  180 },
             *  'constraints': {
             *      'A': { 'maxHeight': 720 }
             *   }
             * }
             */
            this._receiverVideoConstraints.constraints[this._selectedEndpoints[0]] = {
                'maxHeight': this._maxFrameHeight
            };
            this._receiverVideoConstraints.defaultConstraints = this._defaultConstraints;
            this._receiverVideoConstraints.onStageEndpoints = this._selectedEndpoints;
            this._receiverVideoConstraints.selectedEndpoints = [];
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

    /**
     * Updates the list of selected endpoints.
     *
     * @param {Array<string>} ids
     * @returns {void}
     */
    updateSelectedEndpoints(ids) {
        logger.debug(`Updating selected endpoints: ${JSON.stringify(ids)}`);
        this._selectedEndpoints = ids;
    }
}

/**
 * This class manages the receive video contraints for a given {@link JitsiConference}. These constraints are
 * determined by the application based on how the remote video streams need to be displayed. This class is responsible
 * for communicating these constraints to the bridge over the bridge channel.
 */
export class ReceiveVideoController {
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

        // Enable new receiver constraints by default unless it is explicitly disabled through config.js.
        const useNewReceiverConstraints = conference.options?.config?.useNewBandwidthAllocationStrategy ?? true;

        // Translate the legacy bridge channel signaling format to the new format.
        this._receiverVideoConstraints = useNewReceiverConstraints ? new ReceiverVideoConstraints() : undefined;

        // The number of videos requested from the bridge, -1 represents unlimited or all available videos.
        this._lastN = LASTN_UNLIMITED;

        // The number representing the maximum video height the local client should receive from the bridge.
        this._maxFrameHeight = MAX_HEIGHT_ONSTAGE;

        // The endpoint IDs of the participants that are currently selected.
        this._selectedEndpoints = [];

        this._conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            session => this._onMediaSessionStarted(session));
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
        if (mediaSession.isP2P || !this._receiverVideoConstraints) {
            mediaSession.setReceiverVideoConstraint(this._maxFrameHeight);
        } else {
            this._receiverVideoConstraints.updateReceiveResolution(this._maxFrameHeight);
            this._rtc.setNewReceiverVideoConstraints(this._receiverVideoConstraints.constraints);
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
     * Elects the participants with the given ids to be the selected participants in order to always receive video
     * for this participant (even when last n is enabled).
     *
     * @param {Array<string>} ids - The user ids.
     * @returns {void}
     */
    selectEndpoints(ids) {
        this._selectedEndpoints = ids;

        if (this._receiverVideoConstraints) {
            // Filter out the local endpointId from the list of selected endpoints.
            const remoteEndpointIds = ids.filter(id => id !== this._conference.myUserId());
            const oldConstraints = JSON.parse(JSON.stringify(this._receiverVideoConstraints.constraints));

            remoteEndpointIds.length && this._receiverVideoConstraints.updateSelectedEndpoints(remoteEndpointIds);
            const newConstraints = this._receiverVideoConstraints.constraints;

            // Send bridge message only when the constraints change.
            if (!isEqual(newConstraints, oldConstraints)) {
                this._rtc.setNewReceiverVideoConstraints(newConstraints);
            }

            return;
        }
        this._rtc.selectEndpoints(ids);
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

            if (this._receiverVideoConstraints) {
                const lastNUpdated = this._receiverVideoConstraints.updateLastN(value);

                // Send out the message on the bridge channel if lastN was updated.
                lastNUpdated && this._rtc.setNewReceiverVideoConstraints(this._receiverVideoConstraints.constraints);

                return;
            }
            this._rtc.setLastN(value);
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

        for (const session of this._conference._getMediaSessions()) {
            if (session.isP2P || !this._receiverVideoConstraints) {
                maxFrameHeight && session.setReceiverVideoConstraint(maxFrameHeight);
            } else {
                const resolutionUpdated = this._receiverVideoConstraints.updateReceiveResolution(maxFrameHeight);

                resolutionUpdated
                    && this._rtc.setNewReceiverVideoConstraints(this._receiverVideoConstraints.constraints);
            }
        }
    }

    /**
     * Sets the receiver constraints for the conference.
     *
     * @param {Object} constraints The video constraints.
     */
    setReceiverConstraints(constraints) {
        if (!this._receiverVideoConstraints) {
            this._receiverVideoConstraints = new ReceiverVideoConstraints();
        }

        const constraintsChanged = this._receiverVideoConstraints.updateReceiverVideoConstraints(constraints);

        if (constraintsChanged) {
            this._lastN = constraints.lastN ?? this._lastN;
            this._selectedEndpoints = constraints.selectedEndpoints ?? this._selectedEndpoints;
            this._rtc.setNewReceiverVideoConstraints(constraints);
        }
    }
}
