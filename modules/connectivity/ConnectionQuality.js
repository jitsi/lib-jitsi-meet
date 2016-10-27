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
         * local stats
         * @type {{}}
         */
        this.localStats = {};

        /**
         * remote stats
         * @type {{}}
         */
        this.remoteStats = {};

        /**
         * Quality percent( 100% - good, 0% - bad.) stored per id.
         * TODO remove, read from the received remote stats
         */
        this.remoteConnectionQuality = {};

        conference.on(ConferenceEvents.CONNECTION_INTERRUPTED,
                      () => { this._updateLocalConnectionQuality(0); });

        conference.on(
            ConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
            (participant, payload) => {
                if (payload.type === STATS_MESSAGE_TYPE) {
                    let remoteVideo = participant.getTracks()
                        .find(tr => tr.isVideoTrack());
                    this.updateRemoteStats(
                        participant.getId(),
                        payload.values,
                        remoteVideo ? remoteVideo.videoType : undefined,
                        remoteVideo ? remoteVideo.isMuted() : undefined);
                }
        });

        conference.on(
            ConferenceEvents.CONNECTION_STATS,
            (stats) => {
                let localVideoTracks = conference.getLocalTracks(MediaType.VIDEO);
                let localVideoTrack
                    = localVideoTracks.length > 0 ? localVideoTracks[0] : null;

                // if we say video muted we will use old method of calculating
                // quality and will not depend on localVideo if it is missing
                this.updateLocalStats(
                    stats,
                    conference.isConnectionInterrupted(),
                    localVideoTrack ? localVideoTrack.videoType : undefined,
                    localVideoTrack ? localVideoTrack.isMuted() : true,
                    localVideoTrack ? localVideoTrack.resolution : null);
        });
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

        let localVideoTracks = this.conference.getLocalTracks(MediaType.VIDEO);
        let localVideoTrack
                    = localVideoTracks.length > 0 ? localVideoTracks[0] : null;
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
    updateLocalStats(data, updateLocalConnectionQuality,
                  videoType, isMuted, resolution) {
            this.localStats = data;
            if(updateLocalConnectionQuality) {
                let val = this._getNewQualityValue(
                    this.localStats,
                    this.localStats.connectionQuality,
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
     * @param id the id associated with the statistics
     * @param data the statistics received
     * @param remoteVideoType the video type of the remote video
     * @param isRemoteVideoMuted whether remote video is muted
     */
    updateRemoteStats(id, data, remoteVideoType, isRemoteVideoMuted) {
            if (!data ||
                !("packetLoss" in data) ||
                !("total" in data.packetLoss)) {
                this.eventEmitter.emit(
                    ConnectionQualityEvents.REMOTE_STATS_UPDATED,
                    id,
                    null,
                    null);
                return;
            }

            let inputResolution = data.resolution;
            // Use only the fields we need
            data = {bitrate: data.bitrate, packetLoss: data.packetLoss};

            this.remoteStats[id] = data;

            let val = this._getNewQualityValue(
                data,
                this.remoteConnectionQuality[id],
                remoteVideoType,
                isRemoteVideoMuted,
                inputResolution);
            if (val !== undefined)
                this.remoteConnectionQuality[id] = val;

            this.eventEmitter.emit(
                ConnectionQualityEvents.REMOTE_STATS_UPDATED,
                id,
                this.remoteConnectionQuality[id],
                this.remoteStats[id]);
    }

    /**
     * Returns the local statistics.
     */
    getStats() {
        return this.localStats;
    }
}
