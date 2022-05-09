import { getLogger } from '@jitsi/logger';

import { MediaType } from '../../service/RTC/MediaType';
import * as StatisticsEvents from '../../service/statistics/Events';
import browser from '../browser';
import FeatureFlags from '../flags/FeatureFlags';

const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

const logger = getLogger(__filename);

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
export default function StatsCollector(peerconnection, audioLevelsInterval, statsInterval, eventEmitter) {
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

    this.speakerList = [];
    this.statsIntervalId = null;
    this.statsIntervalMilis = statsInterval;

    /**
     * Maps SSRC numbers to {@link SsrcStats}.
     * @type {Map<number,SsrcStats}
     */
    this.ssrc2stats = new Map();
}

/**
 * Set the list of the remote speakers for which audio levels are to be calculated.
 *
 * @param {Array<string>} speakerList - Endpoint ids.
 * @returns {void}
 */
StatsCollector.prototype.setSpeakerList = function(speakerList) {
    this.speakerList = speakerList;
};

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
                    const audioLevels = this.peerconnection.getAudioLevels(this.speakerList);

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
                    this.peerconnection.getStats()
                        .then(report => {
                            this.currentAudioLevelsReport = typeof report?.result === 'function'
                                ? report.result()
                                : report;
                            this.processAudioLevelReport();
                            this.baselineAudioLevelsReport = this.currentAudioLevelsReport;
                        })
                        .catch(error => this.errorCallback(error));
                }
            },
            this.audioLevelsIntervalMilis
        );
    }

    const processStats = () => {
        // Interval updates
        this.peerconnection.getStats()
            .then(report => {
                this.currentStatsReport = typeof report?.result === 'function'
                    ? report.result()
                    : report;

                try {
                    this.processStatsReport();
                } catch (error) {
                    GlobalOnErrorHandler.callErrorHandler(error);
                    logger.error('Processing of RTP stats failed:', error);
                }
                this.previousStatsReport = this.currentStatsReport;
            })
            .catch(error => this.errorCallback(error));
    };

    processStats();
    this.statsIntervalId = setInterval(processStats, this.statsIntervalMilis);
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
    let audioCodec;
    let videoBitrateDownload = 0;
    let videoBitrateUpload = 0;
    let videoCodec;

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

            if (FeatureFlags.isSourceNameSignalingEnabled()) {
                const sourceName = track.getSourceName();

                if (sourceName) {
                    const resolution = ssrcStats.resolution;

                    if (resolution.width // eslint-disable-line max-depth
                            && resolution.height
                            && resolution.width !== -1
                            && resolution.height !== -1) {
                        resolutions[sourceName] = resolution;
                    }
                    if (ssrcStats.framerate !== 0) { // eslint-disable-line max-depth
                        framerates[sourceName] = ssrcStats.framerate;
                    }
                    if (audioCodec && videoCodec) { // eslint-disable-line max-depth
                        const codecDesc = {
                            'audio': audioCodec,
                            'video': videoCodec
                        };

                        codecs[sourceName] = codecDesc;
                    }
                } else {
                    logger.error(`No source name returned by ${track}`);
                }
            } else {
                const participantId = track.getParticipantId();

                if (participantId) {
                    const resolution = ssrcStats.resolution;

                    if (resolution.width // eslint-disable-line max-depth
                            && resolution.height
                            && resolution.width !== -1
                            && resolution.height !== -1) {
                        const userResolutions = resolutions[participantId] || {};

                        userResolutions[ssrc] = resolution;
                        resolutions[participantId] = userResolutions;
                    }
                    if (ssrcStats.framerate !== 0) { // eslint-disable-line max-depth
                        const userFramerates = framerates[participantId] || {};

                        userFramerates[ssrc] = ssrcStats.framerate;
                        framerates[participantId] = userFramerates;
                    }
                    if (audioCodec && videoCodec) { // eslint-disable-line max-depth
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
 * Stats processing for spec-compliant RTCPeerConnection#getStats.
 */
StatsCollector.prototype.processStatsReport = function() {
    if (!this.previousStatsReport) {
        return;
    }
    const byteSentStats = {};

    this.currentStatsReport.forEach(now => {
        // RTCIceCandidatePairStats - https://w3c.github.io/webrtc-stats/#candidatepair-dict*
        if (now.type === 'candidate-pair' && now.nominated && now.state === 'succeeded') {
            const availableIncomingBitrate = now.availableIncomingBitrate;
            const availableOutgoingBitrate = now.availableOutgoingBitrate;

            if (availableIncomingBitrate || availableOutgoingBitrate) {
                this.conferenceStats.bandwidth = {
                    'download': Math.round(availableIncomingBitrate / 1000),
                    'upload': Math.round(availableOutgoingBitrate / 1000)
                };
            }

            const remoteUsedCandidate = this.currentStatsReport.get(now.remoteCandidateId);
            const localUsedCandidate = this.currentStatsReport.get(now.localCandidateId);

            // RTCIceCandidateStats
            // https://w3c.github.io/webrtc-stats/#icecandidate-dict*
            if (remoteUsedCandidate && localUsedCandidate) {
                const remoteIpAddress = browser.isChromiumBased()
                    ? remoteUsedCandidate.ip
                    : remoteUsedCandidate.address;
                const remotePort = remoteUsedCandidate.port;
                const ip = `${remoteIpAddress}:${remotePort}`;

                const localIpAddress = browser.isChromiumBased()
                    ? localUsedCandidate.ip
                    : localUsedCandidate.address;
                const localPort = localUsedCandidate.port;
                const localip = `${localIpAddress}:${localPort}`;
                const type = remoteUsedCandidate.protocol;

                // Save the address unless it has been saved already.
                const conferenceStatsTransport = this.conferenceStats.transport;

                if (!conferenceStatsTransport.some(t =>
                    t.ip === ip
                    && t.type === type
                    && t.localip === localip)) {
                    conferenceStatsTransport.push({
                        ip,
                        type,
                        localip,
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

            const packetsLostNow = this.getNonNegativeValue(now.packetsLost);
            const packetsLostBefore = this.getNonNegativeValue(before.packetsLost);
            const packetsLostDiff = Math.max(0, packetsLostNow - packetsLostBefore);

            ssrcStats.setLoss({
                packetsTotal: packetsDiff + packetsLostDiff,
                packetsLost: packetsLostDiff,
                isDownloadStream
            });

            // Get the resolution and framerate for only remote video sources here. For the local video sources,
            // 'track' stats will be used since they have the updated resolution based on the simulcast streams
            // currently being sent. Promise based getStats reports three 'outbound-rtp' streams and there will be
            // more calculations needed to determine what is the highest resolution stream sent by the client if the
            // 'outbound-rtp' stats are used.
            if (now.type === 'inbound-rtp') {
                const resolution = {
                    height: now.frameHeight,
                    width: now.frameWidth
                };
                const frameRate = now.framesPerSecond;

                if (resolution.height && resolution.width) {
                    ssrcStats.setResolution(resolution);
                }
                ssrcStats.setFramerate(Math.round(frameRate || 0));

                ssrcStats.addBitrate({
                    'download': this._calculateBitrate(now, before, 'bytesReceived'),
                    'upload': 0
                });
            } else {
                byteSentStats[ssrc] = this.getNonNegativeValue(now.bytesSent);
                ssrcStats.addBitrate({
                    'download': 0,
                    'upload': this._calculateBitrate(now, before, 'bytesSent')
                });
            }

            const codec = this.currentStatsReport.get(now.codecId);

            if (codec) {
                /**
                 * The mime type has the following form: video/VP8 or audio/ISAC,
                 * so we what to keep just the type after the '/', audio and video
                 * keys will be added on the processing side.
                 */
                const codecShortType = codec.mimeType.split('/')[1];

                codecShortType && ssrcStats.setCodec(codecShortType);
            }

        // Use track stats for resolution and framerate of the local video source.
        // RTCVideoHandlerStats - https://w3c.github.io/webrtc-stats/#vststats-dict*
        // RTCMediaHandlerStats - https://w3c.github.io/webrtc-stats/#mststats-dict*
        } else if (now.type === 'track' && now.kind === MediaType.VIDEO && !now.remoteSource) {
            const resolution = {
                height: now.frameHeight,
                width: now.frameWidth
            };
            const localVideoTracks = this.peerconnection.getLocalTracks(MediaType.VIDEO);

            if (!localVideoTracks?.length) {
                return;
            }

            const ssrc = this.peerconnection.getLocalSSRC(localVideoTracks[0]);

            if (!ssrc) {
                return;
            }
            let ssrcStats = this.ssrc2stats.get(ssrc);

            if (!ssrcStats) {
                ssrcStats = new SsrcStats();
                this.ssrc2stats.set(ssrc, ssrcStats);
            }
            if (resolution.height && resolution.width) {
                ssrcStats.setResolution(resolution);
            }

            // Calculate the frame rate. 'framesSent' is the total aggregate value for all the simulcast streams.
            // Therefore, it needs to be divided by the total number of active simulcast streams.
            let frameRate = now.framesPerSecond;

            if (!frameRate) {
                const before = this.previousStatsReport.get(now.id);

                if (before) {
                    const timeMs = now.timestamp - before.timestamp;

                    if (timeMs > 0 && now.framesSent) {
                        const numberOfFramesSinceBefore = now.framesSent - before.framesSent;

                        frameRate = (numberOfFramesSinceBefore / timeMs) * 1000;
                    }
                }

                if (!frameRate) {
                    return;
                }
            }

            // Get the number of simulcast streams currently enabled from TPC.
            const numberOfActiveStreams = this.peerconnection.getActiveSimulcastStreams();

            // Reset frame rate to 0 when video is suspended as a result of endpoint falling out of last-n.
            frameRate = numberOfActiveStreams ? Math.round(frameRate / numberOfActiveStreams) : 0;
            ssrcStats.setFramerate(frameRate);
        }
    });

    this.eventEmitter.emit(StatisticsEvents.BYTE_SENT_STATS, this.peerconnection, byteSentStats);
    this._processAndEmitReport();
};

/**
 * Stats processing logic.
 */
StatsCollector.prototype.processAudioLevelReport = function() {
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

