/* global require */
/* jshint -W101 */

var logger = require("jitsi-meet-logger").getLogger(__filename);
var RTCBrowserType = require("../RTC/RTCBrowserType");
var StatisticsEvents = require("../../service/statistics/Events");

/* Whether we support the browser we are running into for logging statistics */
var browserSupported = RTCBrowserType.isChrome() ||
        RTCBrowserType.isOpera() || RTCBrowserType.isFirefox();

/**
 * The LibJitsiMeet browser-agnostic names of the browser-specific keys reported
 * by RTCPeerConnection#getStats mapped by RTCBrowserType.
 */
var KEYS_BY_BROWSER_TYPE = {};
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_FIREFOX] = {
    "ssrc": "ssrc",
    "packetsReceived": "packetsReceived",
    "packetsLost": "packetsLost",
    "packetsSent": "packetsSent",
    "bytesReceived": "bytesReceived",
    "bytesSent": "bytesSent"
};
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME] = {
    "receiveBandwidth": "googAvailableReceiveBandwidth",
    "sendBandwidth": "googAvailableSendBandwidth",
    "remoteAddress": "googRemoteAddress",
    "transportType": "googTransportType",
    "localAddress": "googLocalAddress",
    "activeConnection": "googActiveConnection",
    "ssrc": "ssrc",
    "packetsReceived": "packetsReceived",
    "packetsSent": "packetsSent",
    "packetsLost": "packetsLost",
    "bytesReceived": "bytesReceived",
    "bytesSent": "bytesSent",
    "googFrameHeightReceived": "googFrameHeightReceived",
    "googFrameWidthReceived": "googFrameWidthReceived",
    "googFrameHeightSent": "googFrameHeightSent",
    "googFrameWidthSent": "googFrameWidthSent",
    "audioInputLevel": "audioInputLevel",
    "audioOutputLevel": "audioOutputLevel"
};
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_OPERA] =
    KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME];
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_IEXPLORER] =
    KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME];
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_SAFARI] =
    KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME];
/**
 * Calculates packet lost percent using the number of lost packets and the
 * number of all packet.
 * @param lostPackets the number of lost packets
 * @param totalPackets the number of all packets.
 * @returns {number} packet loss percent
 */
function calculatePacketLoss(lostPackets, totalPackets) {
    if(!totalPackets || totalPackets <= 0 || !lostPackets || lostPackets <= 0)
        return 0;
    return Math.round((lostPackets/totalPackets)*100);
}

function formatAudioLevel(audioLevel) {
    return Math.min(Math.max(audioLevel, 0), 1);
}

/**
 * Checks whether a certain record should be included in the logged statistics.
 */
function acceptStat(reportId, reportType, statName) {
    if (reportType == "googCandidatePair" && statName == "googChannelId")
        return false;

    if (reportType == "ssrc") {
        if (statName == "googTrackId" ||
            statName == "transportId" ||
            statName == "ssrc")
            return false;
    }

    return true;
}

/**
 * Checks whether a certain record should be included in the logged statistics.
 */
function acceptReport(id, type) {
    if (id.substring(0, 15) == "googCertificate" ||
        id.substring(0, 9) == "googTrack" ||
        id.substring(0, 20) == "googLibjingleSession")
        return false;

    if (type == "googComponent")
        return false;

    return true;
}

/**
 * Peer statistics data holder.
 * @constructor
 */
function PeerStats() {
    this.ssrc2Loss = {};
    this.ssrc2AudioLevel = {};
    this.ssrc2bitrate = {
        download: 0,
        upload: 0
    };
    this.ssrc2resolution = {};
}

/**
 * Sets packets loss rate for given <tt>ssrc</tt> that belong to the peer
 * represented by this instance.
 * @param lossRate new packet loss rate value to be set.
 */
PeerStats.prototype.setSsrcLoss = function (lossRate) {
    this.ssrc2Loss = lossRate || {};
};

/**
 * Sets resolution that belong to the ssrc
 * represented by this instance.
 * @param resolution new resolution value to be set.
 */
PeerStats.prototype.setSsrcResolution = function (resolution) {
    this.ssrc2resolution = resolution || {};
};

/**
 * Sets the bit rate for given <tt>ssrc</tt> that belong to the peer
 * represented by this instance.
 * @param bitrate new bitrate value to be set.
 */
PeerStats.prototype.setSsrcBitrate = function (bitrate) {
    this.ssrc2bitrate.download += bitrate.download;
    this.ssrc2bitrate.upload += bitrate.upload;
};

/**
 * Resets the bit rate for given <tt>ssrc</tt> that belong to the peer
 * represented by this instance.
 */
PeerStats.prototype.resetSsrcBitrate = function () {
    this.ssrc2bitrate.download = 0;
    this.ssrc2bitrate.upload = 0;
};

/**
 * Sets new audio level(input or output) for given <tt>ssrc</tt> that identifies
 * the stream which belongs to the peer represented by this instance.
 * @param audioLevel the new audio level value to be set. Value is truncated to
 *        fit the range from 0 to 1.
 */
PeerStats.prototype.setSsrcAudioLevel = function (audioLevel) {
    // Range limit 0 - 1
    this.ssrc2AudioLevel = formatAudioLevel(audioLevel);
};

function ConferenceStats() {

    /**
     * The bandwidth
     * @type {{}}
     */
    this.bandwidth = {};

    /**
     * The bit rate
     * @type {{}}
     */
    this.bitrate = {};

    /**
     * The packet loss rate
     * @type {{}}
     */
    this.packetLoss = null;

    /**
     * Array with the transport information.
     * @type {Array}
     */
    this.transport = [];
}

/**
 * <tt>StatsCollector</tt> registers for stats updates of given
 * <tt>peerconnection</tt> in given <tt>interval</tt>. On each update particular
 * stats are extracted and put in {@link PeerStats} objects. Once the processing
 * is done <tt>audioLevelsUpdateCallback</tt> is called with <tt>this</tt>
 * instance as an event source.
 *
 * @param peerconnection WebRTC PeerConnection object.
 * @param audioLevelsInterval
 * @param statsInterval stats refresh interval given in ms.
 * @param eventEmitter
 * @param config {object} supports the following properties: disableAudioLevels,
 * disableStats, logStats
 * @constructor
 */
function StatsCollector(
        peerconnection,
        audioLevelsInterval,
        statsInterval,
        eventEmitter,
        config) {
    // StatsCollector depends entirely on the format of the reports returned by
    // RTCPeerConnection#getStats. Given that the value of
    // RTCBrowserType#getBrowserType() is very unlikely to change at runtime, it
    // makes sense to discover whether StatsCollector supports the executing
    // browser as soon as possible. Otherwise, (1) getStatValue would have to
    // needlessly check a "static" condition multiple times very very often and
    // (2) the lack of support for the executing browser would be discovered and
    // reported multiple times very very often too late in the execution in some
    // totally unrelated callback.
    /**
     * The RTCBrowserType supported by this StatsCollector. In other words, the
     * RTCBrowserType of the browser which initialized this StatsCollector
     * instance.
     * @private
     */
    this._browserType = RTCBrowserType.getBrowserType();
    var keys = KEYS_BY_BROWSER_TYPE[this._browserType];
    if (!keys)
        throw "The browser type '" + this._browserType + "' isn't supported!";
    /**
     * The function which is to be used to retrieve the value associated in a
     * report returned by RTCPeerConnection#getStats with a LibJitsiMeet
     * browser-agnostic name/key.
     * @function
     * @private
     */
    this._getStatValue = this._defineGetStatValueMethod(keys);

    this.peerconnection = peerconnection;
    this.baselineAudioLevelsReport = null;
    this.currentAudioLevelsReport = null;
    this.currentStatsReport = null;
    this.baselineStatsReport = null;
    this.audioLevelsIntervalId = null;
    this.eventEmitter = eventEmitter;
    this.config = config || {};
    this.conferenceStats = new ConferenceStats();

    /**
     * Gather PeerConnection stats once every this many milliseconds.
     */
    this.GATHER_INTERVAL = 15000;

    /**
     * Gather stats and store them in this.statsToBeLogged.
     */
    this.gatherStatsIntervalId = null;

    /**
     * Stores the statistics which will be send to the focus to be logged.
     */
    this.statsToBeLogged = {
        timestamps: [],
        stats: {}
    };

    // Updates stats interval
    this.audioLevelsIntervalMilis = audioLevelsInterval;

    this.statsIntervalId = null;
    this.statsIntervalMilis = statsInterval;
    // Map of ssrcs to PeerStats
    this.ssrc2stats = {};
}

module.exports = StatsCollector;

/**
 * Stops stats updates.
 */
StatsCollector.prototype.stop = function () {
    if (this.audioLevelsIntervalId) {
        clearInterval(this.audioLevelsIntervalId);
        this.audioLevelsIntervalId = null;
    }

    if (this.statsIntervalId) {
        clearInterval(this.statsIntervalId);
        this.statsIntervalId = null;
    }

    if (this.gatherStatsIntervalId) {
        clearInterval(this.gatherStatsIntervalId);
        this.gatherStatsIntervalId = null;
    }
};

/**
 * Callback passed to <tt>getStats</tt> method.
 * @param error an error that occurred on <tt>getStats</tt> call.
 */
StatsCollector.prototype.errorCallback = function (error) {
    logger.error("Get stats error", error);
    this.stop();
};

/**
 * Starts stats updates.
 */
StatsCollector.prototype.start = function () {
    var self = this;
    this.audioLevelsIntervalId = setInterval(
        function () {
            // Interval updates
            self.peerconnection.getStats(
                function (report) {
                    var results = null;
                    if (!report || !report.result ||
                        typeof report.result != 'function') {
                        results = report;
                    }
                    else {
                        results = report.result();
                    }
                    //logger.error("Got interval report", results);
                    self.currentAudioLevelsReport = results;
                    self.processAudioLevelReport();
                    self.baselineAudioLevelsReport =
                        self.currentAudioLevelsReport;
                },
                self.errorCallback
            );
        },
        self.audioLevelsIntervalMilis
    );

    if (!this.config.disableStats && browserSupported) {
        this.statsIntervalId = setInterval(
            function () {
                // Interval updates
                self.peerconnection.getStats(
                    function (report) {
                        var results = null;
                        if (!report || !report.result ||
                            typeof report.result != 'function') {
                            //firefox
                            results = report;
                        }
                        else {
                            //chrome
                            results = report.result();
                        }
                        //logger.error("Got interval report", results);
                        self.currentStatsReport = results;
                        try {
                            self.processStatsReport();
                        }
                        catch (e) {
                            logger.error("Unsupported key:" + e, e);
                        }

                        self.baselineStatsReport = self.currentStatsReport;
                    },
                    self.errorCallback
                );
            },
            self.statsIntervalMilis
        );
    }

    if (this.config.logStats
            && browserSupported
            // logging statistics does not support firefox
            && this._browserType !== RTCBrowserType.RTC_BROWSER_FIREFOX) {
        this.gatherStatsIntervalId = setInterval(
            function () {
                self.peerconnection.getStats(
                    function (report) {
                        self.addStatsToBeLogged(report.result());
                    },
                    function () {
                    }
                );
            },
            this.GATHER_INTERVAL
        );
    }
};

/**
 * Converts the stats to the format used for logging, and saves the data in
 * this.statsToBeLogged.
 * @param reports Reports as given by webkitRTCPerConnection.getStats.
 */
StatsCollector.prototype.addStatsToBeLogged = function (reports) {
    var self = this;
    var num_records = this.statsToBeLogged.timestamps.length;
    this.statsToBeLogged.timestamps.push(new Date().getTime());
    reports.forEach(function (report) {
        if (!acceptReport(report.id, report.type))
            return;
        var stat = self.statsToBeLogged.stats[report.id];
        if (!stat) {
            stat = self.statsToBeLogged.stats[report.id] = {};
        }
        stat.type = report.type;
        report.names().forEach(function (name) {
            if (!acceptStat(report.id, report.type, name))
                return;
            var values = stat[name];
            if (!values) {
                values = stat[name] = [];
            }
            while (values.length < num_records) {
                values.push(null);
            }
            values.push(report.stat(name));
        });
    });
};

StatsCollector.prototype.getCollectedStats = function () {
    return this.statsToBeLogged;
};

StatsCollector.prototype.clearCollectedStats = function () {
   // Reset the stats
   this.statsToBeLogged.stats = {};
   this.statsToBeLogged.timestamps = [];
};

/**
 * Defines a function which (1) is to be used as a StatsCollector method and (2)
 * gets the value from a specific report returned by RTCPeerConnection#getStats
 * associated with a LibJitsiMeet browser-agnostic name.
 *
 * @param {Object.<string,string>} keys the map of LibJitsi browser-agnostic
 * names to RTCPeerConnection#getStats browser-specific keys
 */
StatsCollector.prototype._defineGetStatValueMethod = function (keys) {
    // Define the function which converts a LibJitsiMeet browser-asnostic name
    // to a browser-specific key of a report returned by
    // RTCPeerConnection#getStats.
    var keyFromName = function (name) {
        var key = keys[name];
        if (key)
            return key;
        else
            throw "The property '" + name + "' isn't supported!";
    };

    // Define the function which retrieves the value from a specific report
    // returned by RTCPeerConnection#getStats associated with a given
    // browser-specific key.
    var itemStatByKey;
    switch (this._browserType) {
    case RTCBrowserType.RTC_BROWSER_CHROME:
    case RTCBrowserType.RTC_BROWSER_OPERA:
        // TODO What about other types of browser which are based on Chrome such
        // as NW.js? Every time we want to support a new type browser we have to
        // go and add more conditions (here and in multiple other places).
        // Cannot we do a feature detection instead of a browser type check? For
        // example, if item has a stat property of type function, then it's very
        // likely that whoever defined it wanted you to call it in order to
        // retrieve the value associated with a specific key.
        itemStatByKey = function (item, key) { return item.stat(key) };
        break;
    default:
        itemStatByKey = function (item, key) { return item[key] };
    }

    // Compose the 2 functions defined above to get a function which retrieves
    // the value from a specific report returned by RTCPeerConnection#getStats
    // associated with a specific LibJitsiMeet browser-agnostic name.
    return function (item, name) {
        return itemStatByKey(item, keyFromName(name))
    };
};

/**
 * Stats processing logic.
 */
StatsCollector.prototype.processStatsReport = function () {
    if (!this.baselineStatsReport) {
        return;
    }

    var getStatValue = this._getStatValue;

    for (var idx in this.currentStatsReport) {
        var now = this.currentStatsReport[idx];
        try {
            if (getStatValue(now, 'receiveBandwidth') ||
                getStatValue(now, 'sendBandwidth')) {
                this.conferenceStats.bandwidth = {
                    "download": Math.round(
                            (getStatValue(now, 'receiveBandwidth')) / 1000),
                    "upload": Math.round(
                            (getStatValue(now, 'sendBandwidth')) / 1000)
                };
            }
        }
        catch(e){/*not supported*/}

        if(now.type == 'googCandidatePair')
        {
            var ip, type, localIP, active;
            try {
                ip = getStatValue(now, 'remoteAddress');
                type = getStatValue(now, "transportType");
                localIP = getStatValue(now, "localAddress");
                active = getStatValue(now, "activeConnection");
            }
            catch(e){/*not supported*/}
            if(!ip || !type || !localIP || active != "true")
                continue;
            var addressSaved = false;
            for(var i = 0; i < this.conferenceStats.transport.length; i++)
            {
                if(this.conferenceStats.transport[i].ip == ip &&
                    this.conferenceStats.transport[i].type == type &&
                    this.conferenceStats.transport[i].localip == localIP)
                {
                    addressSaved = true;
                }
            }
            if(addressSaved)
                continue;
            this.conferenceStats.transport.push({localip: localIP, ip: ip, type: type});
            continue;
        }

        if(now.type == "candidatepair") {
            if(now.state == "succeeded")
                continue;

            var local = this.currentStatsReport[now.localCandidateId];
            var remote = this.currentStatsReport[now.remoteCandidateId];
            this.conferenceStats.transport.push({
                localip: local.ipAddress + ":" + local.portNumber,
                ip: remote.ipAddress + ":" + remote.portNumber,
                type: local.transport
            });
        }

        if (now.type != 'ssrc' && now.type != "outboundrtp" &&
            now.type != "inboundrtp") {
            continue;
        }

        var before = this.baselineStatsReport[idx];
        if (!before) {
            logger.warn(getStatValue(now, 'ssrc') + ' not enough data');
            continue;
        }

        var ssrc = getStatValue(now, 'ssrc');
        if(!ssrc)
            continue;

        var ssrcStats = this.ssrc2stats[ssrc];
        if (!ssrcStats) {
            ssrcStats = new PeerStats();
            this.ssrc2stats[ssrc] = ssrcStats;
        }


        var isDownloadStream = true;
        var key = 'packetsReceived';
        var packetsNow = getStatValue(now, key);
        if (typeof packetsNow === 'undefined'
            || packetsNow === null || packetsNow === "") {
            isDownloadStream = false;
            key = 'packetsSent';
            packetsNow = getStatValue(now, key);
            if (typeof packetsNow === 'undefined' || packetsNow === null) {
                logger.warn("No packetsReceived nor packetsSent stat found");
                continue;
            }
        }
        if (!packetsNow || packetsNow < 0)
            packetsNow = 0;

        var packetsBefore = getStatValue(before, key);
        if (!packetsBefore || packetsBefore < 0)
            packetsBefore = 0;
        var packetRate = packetsNow - packetsBefore;
        if (!packetRate || packetRate < 0)
            packetRate = 0;
        var currentLoss = getStatValue(now, 'packetsLost');
        if (!currentLoss || currentLoss < 0)
            currentLoss = 0;
        var previousLoss = getStatValue(before, 'packetsLost');
        if (!previousLoss || previousLoss < 0)
            previousLoss = 0;
        var lossRate = currentLoss - previousLoss;
        if (!lossRate || lossRate < 0)
            lossRate = 0;
        var packetsTotal = (packetRate + lossRate);

        ssrcStats.setSsrcLoss({
            packetsTotal: packetsTotal,
            packetsLost: lossRate,
            isDownloadStream: isDownloadStream
        });


        var bytesReceived = 0, bytesSent = 0;
        if(getStatValue(now, "bytesReceived")) {
            bytesReceived = getStatValue(now, "bytesReceived") -
                getStatValue(before, "bytesReceived");
        }

        if (getStatValue(now, "bytesSent")) {
            bytesSent = getStatValue(now, "bytesSent") -
                getStatValue(before, "bytesSent");
        }

        var time = Math.round((now.timestamp - before.timestamp) / 1000);
        if (bytesReceived <= 0 || time <= 0) {
            bytesReceived = 0;
        } else {
            bytesReceived = Math.round(((bytesReceived * 8) / time) / 1000);
        }

        if (bytesSent <= 0 || time <= 0) {
            bytesSent = 0;
        } else {
            bytesSent = Math.round(((bytesSent * 8) / time) / 1000);
        }

        ssrcStats.setSsrcBitrate({
            "download": bytesReceived,
            "upload": bytesSent
        });

        var resolution = {height: null, width: null};
        try {
            if (getStatValue(now, "googFrameHeightReceived") &&
                getStatValue(now, "googFrameWidthReceived")) {
                resolution.height =
                    getStatValue(now, "googFrameHeightReceived");
                resolution.width = getStatValue(now, "googFrameWidthReceived");
            }
            else if (getStatValue(now, "googFrameHeightSent") &&
                getStatValue(now, "googFrameWidthSent")) {
                resolution.height = getStatValue(now, "googFrameHeightSent");
                resolution.width = getStatValue(now, "googFrameWidthSent");
            }
        }
        catch(e){/*not supported*/}

        if (resolution.height && resolution.width) {
            ssrcStats.setSsrcResolution(resolution);
        } else {
            ssrcStats.setSsrcResolution(null);
        }
    }

    // process stats
    var totalPackets = {
        download: 0,
        upload: 0
    };
    var lostPackets = {
        download: 0,
        upload: 0
    };
    var bitrateDownload = 0;
    var bitrateUpload = 0;
    var resolutions = {};
    Object.keys(this.ssrc2stats).forEach(
        function (ssrc) {
            var ssrcStats = this.ssrc2stats[ssrc];

            // process package loss stats
            var ssrc2Loss = ssrcStats.ssrc2Loss;
            var type = ssrc2Loss.isDownloadStream ? "download" : "upload";
            totalPackets[type] += ssrc2Loss.packetsTotal;
            lostPackets[type] += ssrc2Loss.packetsLost;

            // process bitrate stats
            var ssrc2bitrate = ssrcStats.ssrc2bitrate;
            bitrateDownload += ssrc2bitrate.download;
            bitrateUpload += ssrc2bitrate.upload;

            ssrcStats.resetSsrcBitrate();

            // collect resolutions
            resolutions[ssrc] = ssrcStats.ssrc2resolution;
        },
        this
    );

    this.conferenceStats.bitrate
      = {"upload": bitrateUpload, "download": bitrateDownload};

    this.conferenceStats.packetLoss = {
        total:
            calculatePacketLoss(lostPackets.download + lostPackets.upload,
                    totalPackets.download + totalPackets.upload),
        download:
            calculatePacketLoss(lostPackets.download, totalPackets.download),
        upload:
            calculatePacketLoss(lostPackets.upload, totalPackets.upload)
    };
    this.eventEmitter.emit(StatisticsEvents.CONNECTION_STATS, {
            "bitrate": this.conferenceStats.bitrate,
            "packetLoss": this.conferenceStats.packetLoss,
            "bandwidth": this.conferenceStats.bandwidth,
            "resolution": resolutions,
            "transport": this.conferenceStats.transport
        });
    this.conferenceStats.transport = [];
};

/**
 * Stats processing logic.
 */
StatsCollector.prototype.processAudioLevelReport = function () {
    if (!this.baselineAudioLevelsReport) {
        return;
    }

    var getStatValue = this._getStatValue;

    for (var idx in this.currentAudioLevelsReport) {
        var now = this.currentAudioLevelsReport[idx];

        //if we don't have "packetsReceived" this is local stream
        if (now.type != 'ssrc' || !getStatValue(now, 'packetsReceived')) {
            continue;
        }

        var before = this.baselineAudioLevelsReport[idx];
        if (!before) {
            logger.warn(getStatValue(now, 'ssrc') + ' not enough data');
            continue;
        }

        var ssrc = getStatValue(now, 'ssrc');
        if (!ssrc) {
            if ((Date.now() - now.timestamp) < 3000)
                logger.warn("No ssrc: ");
            continue;
        }

        var ssrcStats = this.ssrc2stats[ssrc];
        if (!ssrcStats) {
            ssrcStats = new PeerStats();
            this.ssrc2stats[ssrc] = ssrcStats;
        }

        // Audio level
        var audioLevel = null;

        try {
            audioLevel = getStatValue(now, 'audioInputLevel');
            if (!audioLevel)
                audioLevel = getStatValue(now, 'audioOutputLevel');
        }
        catch(e) {/*not supported*/
            logger.warn("Audio Levels are not available in the statistics.");
            clearInterval(this.audioLevelsIntervalId);
            return;
        }

        if (audioLevel) {
            // TODO: can't find specs about what this value really is,
            // but it seems to vary between 0 and around 32k.
            audioLevel = audioLevel / 32767;
            ssrcStats.setSsrcAudioLevel(audioLevel);
            this.eventEmitter.emit(
                StatisticsEvents.AUDIO_LEVEL, ssrc, audioLevel);
        }
    }
};
