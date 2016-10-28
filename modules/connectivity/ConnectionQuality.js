import * as ConnectionQualityEvents
    from "../../service/connectivity/ConnectionQualityEvents";
import * as ConferenceEvents from "../../JitsiConferenceEvents";
import {getLogger} from "jitsi-meet-logger";

var GlobalOnErrorHandler = require("../util/GlobalOnErrorHandler");
var MediaType = require('../../service/RTC/MediaType');

const logger = getLogger(__filename);

/**
 * The value to use for the "type" field for messages sent by ConnectionQuality
 * over the data channel.
 */
const STATS_MESSAGE_TYPE = "stats";

// webrtc table describing simulcast resolutions and used bandwidth
// https://chromium.googlesource.com/external/webrtc/+/master/webrtc/media/engine/simulcast.cc#42
const _bandwidthMap = [
    { width: 1920, height: 1080, layers:3, max: 5000, min: 800 },
    { width: 1280, height: 720,  layers:3, max: 2500, min: 600 },
    { width: 960,  height: 540,  layers:3, max: 900,  min: 450 },
    { width: 640,  height: 360,  layers:2, max: 700,  min: 150 },
    { width: 480,  height: 270,  layers:2, max: 450,  min: 150 },
    { width: 320,  height: 180,  layers:1, max: 200,  min: 30 }
];

/**
 * Calculates the quality percent based on passed new and old value.
 * @param newVal the new value
 * @param oldVal the old value
 */
function calculateQuality(newVal, oldVal) {
    return (newVal <= oldVal) ? newVal : (9*oldVal + newVal) / 10;
}

/**
 * Calculates the quality percentage based on the input resolution height and
 * the upload reported by the client. The value is based on the interval from
 * _bandwidthMap.
 * @param inputHeight the resolution used to open the camera.
 * @param upload the upload rate reported by client.
 * @returns {int} the percent of upload based on _bandwidthMap and maximum value
 * of 100, as values of the map are approximate and clients can stream above
 * those values. Returns undefined if no result is found.
 */
function calculateQualityUsingUpload(inputHeight, upload) {
    // found resolution from _bandwidthMap which height is equal or less than
    // the inputHeight
    let foundResolution = _bandwidthMap.find((r) => (r.height <= inputHeight));

    if (!foundResolution)
        return undefined;

    if (upload <= foundResolution.min)
        return 0;

    return Math.min(
        ((upload - foundResolution.min)*100)
            / (foundResolution.max - foundResolution.min),
        100);
}

export default class ConnectionQuality {
    constructor(conference, eventEmitter, options) {
        this.eventEmitter = eventEmitter;

        /**
         * The owning JitsiConference.
         */
        this.conference = conference;

        this.disableQualityBasedOnBandwidth =
            options.forceQualityBasedOnBandwidth
                    ? false : !!options.disableSimulcast;
        /**
         * Holds statistics about the local connection quality.
         */
        this.localStats = {connectionQuality: 100};

        /**
         * Maps a participant ID to an object holding connection quality
         * statistics received from this participant.
         */
        this.remoteStats = {};

        conference.on(ConferenceEvents.CONNECTION_INTERRUPTED,
                      () => { this._updateLocalConnectionQuality(0); });

        conference.on(
            ConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
            (participant, payload) => {
                if (payload.type === STATS_MESSAGE_TYPE) {
                    this._updateRemoteStats(
                        participant.getId(), payload.values);
                }
        });

        conference.on(
            ConferenceEvents.CONNECTION_STATS,
            this._updateLocalStats.bind(this));
    }

    /**
     * Returns the new quality value based on the input parameters.
     * Used to calculate remote and local values.
     * @param data the data
     * @param lastQualityValue the last value we calculated
     * @param videoType need to check whether we are screen sharing
     * @param isMuted is video muted
     * @param resolution the input resolution used by the camera
     * @returns {*} the newly calculated value or undefined if no result
     * @private
     */
    _getNewQualityValue(
        data, lastQualityValue, videoType, isMuted, resolution) {
        if (this.disableQualityBasedOnBandwidth
            || isMuted
            || videoType === 'desktop'
            || !resolution) {
            return calculateQuality(
                100 - data.packetLoss.total,
                lastQualityValue || 100);
        } else {
            return calculateQualityUsingUpload(
                resolution,
                data.bitrate.upload);
        }
    }

    /**
     * Updates only the localConnectionQuality value
     * @param values {int} the new value. should be from 0 - 100.
     */
    _updateLocalConnectionQuality(value) {
        this.localStats.connectionQuality = value;
        this.eventEmitter.emit(
            ConnectionQualityEvents.LOCAL_STATS_UPDATED,
            this.localStats);
        this._broadcastLocalStats();
    }

    /**
     * Broadcasts the local statistics to all other participants in the
     * conference.
     */
    _broadcastLocalStats() {
        // Send only the data that remote participants care about.
        let data = {
            bitrate: this.localStats.bitrate,
            packetLoss: this.localStats.packetLoss,
            connectionQuality: this.localStats.connectionQuality
        };

        let localVideoTrack
            = this.conference.getLocalTracks(MediaType.VIDEO)
                .find(track => track.isVideoTrack());
        if (localVideoTrack && localVideoTrack.resolution) {
            data.resolution = localVideoTrack.resolution;
        }

        try {
            this.conference.broadcastEndpointMessage({
                type: STATS_MESSAGE_TYPE,
                values: data });
        } catch (e) {
            let errorMsg = "Failed to broadcast local stats";
            logger.error(errorMsg, e);
            GlobalOnErrorHandler.callErrorHandler(
                new Error(errorMsg + ": " + e));
        }
    }

    /**
     * Updates the local statistics
     * @param data new statistics
     * @param updateLocalConnectionQuality {boolean} weather to recalculate
     * localConnectionQuality or not.
     * @param videoType the local video type
     * @param isMuted current state of local video, whether it is muted
     * @param resolution the current resolution used by local video
     */
    _updateLocalStats(data) {

        let updateLocalConnectionQuality
            = !this.conference.isConnectionInterrupted();
        let localVideoTrack =
                this.conference.getLocalTracks(MediaType.VIDEO)
                    .find(track => track.isVideoTrack());
        let videoType = localVideoTrack ? localVideoTrack.videoType : undefined;
        let isMuted = localVideoTrack ? localVideoTrack.isMuted() : true;
        let resolution = localVideoTrack ? localVideoTrack.resolution : null;
        let prevConnectionQuality = this.localStats.connectionQuality || 0;

        this.localStats = data;
        if(updateLocalConnectionQuality) {
            let val = this._getNewQualityValue(
                this.localStats,
                prevConnectionQuality,
                videoType,
                isMuted,
                resolution);
            if (val !== undefined) {
                this.localStats.connectionQuality = val;
            }
        }
        this.eventEmitter.emit(
            ConnectionQualityEvents.LOCAL_STATS_UPDATED,
            this.localStats);
        this._broadcastLocalStats();
    }

    /**
     * Updates remote statistics
     * @param id the id of the remote participant
     * @param data the statistics received
     * @param isRemoteVideoMuted whether remote video is muted
     */
    _updateRemoteStats(id, data) {
            // Use only the fields we need
            this.remoteStats[id] = {
                bitrate: data.bitrate,
                packetLoss: data.packetLoss,
                connectionQuality: data.connectionQuality
            };

            this.eventEmitter.emit(
                ConnectionQualityEvents.REMOTE_STATS_UPDATED,
                id,
                this.remoteStats[id]);
    }

    /**
     * Returns the local statistics.
     */
    getStats() {
        return this.localStats;
    }
}
