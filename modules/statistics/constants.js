export const CALLSTATS_SCRIPT_URL = 'https://api.callstats.io/static/callstats-ws.min.js';

/**
 * The number of remote speakers for which the audio levels will be calculated using
 * RTCRtpReceiver#getSynchronizationSources. Limit the number of endpoints to save cpu on the client as this API call
 * is known to take longer to execute when there are many audio receivers.
 */
export const SPEAKERS_AUDIO_LEVELS = 5;
