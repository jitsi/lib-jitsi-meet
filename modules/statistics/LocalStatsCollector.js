/**
 * Provides statistics for the local stream.
 */

const logger = require('@jitsi/logger').getLogger(__filename);

/**
 * Size of the webaudio analyzer buffer.
 * @type {number}
 */
const WEBAUDIO_ANALYZER_FFT_SIZE = 2048;

/**
 * Value of the webaudio analyzer smoothing time parameter.
 * @type {number}
 */
const WEBAUDIO_ANALYZER_SMOOTING_TIME = 0.8;

window.AudioContext = window.AudioContext || window.webkitAudioContext;

/**
 * The audio context.
 * @type {AudioContext}
 */
let context = null;


/**
 * Converts time domain data array to audio level.
 * @param samples the time domain data array.
 * @returns {number} the audio level
 */
function timeDomainDataToAudioLevel(samples) {

    let maxVolume = 0;

    const length = samples.length;

    for (let i = 0; i < length; i++) {
        if (maxVolume < samples[i]) {
            maxVolume = samples[i];
        }
    }

    return parseFloat(((maxVolume - 127) / 128).toFixed(3));
}

/**
 * Animates audio level change
 * @param newLevel the new audio level
 * @param lastLevel the last audio level
 * @returns {Number} the audio level to be set
 */
function animateLevel(newLevel, lastLevel) {
    let value = 0;
    const diff = lastLevel - newLevel;

    if (diff > 0.2) {
        value = lastLevel - 0.2;
    } else if (diff < -0.4) {
        value = lastLevel + 0.4;
    } else {
        value = newLevel;
    }

    return parseFloat(value.toFixed(3));
}


/**
 * <tt>LocalStatsCollector</tt> calculates statistics for the local stream.
 *
 * @param stream the local stream
 * @param interval stats refresh interval given in ms.
 * @param callback function that receives the audio levels.
 * @constructor
 */
export default function LocalStatsCollector(stream, interval, callback) {
    this.stream = stream;
    this.intervalId = null;
    this.intervalMilis = interval;
    this.audioLevel = 0;
    this.callback = callback;
    this.source = null;
    this.analyser = null;
}

/**
 * Starts the collecting the statistics.
 */
LocalStatsCollector.prototype.start = function() {
    if (!LocalStatsCollector.isLocalStatsSupported()) {
        return;
    }

    context.resume();
    this.analyser = context.createAnalyser();

    this.analyser.smoothingTimeConstant = WEBAUDIO_ANALYZER_SMOOTING_TIME;
    this.analyser.fftSize = WEBAUDIO_ANALYZER_FFT_SIZE;

    this.source = context.createMediaStreamSource(this.stream);

    this.source.connect(this.analyser);

    this.intervalId = setInterval(
        () => {
            const array = new Uint8Array(this.analyser.frequencyBinCount);

            this.analyser.getByteTimeDomainData(array);
            const audioLevel = timeDomainDataToAudioLevel(array);

            // Set the audio levels always as NoAudioSignalDetection now
            // uses audio levels from LocalStatsCollector and waits for
            // atleast 4 secs for a no audio signal before displaying the
            // notification on the UI.
            this.audioLevel = animateLevel(audioLevel, this.audioLevel);
            this.callback(this.audioLevel);
        },
        this.intervalMilis
    );
};

/**
 * Stops collecting the statistics.
 */
LocalStatsCollector.prototype.stop = function() {
    if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
    }

    this.analyser?.disconnect();
    this.analyser = null;
    this.source?.disconnect();
    this.source = null;
};

/**
 * Checks if the environment has the necessary conditions to support
 * collecting stats from local streams.
 *
 * @returns {boolean}
 */
LocalStatsCollector.isLocalStatsSupported = function() {
    return Boolean(window.AudioContext);
};

/**
 * Disconnects the audio context.
 */
LocalStatsCollector.disconnectAudioContext = async function() {
    if (context) {
        logger.info('Disconnecting audio context');
        await context.close();
        context = null;
    }
};

/**
 * Connects the audio context.
 */
LocalStatsCollector.connectAudioContext = function() {
    if (!LocalStatsCollector.isLocalStatsSupported()) {
        return;
    }

    logger.info('Connecting audio context');
    context = new AudioContext();

    context.suspend();
};

/**
 * Initialize the audio context on startup.
 */
LocalStatsCollector.connectAudioContext();
