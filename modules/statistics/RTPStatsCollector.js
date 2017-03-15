/* global require */

const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');
const logger = require('jitsi-meet-logger').getLogger(__filename);
const RTCBrowserType = require('../RTC/RTCBrowserType');

import * as StatisticsEvents from '../../service/statistics/Events';

/* Whether we support the browser we are running into for logging statistics */
const browserSupported = RTCBrowserType.isChrome()
        || RTCBrowserType.isOpera() || RTCBrowserType.isFirefox()
        || RTCBrowserType.isNWJS() || RTCBrowserType.isElectron();

/**
 * The LibJitsiMeet browser-agnostic names of the browser-specific keys reported
 * by RTCPeerConnection#getStats mapped by RTCBrowserType.
 */
const KEYS_BY_BROWSER_TYPE = {};

KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_FIREFOX] = {
    'ssrc': 'ssrc',
    'packetsReceived': 'packetsReceived',
    'packetsLost': 'packetsLost',
    'packetsSent': 'packetsSent',
    'bytesReceived': 'bytesReceived',
    'bytesSent': 'bytesSent',
    'framerateMean': 'framerateMean'
};
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME] = {
    'receiveBandwidth': 'googAvailableReceiveBandwidth',
    'sendBandwidth': 'googAvailableSendBandwidth',
    'remoteAddress': 'googRemoteAddress',
    'transportType': 'googTransportType',
    'localAddress': 'googLocalAddress',
    'activeConnection': 'googActiveConnection',
    'ssrc': 'ssrc',
    'packetsReceived': 'packetsReceived',
    'packetsSent': 'packetsSent',
    'packetsLost': 'packetsLost',
    'bytesReceived': 'bytesReceived',
    'bytesSent': 'bytesSent',
    'googFrameHeightReceived': 'googFrameHeightReceived',
    'googFrameWidthReceived': 'googFrameWidthReceived',
    'googFrameHeightSent': 'googFrameHeightSent',
    'googFrameWidthSent': 'googFrameWidthSent',
    'googFrameRateReceived': 'googFrameRateReceived',
    'googFrameRateSent': 'googFrameRateSent',
    'audioInputLevel': 'audioInputLevel',
    'audioOutputLevel': 'audioOutputLevel'
};
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_OPERA]
    = KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME];
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_NWJS]
    = KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME];
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_ELECTRON]
    = KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME];
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_IEXPLORER]
    = KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME];
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_SAFARI]
    = KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME];
KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_REACT_NATIVE]
    = KEYS_BY_BROWSER_TYPE[RTCBrowserType.RTC_BROWSER_CHROME];

/**
 * Calculates packet lost percent using the number of lost packets and the
 * number of all packet.
 * @param lostPackets the number of lost packets
 * @param totalPackets the number of all packets.
 * @returns {number} packet loss percent
 */
function calculatePacketLoss(lostPackets, totalPackets) {
    if (!totalPackets || totalPackets <= 0
            || !lostPackets || lostPackets <= 0) {
        return 0;
    }

    return Math.round((lostPackets / totalPackets) * 100);
}

/**
 * Holds "statistics" for a single SSRC.
 * @constructor
 */
function SsrcStats() {
    this.loss = {};
    this.bitrate = {
        download: 0,
        upload: 0
    };
    this.resolution = {};
    this.framerate = 0;
}

/**
 * Sets the "loss" object.
 * @param loss the value to set.
 */
SsrcStats.prototype.setLoss = function(loss) {
    this.loss = loss || {};
};

/**
 * Sets resolution that belong to the ssrc represented by this instance.
 * @param resolution new resolution value to be set.
 */
SsrcStats.prototype.setResolution = function(resolution) {
    this.resolution = resolution || {};
};

/**
 * Adds the "download" and "upload" fields from the "bitrate" parameter to
 * the respective fields of the "bitrate" field of this object.
 * @param bitrate an object holding the values to add.
 */
SsrcStats.prototype.addBitrate = function(bitrate) {
    this.bitrate.download += bitrate.download;
    this.bitrate.upload += bitrate.upload;
};

/**
 * Resets the bit rate for given <tt>ssrc</tt> that belong to the peer
 * represented by this instance.
 */
SsrcStats.prototype.resetBitrate = function() {
    this.bitrate.download = 0;
    this.bitrate.upload = 0;
};

/**
 * Sets the "framerate".
 * @param framerate the value to set.
 */
SsrcStats.prototype.setFramerate = function(framerate) {
    this.framerate = framerate || 0;
};

/**
 *
 */
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

/* eslint-disable max-params */

/**
 * <tt>StatsCollector</tt> registers for stats updates of given
 * <tt>peerconnection</tt> in given <tt>interval</tt>. On each update particular
 * stats are extracted and put in {@link SsrcStats} objects. Once the processing
 * is done <tt>audioLevelsUpdateCallback</tt> is called with <tt>this</tt>
 * instance as an event source.
 *
 * @param peerconnection WebRTC PeerConnection object.
 * @param audioLevelsInterval
 * @param statsInterval stats refresh interval given in ms.
 * @param eventEmitter
 * @constructor
 */
function StatsCollector(
        peerconnection,
        audioLevelsInterval,
        statsInterval,
        eventEmitter) {
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
    const keys = KEYS_BY_BROWSER_TYPE[this._browserType];

    if (!keys) {
        // eslint-disable-next-line no-throw-literal
        throw `The browser type '${this._browserType}' isn't supported!`;
    }

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
    this.previousStatsReport = null;
    this.audioLevelsIntervalId = null;
    this.eventEmitter = eventEmitter;
    this.conferenceStats = new ConferenceStats();

    // Updates stats interval
    this.audioLevelsIntervalMilis = audioLevelsInterval;

    this.statsIntervalId = null;
    this.statsIntervalMilis = statsInterval;

    // Map of ssrcs to SsrcStats
    this.ssrc2stats = {};
}

/* eslint-enable max-params */

module.exports = StatsCollector;

/**
 * Stops stats updates.
 */
StatsCollector.prototype.stop = function() {
    if (this.audioLevelsIntervalId) {
        clearInterval(this.audioLevelsIntervalId);
        this.audioLevelsIntervalId = null;
    }

    if (this.statsIntervalId) {
        clearInterval(this.statsIntervalId);
        this.statsIntervalId = null;
    }
};

/**
 * Callback passed to <tt>getStats</tt> method.
 * @param error an error that occurred on <tt>getStats</tt> call.
 */
StatsCollector.prototype.errorCallback = function(error) {
    GlobalOnErrorHandler.callErrorHandler(error);
    logger.error('Get stats error', error);
    this.stop();
};

/**
 * Starts stats updates.
 */
StatsCollector.prototype.start = function(startAudioLevelStats) {
    const self = this;

    if (startAudioLevelStats) {
        this.audioLevelsIntervalId = setInterval(
            () => {
                // Interval updates
                self.peerconnection.getStats(
                    report => {
                        let results = null;

                        if (!report || !report.result
                            || typeof report.result !== 'function') {
                            results = report;
                        } else {
                            results = report.result();
                        }
                        self.currentAudioLevelsReport = results;
                        self.processAudioLevelReport();
                        self.baselineAudioLevelsReport
                            = self.currentAudioLevelsReport;
                    },
                    self.errorCallback
                );
            },
            self.audioLevelsIntervalMilis
        );
    }

    if (browserSupported) {
        this.statsIntervalId = setInterval(
            () => {
                // Interval updates
                self.peerconnection.getStats(
                    report => {
                        let results = null;

                        if (!report || !report.result
                            || typeof report.result !== 'function') {
                            // firefox
                            results = report;
                        } else {
                            // chrome
                            results = report.result();
                        }
                        self.currentStatsReport = results;
                        try {
                            self.processStatsReport();
                        } catch (e) {
                            GlobalOnErrorHandler.callErrorHandler(e);
                            logger.error(`Unsupported key:${e}`, e);
                        }

                        self.previousStatsReport = self.currentStatsReport;
                    },
                    self.errorCallback
                );
            },
            self.statsIntervalMilis
        );
    }
};

/**
 * Defines a function which (1) is to be used as a StatsCollector method and (2)
 * gets the value from a specific report returned by RTCPeerConnection#getStats
 * associated with a LibJitsiMeet browser-agnostic name.
 *
 * @param {Object.<string,string>} keys the map of LibJitsi browser-agnostic
 * names to RTCPeerConnection#getStats browser-specific keys
 */
StatsCollector.prototype._defineGetStatValueMethod = function(keys) {
    // Define the function which converts a LibJitsiMeet browser-asnostic name
    // to a browser-specific key of a report returned by
    // RTCPeerConnection#getStats.
    const keyFromName = function(name) {
        const key = keys[name];

        if (key) {
            return key;
        }

        // eslint-disable-next-line no-throw-literal
        throw `The property '${name}' isn't supported!`;
    };

    // Define the function which retrieves the value from a specific report
    // returned by RTCPeerConnection#getStats associated with a given
    // browser-specific key.
    let itemStatByKey;

    switch (this._browserType) {
    case RTCBrowserType.RTC_BROWSER_CHROME:
    case RTCBrowserType.RTC_BROWSER_OPERA:
    case RTCBrowserType.RTC_BROWSER_NWJS:
    case RTCBrowserType.RTC_BROWSER_ELECTRON:
        // TODO What about other types of browser which are based on Chrome such
        // as NW.js? Every time we want to support a new type browser we have to
        // go and add more conditions (here and in multiple other places).
        // Cannot we do a feature detection instead of a browser type check? For
        // example, if item has a stat property of type function, then it's very
        // likely that whoever defined it wanted you to call it in order to
        // retrieve the value associated with a specific key.
        itemStatByKey = (item, key) => item.stat(key);
        break;
    case RTCBrowserType.RTC_BROWSER_REACT_NATIVE:
        // The implementation provided by react-native-webrtc follows the
        // Objective-C WebRTC API: RTCStatsReport has a values property of type
        // Array in which each element is a key-value pair.
        itemStatByKey = function(item, key) {
            let value;

            item.values.some(pair => {
                if (pair.hasOwnProperty(key)) {
                    value = pair[key];

                    return true;
                }

                return false;

            });

            return value;
        };
        break;
    default:
        itemStatByKey = (item, key) => item[key];
    }

    // Compose the 2 functions defined above to get a function which retrieves
    // the value from a specific report returned by RTCPeerConnection#getStats
    // associated with a specific LibJitsiMeet browser-agnostic name.
    return function(item, name) {
        return itemStatByKey(item, keyFromName(name));
    };
};

/* eslint-disable no-continue */

/**
 * Stats processing logic.
 */
StatsCollector.prototype.processStatsReport = function() {
    if (!this.previousStatsReport) {
        return;
    }

    const getStatValue = this._getStatValue;

    /**
     *
     * @param report
     * @param name
     */
    function getNonNegativeStat(report, name) {
        let value = getStatValue(report, name);

        if (typeof value !== 'number') {
            value = Number(value);
        }

        if (isNaN(value)) {
            return 0;
        }

        return Math.max(0, value);
    }
    const byteSentStats = {};

    for (const idx in this.currentStatsReport) {
        if (!this.currentStatsReport.hasOwnProperty(idx)) {
            continue;
        }
        const now = this.currentStatsReport[idx];

        try {
            const receiveBandwidth = getStatValue(now, 'receiveBandwidth');
            const sendBandwidth = getStatValue(now, 'sendBandwidth');

            if (receiveBandwidth || sendBandwidth) {
                this.conferenceStats.bandwidth = {
                    'download': Math.round(receiveBandwidth / 1000),
                    'upload': Math.round(sendBandwidth / 1000)
                };
            }
        } catch (e) { /* not supported*/ }

        if (now.type === 'googCandidatePair') {
            let active, ip, localip, type;

            try {
                ip = getStatValue(now, 'remoteAddress');
                type = getStatValue(now, 'transportType');
                localip = getStatValue(now, 'localAddress');
                active = getStatValue(now, 'activeConnection');
            } catch (e) { /* not supported*/ }
            if (!ip || !type || !localip || active !== 'true') {
                continue;
            }

            // Save the address unless it has been saved already.
            const conferenceStatsTransport = this.conferenceStats.transport;

            if (!conferenceStatsTransport.some(
                    t =>
                       t.ip === ip
                       && t.type === type
                       && t.localip === localip)) {
                conferenceStatsTransport.push({
                    ip,
                    type,
                    localip,
                    p2p: this.peerconnection.isP2P
                });
            }
            continue;
        }

        if (now.type === 'candidatepair') {
            // we need succeeded pairs only
            if (now.state !== 'succeeded') {
                continue;
            }

            const local = this.currentStatsReport[now.localCandidateId];
            const remote = this.currentStatsReport[now.remoteCandidateId];

            this.conferenceStats.transport.push({
                ip: `${remote.ipAddress}:${remote.portNumber}`,
                type: local.transport,
                localip: `${local.ipAddress}:${local.portNumber}`,
                p2p: this.peerconnection.isP2P
            });
        }

        if (now.type !== 'ssrc' && now.type !== 'outboundrtp'
            && now.type !== 'inboundrtp') {
            continue;
        }

        const before = this.previousStatsReport[idx];
        const ssrc = getStatValue(now, 'ssrc');

        if (!before || !ssrc) {
            continue;
        }

        const ssrcStats
          = this.ssrc2stats[ssrc] || (this.ssrc2stats[ssrc] = new SsrcStats());

        let isDownloadStream = true;
        let key = 'packetsReceived';
        let packetsNow = getStatValue(now, key);

        if (typeof packetsNow === 'undefined'
            || packetsNow === null || packetsNow === '') {
            isDownloadStream = false;
            key = 'packetsSent';
            packetsNow = getStatValue(now, key);
            if (typeof packetsNow === 'undefined' || packetsNow === null) {
                logger.warn('No packetsReceived nor packetsSent stat found');
                continue;
            }
        }
        if (!packetsNow || packetsNow < 0) {
            packetsNow = 0;
        }

        const packetsBefore = getNonNegativeStat(before, key);
        const packetsDiff = Math.max(0, packetsNow - packetsBefore);

        const packetsLostNow = getNonNegativeStat(now, 'packetsLost');
        const packetsLostBefore = getNonNegativeStat(before, 'packetsLost');
        const packetsLostDiff = Math.max(0, packetsLostNow - packetsLostBefore);

        ssrcStats.setLoss({
            packetsTotal: packetsDiff + packetsLostDiff,
            packetsLost: packetsLostDiff,
            isDownloadStream
        });

        const bytesReceivedNow = getNonNegativeStat(now, 'bytesReceived');
        const bytesReceivedBefore = getNonNegativeStat(before, 'bytesReceived');
        const bytesReceived
            = Math.max(0, bytesReceivedNow - bytesReceivedBefore);

        let bytesSent = 0;

        // TODO: clean this mess up!
        let nowBytesTransmitted = getStatValue(now, 'bytesSent');

        if (typeof nowBytesTransmitted === 'number'
            || typeof nowBytesTransmitted === 'string') {
            nowBytesTransmitted = Number(nowBytesTransmitted);
            if (!isNaN(nowBytesTransmitted)) {
                byteSentStats[ssrc] = nowBytesTransmitted;
                if (nowBytesTransmitted > 0) {
                    bytesSent = nowBytesTransmitted
                        - getStatValue(before, 'bytesSent');
                }
            }
        }
        bytesSent = Math.max(0, bytesSent);

        const timeMs = now.timestamp - before.timestamp;
        let bitrateReceivedKbps = 0, bitrateSentKbps = 0;

        if (timeMs > 0) {
            // TODO is there any reason to round here?
            bitrateReceivedKbps = Math.round((bytesReceived * 8) / timeMs);
            bitrateSentKbps = Math.round((bytesSent * 8) / timeMs);
        }

        ssrcStats.addBitrate({
            'download': bitrateReceivedKbps,
            'upload': bitrateSentKbps
        });

        const resolution = { height: null,
            width: null };

        try {
            let height, width;

            if ((height = getStatValue(now, 'googFrameHeightReceived'))
                && (width = getStatValue(now, 'googFrameWidthReceived'))) {
                resolution.height = height;
                resolution.width = width;
            } else if ((height = getStatValue(now, 'googFrameHeightSent'))
                && (width = getStatValue(now, 'googFrameWidthSent'))) {
                resolution.height = height;
                resolution.width = width;
            }
        } catch (e) { /* not supported*/ }

        // Tries to get frame rate
        try {
            ssrcStats.setFramerate(
                getStatValue(now, 'googFrameRateReceived')
                || getStatValue(now, 'googFrameRateSent')
                || 0);
        } catch (e) {
            // if it fails with previous properties(chrome),
            // let's try with another one (FF)
            try {
                ssrcStats.setFramerate(Math.round(
                    getNonNegativeStat(now, 'framerateMean')));
            } catch (err) { /* not supported*/ }
        }

        if (resolution.height && resolution.width) {
            ssrcStats.setResolution(resolution);
        } else {
            ssrcStats.setResolution(null);
        }
    }

    // process stats
    const totalPackets = {
        download: 0,
        upload: 0
    };
    const lostPackets = {
        download: 0,
        upload: 0
    };
    let bitrateDownload = 0;
    let bitrateUpload = 0;
    const resolutions = {};
    const framerates = {};

    Object.keys(this.ssrc2stats).forEach(
        function(ssrc) {
            const ssrcStats = this.ssrc2stats[ssrc];

            // process packet loss stats
            const loss = ssrcStats.loss;
            const type = loss.isDownloadStream ? 'download' : 'upload';

            totalPackets[type] += loss.packetsTotal;
            lostPackets[type] += loss.packetsLost;

            // process bitrate stats
            bitrateDownload += ssrcStats.bitrate.download;
            bitrateUpload += ssrcStats.bitrate.upload;

            ssrcStats.resetBitrate();

            // collect resolutions
            resolutions[ssrc] = ssrcStats.resolution;

            // collect framerates
            framerates[ssrc] = ssrcStats.framerate;
        },
        this
    );

    this.eventEmitter.emit(
        StatisticsEvents.BYTE_SENT_STATS, this.peerconnection, byteSentStats);

    this.conferenceStats.bitrate
      = { 'upload': bitrateUpload,
          'download': bitrateDownload };

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
        'bandwidth': this.conferenceStats.bandwidth,
        'bitrate': this.conferenceStats.bitrate,
        'packetLoss': this.conferenceStats.packetLoss,
        'resolution': resolutions,
        'framerate': framerates,
        'transport': this.conferenceStats.transport
    });
    this.conferenceStats.transport = [];
};

/**
 * Stats processing logic.
 */
StatsCollector.prototype.processAudioLevelReport = function() {
    if (!this.baselineAudioLevelsReport) {
        return;
    }

    const getStatValue = this._getStatValue;

    for (const idx in this.currentAudioLevelsReport) {
        if (!this.currentAudioLevelsReport.hasOwnProperty(idx)) {
            continue;
        }

        const now = this.currentAudioLevelsReport[idx];

        if (now.type !== 'ssrc') {
            continue;
        }

        const before = this.baselineAudioLevelsReport[idx];
        const ssrc = getStatValue(now, 'ssrc');

        if (!before) {
            logger.warn(`${ssrc} not enough data`);
            continue;
        }

        if (!ssrc) {
            if ((Date.now() - now.timestamp) < 3000) {
                logger.warn('No ssrc: ');
            }
            continue;
        }

        // Audio level
        let audioLevel;

        try {
            audioLevel
                = getStatValue(now, 'audioInputLevel')
                    || getStatValue(now, 'audioOutputLevel');
        } catch (e) { /* not supported*/
            logger.warn('Audio Levels are not available in the statistics.');
            clearInterval(this.audioLevelsIntervalId);

            return;
        }

        if (audioLevel) {
            const isLocal = !getStatValue(now, 'packetsReceived');

            // TODO: Can't find specs about what this value really is, but it
            // seems to vary between 0 and around 32k.
            audioLevel = audioLevel / 32767;
            this.eventEmitter.emit(
                StatisticsEvents.AUDIO_LEVEL, ssrc, audioLevel, isLocal);
        }
    }
};

/* eslint-enable no-continue */
