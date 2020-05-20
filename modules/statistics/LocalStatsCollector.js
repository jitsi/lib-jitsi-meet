/**
 * Provides statistics for the local stream.
 */

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

let context = null;

if (window.AudioContext) {
    context = new AudioContext();

    // XXX Not all browsers define a suspend method on AudioContext. As the
    // invocation is at the (ES6 module) global execution level, it breaks the
    // loading of the lib-jitsi-meet library in such browsers and, consequently,
    // the loading of the very Web app that uses the lib-jitsi-meet library. For
    // example, Google Chrome 40 on Android does not define the method but we
    // still want to be able to load the lib-jitsi-meet library there and
    // display a page which notifies the user that the Web app is not supported
    // there.
    context.suspend && context.suspend();
}

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
}

/**
 * Starts the collecting the statistics.
 */
LocalStatsCollector.prototype.start = function() {
    if (!LocalStatsCollector.isLocalStatsSupported()) {
        return;
    }
    context.resume();
    const analyser = context.createAnalyser();

    analyser.smoothingTimeConstant = WEBAUDIO_ANALYZER_SMOOTING_TIME;
    analyser.fftSize = WEBAUDIO_ANALYZER_FFT_SIZE;

    const source = context.createMediaStreamSource(this.stream);

    source.connect(analyser);

    this.intervalId = setInterval(
        () => {
            const array = new Uint8Array(analyser.frequencyBinCount);

            analyser.getByteTimeDomainData(array);
            const audioLevel = timeDomainDataToAudioLevel(array);

            if (audioLevel !== this.audioLevel) {
                this.audioLevel = animateLevel(audioLevel, this.audioLevel);
                this.callback(this.audioLevel);
            }
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
};

/**
 * Checks if the environment has the necessary conditions to support
 * collecting stats from local streams.
 *
 * @returns {boolean}
 */
LocalStatsCollector.isLocalStatsSupported = function() {
    return Boolean(context);
};
