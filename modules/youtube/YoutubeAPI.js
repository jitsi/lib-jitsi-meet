/* global $, Promise */

var logger = require("jitsi-meet-logger").getLogger(__filename);

/**
 * Initializes new YouTubeAPI for given Google access token.
 * @param googleAccessToken the access token string, described in step 2 of
 * https://developers.google.com/identity/protocols/OAuth2
 * @constructor
 */
function YouTubeAPI(googleAccessToken) {
    this.googleAccessToken = googleAccessToken;
}

/**
 * Error handler function used to process 'error' callback of jQuery ajax method
 * @param consoleErrMsg {string} that will be logger on error level, when ajax
 * request fails
 * @param reject Promise reject function reference which will be called with
 * text error description
 * @param jqXHR 1st argument of jQuery ajax 'error' callback
 * @param textStatus 2nd argument of jQuery ajax 'error' callback
 * @param errorThrown 3rd argument of jQuery ajax 'error' callback
 */
function errorHandler(consoleErrMsg, reject, jqXHR, textStatus, errorThrown) {
    logger.error(consoleErrMsg, jqXHR, textStatus, errorThrown);
    var errorMsg;
    // 'error.message' JSON included in response from Google server is a human
    // readable error description
    if (jqXHR.responseJSON && jqXHR.responseJSON.error &&
        jqXHR.responseJSON.error.message) {
        errorMsg = jqXHR.responseJSON.error.message;
    } else {
        errorMsg = textStatus;
    }
    reject(errorMsg);
}

/**
 * @typedef LiveBroadcast the YouTube live broadcast which can stand for
 * an event or ad-hoc live streaming session
 * @property {string} id the broadcast/event identifier
 * @property {string} title the title of the broadcast/event
 * @property {string} boundStreamId
 */
/**
 * Obtains the list of Youtube live broadcasts. Only broadcasts which are in
 * 'ready', 'live' or 'testing' state and which have the live stream already
 * bound will be included in the result set.
 * @returns {Promise<LiveBroadcast>} on success the promise will be resolved
 * with an array of {@link LiveBroadcast}. On error the promise will be rejected
 * with human readable error description(string) returned by the YouTube API.
 */
YouTubeAPI.prototype.getLiveBroadcasts = function() {
    var self = this;
    return new Promise(function (resolve, reject) {
        $.ajax({
            url: "https://www.googleapis.com/youtube/v3/liveBroadcasts" +
            "?part=" +
            encodeURIComponent("id,snippet,contentDetails,status") +
            "&fields=" + encodeURIComponent("items(" +
                "contentDetails/boundStreamId,id,snippet/title," +
                "status/lifeCycleStatus)," +
                "nextPageToken,pageInfo,prevPageToken") +
            "&broadcastType=all&mine=true" +
            "&maxResults=15" +
            "&access_token=" + encodeURIComponent(self.googleAccessToken),
            method: 'GET',
            async: true,
            success: function (data, textStatus, jqXHR) {
                var broadcasts = [];
                data.items.forEach(function (item) {
                    var title = item.snippet.title;
                    if (!item.contentDetails ||
                        !item.contentDetails.boundStreamId) {
                        logger.warn("No live stream bound to " + item.id);
                        return;
                    }
                    var boundStreamId = item.contentDetails.boundStreamId;
                    var status = item.status.lifeCycleStatus;
                    if (status === "ready" ||
                        status === "live"  || status === "testing") {
                        broadcasts.push({
                            id: item.id,
                            title: title,
                            boundStreamId: boundStreamId
                        });
                    } else {
                        logger.warn(
                            "Skipping not ready event: ", status, item);
                    }
                });
                resolve(broadcasts);
            },
            error: errorHandler.bind(this, "Get live broadcasts error:", reject)
        });
    });
};

/**
 * @typedef LiveStream the YouTube live stream
 * @property {string} title the title of YouTube live stream
 * @property {string} streamNameKey the YouTube stream name/key
 * @property {string} bcastTitle the title of bound {@link LiveBroadcast}
 * @property {string} bcastId the id of bound {@link LiveBroadcast}
 */
/**
 * Obtains the list of streamable YouTube live streams.
 * @returns {Promise} on success resolved with an array of {@link LiveStream},
 * on error rejected with a human readable error message returned by
 * the YouTube API.
 */
YouTubeAPI.prototype.getLiveStreams = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
        self.getLiveBroadcasts().then(function (liveBroadcasts) {
            if (liveBroadcasts.length === 0) {
                resolve([]);
                return;
            }
            var bcastMap = {};
            var ids = "";
            liveBroadcasts.forEach(function (broadcast) {
                ids += broadcast.boundStreamId + ",";
                bcastMap[broadcast.boundStreamId] = broadcast;
            });
            $.ajax({
                url: "https://www.googleapis.com/youtube/v3/liveStreams" +
                "?part=" + encodeURIComponent("id,snippet,cdn,status") +
                "&fields=" + encodeURIComponent("items(cdn(" +
                    "ingestionInfo/streamName,ingestionType)," +
                    "id,snippet/title,status/streamStatus),pageInfo") +
                "&maxResults=15" +
                "&id=" + encodeURIComponent(ids) +
                "&access_token=" + encodeURIComponent(self.googleAccessToken),
                method: 'GET',
                async: true,
                success: function (data, textStatus, jqXHR) {
                    var streamsInfo = [];
                    data.items.forEach(function (item) {
                        var ingestionType = item.cdn.ingestionType;
                        if (ingestionType !== "rtmp") {
                            logger.warn("Skipped not 'rtmp' stream", item);
                            return;
                        }
                        var status = item.status.streamStatus;
                        if (status !== "ready" &&
                            status !== "inactive" && status !== "active") {
                            logger.warn("Skipping stream not in usable state",
                                item, status);
                            return;
                        }
                        var bcast = bcastMap[item.id];
                        if (!bcast) {
                            logger.warn(
                                "No broadcast for stream: " + item.id, item);
                            return;
                        }
                        var stream = {
                            bcastTitle: bcast.title,
                            bcastId: bcast.id,
                            title: item.snippet.title,
                            streamNameKey: item.cdn.ingestionInfo.streamName
                        };
                        streamsInfo.push(stream);
                    });
                    resolve(streamsInfo);
                },
                error: errorHandler.bind(
                        this, "Get live streams error:", reject)
            });
        }).catch(function (error) {
            reject(error);
        });
    });
};

module.exports = YouTubeAPI;