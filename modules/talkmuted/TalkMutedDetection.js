var JitsiTrackEvents = require('../../JitsiTrackEvents');

/**
 * Creates TalkMutedDetection
 * @param callback the callback to call when detected local user is talking
 * while its microphone is muted.
 * @constructor
 */
function TalkMutedDetection(callback) {
    this.callback = callback;

    // we track firing the event, in order to avoid sending too many events
    this.eventFired = false;
}

/**
 * Receives audio level events for all send/receive streams.
 * @param ssrc the ssrc of the stream
 * @param level the current audio level
 * @param isLocal whether this is local or remote stream (sent or received)
 */
TalkMutedDetection.prototype.audioLevelListener =
    function (ssrc, level, isLocal) {
        // we are interested only in local audio stream
        // and if event is not already sent
        if (!isLocal || !this.audioTrack || this.eventFired)
            return;

        if (this.audioTrack.isMuted() && level > 0.02) {
            this.eventFired = true;
            this.callback();
        }
    };

/**
 * Mute changed for a track.
 * @param track the track which mute state has changed.
 */
TalkMutedDetection.prototype.muteChanged = function (track) {
    if (!track.isLocal() || !track.isAudioTrack())
        return;

    if (track.isMuted())
        this.eventFired = false;
};

/**
 * Adds local tracks. We are interested only in the audio one.
 * @param track
 */
TalkMutedDetection.prototype.addTrack = function(track){
    if (!track.isAudioTrack())
        return;

    this.audioTrack = track;
};

module.exports = TalkMutedDetection;
