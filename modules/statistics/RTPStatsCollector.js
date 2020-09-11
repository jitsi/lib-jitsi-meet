import { browsers } from '@jitsi/js-utils';
import { getLogger } from 'jitsi-meet-logger';

import * as MediaType from '../../service/RTC/MediaType';
import * as StatisticsEvents from '../../service/statistics/Events';
import browser from '../browser';

const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

const logger = getLogger(__filename);

/**
 * The lib-jitsi-meet browser-agnostic names of the browser-specific keys
 * reported by RTCPeerConnection#getStats mapped by browser.
 */
const KEYS_BY_BROWSER_TYPE = {};

KEYS_BY_BROWSER_TYPE[browsers.FIREFOX] = {
    'ssrc': 'ssrc',
    'packetsReceived': 'packetsReceived',
    'packetsLost': 'packetsLost',
    'packetsSent': 'packetsSent',
    'bytesReceived': 'bytesReceived',
    'bytesSent': 'bytesSent',
    'framerateMean': 'framerateMean',
    'ip': 'address',
    'port': 'port',
    'protocol': 'protocol'
};
KEYS_BY_BROWSER_TYPE[browsers.CHROME] = {
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
    'googCodecName': 'googCodecName',
    'googFrameHeightReceived': 'googFrameHeightReceived',
    'googFrameWidthReceived': 'googFrameWidthReceived',
    'googFrameHeightSent': 'googFrameHeightSent',
    'googFrameWidthSent': 'googFrameWidthSent',
    'googFrameRateReceived': 'googFrameRateReceived',
    'googFrameRateSent': 'googFrameRateSent',
    'audioInputLevel': 'audioInputLevel',
    'audioOutputLevel': 'audioOutputLevel',
    'currentRoundTripTime': 'googRtt',
    'remoteCandidateType': 'googRemoteCandidateType',
    'localCandidateType': 'googLocalCandidateType',
    'ip': 'ip',
    'port': 'port',
    'protocol': 'protocol'
};
KEYS_BY_BROWSER_TYPE[browsers.OPERA]
    = KEYS_BY_BROWSER_TYPE[browsers.CHROME];
KEYS_BY_BROWSER_TYPE[browsers.NWJS]
    = KEYS_BY_BROWSER_TYPE[browsers.CHROME];
KEYS_BY_BROWSER_TYPE[browsers.ELECTRON]
    = KEYS_BY_BROWSER_TYPE[browsers.CHROME];
KEYS_BY_BROWSER_TYPE[browsers.SAFARI]
    = KEYS_BY_BROWSER_TYPE[browsers.CHROME];
KEYS_BY_BROWSER_TYPE[browsers.REACT_NATIVE]
    = KEYS_BY_BROWSER_TYPE[browsers.CHROME];

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
    this.codec = '';
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

SsrcStats.prototype.setCodec = function(codec) {
    this.codec = codec || '';
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
export default function StatsCollector(
        peerconnection,
        audioLevelsInterval,
        statsInterval,
        eventEmitter) {
    // StatsCollector depends entirely on the format of the reports returned by
    // RTCPeerConnection#getStats. Given that the value of
    // browser#getName() is very unlikely to change at runtime, it
    // makes sense to discover whether StatsCollector supports the executing
    // browser as soon as possible. Otherwise, (1) getStatValue would have to
    // needlessly check a "static" condition multiple times very very often and
    // (2) the lack of support for the executing browser would be discovered and
    // reported multiple times very very often too late in the execution in some
    // totally unrelated callback.
    /**
     * The browser type supported by this StatsCollector. In other words, the
     * type of the browser which initialized this StatsCollector
     * instance.
     * @private
     */
    this._browserType = browser.getName();
    const keys = KEYS_BY_BROWSER_TYPE[this._browserType];

    if (!keys) {
        // eslint-disable-next-line no-throw-literal
        throw `The browser type '${this._browserType}' isn't supported!`;
    }

    /**
     * Whether to use the Promise-based getStats API or not.
     * @type {boolean}
     */
    this._usesPromiseGetStats
        = browser.isSafari() || browser.isFirefox();

    /**
     * The function which is to be used to retrieve the value associated in a
     * report returned by RTCPeerConnection#getStats with a lib-jitsi-meet
     * browser-agnostic name/key.
     *
     * @function
     * @private
     */
    this._getStatValue
        = this._usesPromiseGetStats
            ? this._defineNewGetStatValueMethod(keys)
            : this._defineGetStatValueMethod(keys);

    this.peerconnection = peerconnection;
    this.baselineAudioLevelsReport = null;
    this.currentAudioLevelsReport = null;
    this.currentStatsReport = null;
    this.previousStatsReport = null;
    this.audioLevelReportHistory = {};
    this.audioLevelsIntervalId = null;
    this.eventEmitter = eventEmitter;
    this.conferenceStats = new ConferenceStats();

    // Updates stats interval
    this.audioLevelsIntervalMilis = audioLevelsInterval;

    this.statsIntervalId = null;
    this.statsIntervalMilis = statsInterval;

    /**
     * Maps SSRC numbers to {@link SsrcStats}.
     * @type {Map<number,SsrcStats}
     */
    this.ssrc2stats = new Map();
}

/* eslint-enable max-params */

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
    if (startAudioLevelStats) {
        if (browser.supportsReceiverStats()) {
            logger.info('Using RTCRtpSynchronizationSource for remote audio levels');
        }
        this.audioLevelsIntervalId = setInterval(
            () => {
                if (browser.supportsReceiverStats()) {
                    const audioLevels = this.peerconnection.getAudioLevels();

                    for (const ssrc in audioLevels) {
                        if (audioLevels.hasOwnProperty(ssrc)) {
                            // Use a scaling factor of 2.5 to report the same
                            // audio levels that getStats reports.
                            const audioLevel = audioLevels[ssrc] * 2.5;

                            this.eventEmitter.emit(
                                StatisticsEvents.AUDIO_LEVEL,
                                this.peerconnection,
                                Number.parseInt(ssrc, 10),
                                audioLevel,
                                false /* isLocal */);
                        }
                    }
                } else {
                    // Interval updates
                    this.peerconnection.getStats(
                        report => {
                            let results = null;

                            if (!report || !report.result
                                || typeof report.result !== 'function') {
                                results = report;
                            } else {
                                results = report.result();
                            }
                            this.currentAudioLevelsReport = results;
                            if (this._usesPromiseGetStats) {
                                this.processNewAudioLevelReport();
                            } else {
                                this.processAudioLevelReport();
                            }

                            this.baselineAudioLevelsReport
                                = this.currentAudioLevelsReport;
                        },
                        error => this.errorCallback(error)
                    );
                }
            },
            this.audioLevelsIntervalMilis
        );
    }

    this.statsIntervalId = setInterval(
        () => {
            // Interval updates
            this.peerconnection.getStats(
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

                    this.currentStatsReport = results;
                    try {
                        if (this._usesPromiseGetStats) {
                            this.processNewStatsReport();
                        } else {
                            this.processStatsReport();
                        }
                    } catch (e) {
                        GlobalOnErrorHandler.callErrorHandler(e);
                        logger.error(`Unsupported key:${e}`, e);
                    }

                    this.previousStatsReport = this.currentStatsReport;
                },
                error => this.errorCallback(error)
            );
        },
        this.statsIntervalMilis
    );
};

/**
 * Defines a function which (1) is to be used as a StatsCollector method and (2)
 * gets the value from a specific report returned by RTCPeerConnection#getStats
 * associated with a lib-jitsi-meet browser-agnostic name.
 *
 * @param {Object.<string,string>} keys the map of LibJitsi browser-agnostic
 * names to RTCPeerConnection#getStats browser-specific keys
 */
StatsCollector.prototype._defineGetStatValueMethod = function(keys) {
    // Define the function which converts a lib-jitsi-meet browser-asnostic name
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
    case browsers.CHROME:
    case browsers.OPERA:
    case browsers.NWJS:
    case browsers.ELECTRON:
        // TODO What about other types of browser which are based on Chrome such
        // as NW.js? Every time we want to support a new type browser we have to
        // go and add more conditions (here and in multiple other places).
        // Cannot we do a feature detection instead of a browser type check? For
        // example, if item has a stat property of type function, then it's very
        // likely that whoever defined it wanted you to call it in order to
        // retrieve the value associated with a specific key.
        itemStatByKey = (item, key) => item.stat(key);
        break;
    case browsers.REACT_NATIVE:
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
    // associated with a specific lib-jitsi-meet browser-agnostic name.
    return (item, name) => itemStatByKey(item, keyFromName(name));
};

/**
 * Obtains a stat value from given stat and converts it to a non-negative
 * number. If the value is either invalid or negative then 0 will be returned.
 * @param report
 * @param {string} name
 * @return {number}
 * @private
 */
StatsCollector.prototype.getNonNegativeStat = function(report, name) {
    let value = this._getStatValue(report, name);

    if (typeof value !== 'number') {
        value = Number(value);
    }

    if (isNaN(value)) {
        return 0;
    }

    return Math.max(0, value);
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
    const byteSentStats = {};

    for (const idx in this.currentStatsReport) {
        if (!this.currentStatsReport.hasOwnProperty(idx)) {
            continue;
        }
        const now = this.currentStatsReport[idx];

        // The browser API may return "undefined" values in the array
        if (!now) {
            continue;
        }

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
            let active, ip, localCandidateType, localip,
                remoteCandidateType, rtt, type;

            try {
                active = getStatValue(now, 'activeConnection');
                if (!active) {
                    continue;
                }

                ip = getStatValue(now, 'remoteAddress');
                type = getStatValue(now, 'transportType');
                localip = getStatValue(now, 'localAddress');
                localCandidateType = getStatValue(now, 'localCandidateType');
                remoteCandidateType = getStatValue(now, 'remoteCandidateType');
                rtt = this.getNonNegativeStat(now, 'currentRoundTripTime');
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
                    p2p: this.peerconnection.isP2P,
                    localCandidateType,
                    remoteCandidateType,
                    rtt
                });
            }
            continue;
        }

        if (now.type === 'candidatepair') {
            // we need succeeded and selected pairs only
            if (now.state !== 'succeeded' || !now.selected) {
                continue;
            }

            const local = this.currentStatsReport[now.localCandidateId];
            const remote = this.currentStatsReport[now.remoteCandidateId];

            this.conferenceStats.transport.push({
                ip: `${remote.ipAddress}:${remote.portNumber}`,
                type: local.transport,
                localip: `${local.ipAddress}:${local.portNumber}`,
                p2p: this.peerconnection.isP2P,
                localCandidateType: local.candidateType,
                remoteCandidateType: remote.candidateType
            });
        }

        if (now.type !== 'ssrc' && now.type !== 'outboundrtp'
            && now.type !== 'inboundrtp' && now.type !== 'track') {
            continue;
        }

        const before = this.previousStatsReport[idx];
        let ssrc = this.getNonNegativeStat(now, 'ssrc');

        // If type="track", take the first SSRC from ssrcIds.
        if (now.type === 'track' && Array.isArray(now.ssrcIds)) {
            ssrc = Number(now.ssrcIds[0]);
        }

        if (!before || !ssrc) {
            continue;
        }

        // isRemote is available only in FF and is ignored in case of chrome
        // according to the spec
        // https://www.w3.org/TR/webrtc-stats/#dom-rtcrtpstreamstats-isremote
        // when isRemote is true indicates that the measurements were done at
        // the remote endpoint and reported in an RTCP RR/XR.
        // Fixes a problem where we are calculating local stats wrong adding
        // the sent bytes to the local download bitrate.
        // In new W3 stats spec, type="track" has a remoteSource boolean
        // property.
        if (now.isRemote === true || now.remoteSource === true) {
            continue;
        }

        let ssrcStats = this.ssrc2stats.get(ssrc);

        if (!ssrcStats) {
            ssrcStats = new SsrcStats();
            this.ssrc2stats.set(ssrc, ssrcStats);
        }

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
            }
        }
        if (!packetsNow || packetsNow < 0) {
            packetsNow = 0;
        }

        const packetsBefore = this.getNonNegativeStat(before, key);
        const packetsDiff = Math.max(0, packetsNow - packetsBefore);

        const packetsLostNow
            = this.getNonNegativeStat(now, 'packetsLost');
        const packetsLostBefore
            = this.getNonNegativeStat(before, 'packetsLost');
        const packetsLostDiff = Math.max(0, packetsLostNow - packetsLostBefore);

        ssrcStats.setLoss({
            packetsTotal: packetsDiff + packetsLostDiff,
            packetsLost: packetsLostDiff,
            isDownloadStream
        });

        const bytesReceivedNow
            = this.getNonNegativeStat(now, 'bytesReceived');
        const bytesReceivedBefore
            = this.getNonNegativeStat(before, 'bytesReceived');
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

        const resolution = {
            height: null,
            width: null
        };

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
        let frameRate;

        try {
            frameRate = getStatValue(now, 'googFrameRateReceived')
                || getStatValue(now, 'googFrameRateSent') || 0;
        } catch (e) {
            // if it fails with previous properties(chrome),
            // let's try with another one (FF)
            try {
                frameRate = this.getNonNegativeStat(now, 'framerateMean');
            } catch (err) { /* not supported*/ }
        }
        ssrcStats.setFramerate(Math.round(frameRate || 0));

        if (resolution.height && resolution.width) {
            ssrcStats.setResolution(resolution);
        } else {
            ssrcStats.setResolution(null);
        }

        let codec;

        // Try to get the codec for later reporting.
        try {
            codec = getStatValue(now, 'googCodecName') || '';
        } catch (e) { /* not supported*/ }

        ssrcStats.setCodec(codec);
    }


    this.eventEmitter.emit(
        StatisticsEvents.BYTE_SENT_STATS, this.peerconnection, byteSentStats);

    this._processAndEmitReport();
};

/**
 *
 */
StatsCollector.prototype._processAndEmitReport = function() {
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
    const codecs = {};
    let audioBitrateDownload = 0;
    let audioBitrateUpload = 0;
    let audioCodec = '';
    let videoBitrateDownload = 0;
    let videoBitrateUpload = 0;
    let videoCodec = '';

    for (const [ ssrc, ssrcStats ] of this.ssrc2stats) {
        // process packet loss stats
        const loss = ssrcStats.loss;
        const type = loss.isDownloadStream ? 'download' : 'upload';

        totalPackets[type] += loss.packetsTotal;
        lostPackets[type] += loss.packetsLost;

        // process bitrate stats
        bitrateDownload += ssrcStats.bitrate.download;
        bitrateUpload += ssrcStats.bitrate.upload;

        // collect resolutions and framerates
        const track = this.peerconnection.getTrackBySSRC(ssrc);

        if (track) {
            if (track.isAudioTrack()) {
                audioBitrateDownload += ssrcStats.bitrate.download;
                audioBitrateUpload += ssrcStats.bitrate.upload;
                audioCodec = ssrcStats.codec;
            } else {
                videoBitrateDownload += ssrcStats.bitrate.download;
                videoBitrateUpload += ssrcStats.bitrate.upload;
                videoCodec = ssrcStats.codec;
            }

            const participantId = track.getParticipantId();

            if (participantId) {
                const resolution = ssrcStats.resolution;

                if (resolution.width
                        && resolution.height
                        && resolution.width !== -1
                        && resolution.height !== -1) {
                    const userResolutions = resolutions[participantId] || {};

                    userResolutions[ssrc] = resolution;
                    resolutions[participantId] = userResolutions;
                }
                if (ssrcStats.framerate !== 0) {
                    const userFramerates = framerates[participantId] || {};

                    userFramerates[ssrc] = ssrcStats.framerate;
                    framerates[participantId] = userFramerates;
                }
                if (audioCodec.length && videoCodec.length) {
                    const codecDesc = {
                        'audio': audioCodec,
                        'video': videoCodec
                    };

                    const userCodecs = codecs[participantId] || {};

                    userCodecs[ssrc] = codecDesc;
                    codecs[participantId] = userCodecs;
                }
            } else {
                logger.error(`No participant ID returned by ${track}`);
            }
        }

        ssrcStats.resetBitrate();
    }

    this.conferenceStats.bitrate = {
        'upload': bitrateUpload,
        'download': bitrateDownload
    };

    this.conferenceStats.bitrate.audio = {
        'upload': audioBitrateUpload,
        'download': audioBitrateDownload
    };

    this.conferenceStats.bitrate.video = {
        'upload': videoBitrateUpload,
        'download': videoBitrateDownload
    };

    this.conferenceStats.packetLoss = {
        total:
            calculatePacketLoss(
                lostPackets.download + lostPackets.upload,
                totalPackets.download + totalPackets.upload),
        download:
            calculatePacketLoss(lostPackets.download, totalPackets.download),
        upload:
            calculatePacketLoss(lostPackets.upload, totalPackets.upload)
    };

    const avgAudioLevels = {};
    let localAvgAudioLevels;

    Object.keys(this.audioLevelReportHistory).forEach(ssrc => {
        const { data, isLocal } = this.audioLevelReportHistory[ssrc];
        const avgAudioLevel = data.reduce((sum, currentValue) => sum + currentValue) / data.length;

        if (isLocal) {
            localAvgAudioLevels = avgAudioLevel;
        } else {
            const track = this.peerconnection.getTrackBySSRC(Number(ssrc));

            if (track) {
                const participantId = track.getParticipantId();

                if (participantId) {
                    avgAudioLevels[participantId] = avgAudioLevel;
                }
            }
        }
    });
    this.audioLevelReportHistory = {};

    this.eventEmitter.emit(
        StatisticsEvents.CONNECTION_STATS,
        this.peerconnection,
        {
            'bandwidth': this.conferenceStats.bandwidth,
            'bitrate': this.conferenceStats.bitrate,
            'packetLoss': this.conferenceStats.packetLoss,
            'resolution': resolutions,
            'framerate': framerates,
            'codec': codecs,
            'transport': this.conferenceStats.transport,
            localAvgAudioLevels,
            avgAudioLevels
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

        if (now.type !== 'ssrc' && now.type !== 'track') {
            continue;
        }

        const before = this.baselineAudioLevelsReport[idx];
        let ssrc = this.getNonNegativeStat(now, 'ssrc');

        if (!ssrc && Array.isArray(now.ssrcIds)) {
            ssrc = Number(now.ssrcIds[0]);
        }

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
            let isLocal;

            // If type="ssrc" (legacy) check whether they are received packets.
            if (now.type === 'ssrc') {
                isLocal = !getStatValue(now, 'packetsReceived');

            // If type="track", check remoteSource boolean property.
            } else {
                isLocal = !now.remoteSource;
            }

            // According to the W3C WebRTC Stats spec, audioLevel should be in
            // 0..1 range (0 == silence). However browsers don't behave that
            // way so we must convert it to 0..1.
            // TODO: Can't find specs about what this value really is, but it
            // seems to vary between 0 and around 32k.
            audioLevel = audioLevel / 32767;

            if (!(ssrc in this.audioLevelReportHistory)) {
                this.audioLevelReportHistory[ssrc] = {
                    isLocal,
                    data: []
                };
            }
            this.audioLevelReportHistory[ssrc].data.push(audioLevel);

            this.eventEmitter.emit(
                StatisticsEvents.AUDIO_LEVEL,
                this.peerconnection,
                ssrc,
                audioLevel,
                isLocal);
        }
    }
};

/* eslint-enable no-continue */

/**
 * New promised based getStats report processing.
 * Tested with chrome, firefox and safari. Not switching it on for chrome as
 * frameRate stat is missing and calculating it using framesSent,
 * gives values double the values seen in webrtc-internals.
 * https://w3c.github.io/webrtc-stats/
 */

/**
 * Defines a function which (1) is to be used as a StatsCollector method and (2)
 * gets the value from a specific report returned by RTCPeerConnection#getStats
 * associated with a lib-jitsi-meet browser-agnostic name in case of using
 * Promised based getStats.
 *
 * @param {Object.<string,string>} keys the map of LibJitsi browser-agnostic
 * names to RTCPeerConnection#getStats browser-specific keys
 */
StatsCollector.prototype._defineNewGetStatValueMethod = function(keys) {
    // Define the function which converts a lib-jitsi-meet browser-asnostic name
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

    // Compose the 2 functions defined above to get a function which retrieves
    // the value from a specific report returned by RTCPeerConnection#getStats
    // associated with a specific lib-jitsi-meet browser-agnostic name.
    return (item, name) => item[keyFromName(name)];
};

/**
 * Converts the value to a non-negative number.
 * If the value is either invalid or negative then 0 will be returned.
 * @param {*} v
 * @return {number}
 * @private
 */
StatsCollector.prototype.getNonNegativeValue = function(v) {
    let value = v;

    if (typeof value !== 'number') {
        value = Number(value);
    }

    if (isNaN(value)) {
        return 0;
    }

    return Math.max(0, value);
};

/**
 * Calculates bitrate between before and now using a supplied field name and its
 * value in the stats.
 * @param {RTCInboundRtpStreamStats|RTCSentRtpStreamStats} now the current stats
 * @param {RTCInboundRtpStreamStats|RTCSentRtpStreamStats} before the
 * previous stats.
 * @param fieldName the field to use for calculations.
 * @return {number} the calculated bitrate between now and before.
 * @private
 */
StatsCollector.prototype._calculateBitrate = function(now, before, fieldName) {
    const bytesNow = this.getNonNegativeValue(now[fieldName]);
    const bytesBefore = this.getNonNegativeValue(before[fieldName]);
    const bytesProcessed = Math.max(0, bytesNow - bytesBefore);

    const timeMs = now.timestamp - before.timestamp;
    let bitrateKbps = 0;

    if (timeMs > 0) {
        // TODO is there any reason to round here?
        bitrateKbps = Math.round((bytesProcessed * 8) / timeMs);
    }

    return bitrateKbps;
};

/**
 * Stats processing new getStats logic.
 */
StatsCollector.prototype.processNewStatsReport = function() {
    if (!this.previousStatsReport) {
        return;
    }

    const getStatValue = this._getStatValue;
    const byteSentStats = {};

    this.currentStatsReport.forEach(now => {

        // RTCIceCandidatePairStats
        // https://w3c.github.io/webrtc-stats/#candidatepair-dict*
        if (now.type === 'candidate-pair'
            && now.nominated
            && now.state === 'succeeded') {

            const availableIncomingBitrate = now.availableIncomingBitrate;
            const availableOutgoingBitrate = now.availableOutgoingBitrate;

            if (availableIncomingBitrate || availableOutgoingBitrate) {
                this.conferenceStats.bandwidth = {
                    'download': Math.round(availableIncomingBitrate / 1000),
                    'upload': Math.round(availableOutgoingBitrate / 1000)
                };
            }

            const remoteUsedCandidate
                = this.currentStatsReport.get(now.remoteCandidateId);
            const localUsedCandidate
                = this.currentStatsReport.get(now.localCandidateId);

            // RTCIceCandidateStats
            // https://w3c.github.io/webrtc-stats/#icecandidate-dict*
            // safari currently does not provide ice candidates in stats
            if (remoteUsedCandidate && localUsedCandidate) {
                const remoteIpAddress = getStatValue(remoteUsedCandidate, 'ip');
                const remotePort = getStatValue(remoteUsedCandidate, 'port');
                const ip = `${remoteIpAddress}:${remotePort}`;

                const localIpAddress = getStatValue(localUsedCandidate, 'ip');
                const localPort = getStatValue(localUsedCandidate, 'port');

                const localIp = `${localIpAddress}:${localPort}`;
                const type = getStatValue(remoteUsedCandidate, 'protocol');

                // Save the address unless it has been saved already.
                const conferenceStatsTransport = this.conferenceStats.transport;

                if (!conferenceStatsTransport.some(
                        t =>
                            t.ip === ip
                            && t.type === type
                            && t.localip === localIp)) {
                    conferenceStatsTransport.push({
                        ip,
                        type,
                        localIp,
                        p2p: this.peerconnection.isP2P,
                        localCandidateType: localUsedCandidate.candidateType,
                        remoteCandidateType: remoteUsedCandidate.candidateType,
                        networkType: localUsedCandidate.networkType,
                        rtt: now.currentRoundTripTime * 1000
                    });
                }
            }

        // RTCReceivedRtpStreamStats
        // https://w3c.github.io/webrtc-stats/#receivedrtpstats-dict*
        // RTCSentRtpStreamStats
        // https://w3c.github.io/webrtc-stats/#sentrtpstats-dict*
        } else if (now.type === 'inbound-rtp' || now.type === 'outbound-rtp') {
            const before = this.previousStatsReport.get(now.id);
            const ssrc = this.getNonNegativeValue(now.ssrc);

            if (!before || !ssrc) {
                return;
            }

            let ssrcStats = this.ssrc2stats.get(ssrc);

            if (!ssrcStats) {
                ssrcStats = new SsrcStats();
                this.ssrc2stats.set(ssrc, ssrcStats);
            }

            let isDownloadStream = true;
            let key = 'packetsReceived';

            if (now.type === 'outbound-rtp') {
                isDownloadStream = false;
                key = 'packetsSent';
            }

            let packetsNow = now[key];

            if (!packetsNow || packetsNow < 0) {
                packetsNow = 0;
            }

            const packetsBefore = this.getNonNegativeValue(before[key]);
            const packetsDiff = Math.max(0, packetsNow - packetsBefore);

            const packetsLostNow
                = this.getNonNegativeValue(now.packetsLost);
            const packetsLostBefore
                = this.getNonNegativeValue(before.packetsLost);
            const packetsLostDiff
                = Math.max(0, packetsLostNow - packetsLostBefore);

            ssrcStats.setLoss({
                packetsTotal: packetsDiff + packetsLostDiff,
                packetsLost: packetsLostDiff,
                isDownloadStream
            });

            if (now.type === 'inbound-rtp') {

                ssrcStats.addBitrate({
                    'download': this._calculateBitrate(
                                    now, before, 'bytesReceived'),
                    'upload': 0
                });

                // RTCInboundRtpStreamStats
                // https://w3c.github.io/webrtc-stats/#inboundrtpstats-dict*
                // TODO: can we use framesDecoded for frame rate, available
                // in chrome
            } else {
                byteSentStats[ssrc] = this.getNonNegativeValue(now.bytesSent);
                ssrcStats.addBitrate({
                    'download': 0,
                    'upload': this._calculateBitrate(
                                now, before, 'bytesSent')
                });

                // RTCOutboundRtpStreamStats
                // https://w3c.github.io/webrtc-stats/#outboundrtpstats-dict*
                // TODO: can we use framesEncoded for frame rate, available
                // in chrome
            }

            // FF has framerateMean out of spec
            const framerateMean = now.framerateMean;

            if (framerateMean) {
                ssrcStats.setFramerate(Math.round(framerateMean || 0));
            }

        // track for resolution
        // RTCVideoHandlerStats
        // https://w3c.github.io/webrtc-stats/#vststats-dict*
        // RTCMediaHandlerStats
        // https://w3c.github.io/webrtc-stats/#mststats-dict*
        } else if (now.type === 'track') {

            const resolution = {
                height: now.frameHeight,
                width: now.frameWidth
            };

            // Tries to get frame rate
            let frameRate = now.framesPerSecond;

            if (!frameRate) {
                // we need to calculate it
                const before = this.previousStatsReport.get(now.id);

                if (before) {
                    const timeMs = now.timestamp - before.timestamp;

                    if (timeMs > 0 && now.framesSent) {
                        const numberOfFramesSinceBefore
                            = now.framesSent - before.framesSent;

                        frameRate = (numberOfFramesSinceBefore / timeMs) * 1000;
                    }
                }

                if (!frameRate) {
                    return;
                }
            }

            const trackIdentifier = now.trackIdentifier;
            const ssrc = this.peerconnection.getSsrcByTrackId(trackIdentifier);

            if (!ssrc) {
                return;
            }
            let ssrcStats = this.ssrc2stats.get(ssrc);

            if (!ssrcStats) {
                ssrcStats = new SsrcStats();
                this.ssrc2stats.set(ssrc, ssrcStats);
            }
            ssrcStats.setFramerate(Math.round(frameRate || 0));

            if (resolution.height && resolution.width) {
                ssrcStats.setResolution(resolution);
            } else {
                ssrcStats.setResolution(null);
            }
        }
    });

    this.eventEmitter.emit(
        StatisticsEvents.BYTE_SENT_STATS, this.peerconnection, byteSentStats);

    this._processAndEmitReport();
};

/**
 * Stats processing logic.
 */
StatsCollector.prototype.processNewAudioLevelReport = function() {
    if (!this.baselineAudioLevelsReport) {
        return;
    }

    this.currentAudioLevelsReport.forEach(now => {
        if (now.type !== 'track') {
            return;
        }

        // Audio level
        const audioLevel = now.audioLevel;

        if (!audioLevel) {
            return;
        }

        const trackIdentifier = now.trackIdentifier;
        const ssrc = this.peerconnection.getSsrcByTrackId(trackIdentifier);

        if (ssrc) {
            const isLocal
                = ssrc === this.peerconnection.getLocalSSRC(
                this.peerconnection.getLocalTracks(MediaType.AUDIO));

            this.eventEmitter.emit(
                StatisticsEvents.AUDIO_LEVEL,
                this.peerconnection,
                ssrc,
                audioLevel,
                isLocal);
        }
    });
};

/**
 * End new promised based getStats processing methods.
 */
