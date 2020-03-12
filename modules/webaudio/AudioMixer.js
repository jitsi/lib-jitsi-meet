/* global
    __filename
*/

import { getLogger } from 'jitsi-meet-logger';
import { createAudioContext } from './WebAudioUtils';

const logger = getLogger(__filename);

/**
 * The AudioMixer, as the name implies, mixes a number MediaStreams containing audio tracks into a single MediaStream.
 */
export default class AudioMixer {

    /**
     * Create AudioMixer instance.
     */
    constructor() {
        this._started = false;
        this._streamsToMix = [];
    }

    /**
     * Adds the MediaStream from a JitsiLocalTrack to the list of streams to be mixed.
     *
     * @param {JitsiLocalTrack} jitsiLocalTrack - JitsiLocalTrack containing audio stream.
     */
    addJitsiLocalTrack(jitsiLocalTrack) {
        this.addMediaStream(jitsiLocalTrack.stream);
    }

    /**
     * Add audio MediaStream to be mixed, if the stream doesn't contain any audio tracks it will be ignored.
     *
     * @param {MediaStream} stream - MediaStream to be mixed.
     */
    addMediaStream(stream) {
        if (!stream.getAudioTracks()) {
            logger.warn('Added MediaStream doesn\'t contain audio tracks.');
        }

        this._streamsToMix.push(stream);
    }

    /**
     * At this point a WebAudio ChannelMergerNode is created and and the two associated MediaStreams are connected to
     * it; the resulting mixed MediaStream is returned.
     *
     * @returns {MediaStream} - MediaStream containing added streams mixed together, or null if no MediaStream
     * is added.
     */
    start() {

        // If the mixer was already started just return the existing mixed stream.
        if (this._started) {
            return this._mixedMSD.stream;
        }

        this._audioContext = createAudioContext();

        if (!this._streamsToMix.length) {
            logger.warn('No MediaStream\'s added to AudioMixer, nothing will happen.');

            return null;
        }

        this._started = true;

        // Create ChannelMergerNode and connect all MediaStreams to it.
        this._channelMerger = this._audioContext.createChannelMerger(this._streamsToMix.length);

        for (const stream of this._streamsToMix) {
            const streamMSS = this._audioContext.createMediaStreamSource(stream);

            streamMSS.connect(this._channelMerger);

        }

        this._mixedMSD = this._audioContext.createMediaStreamDestination();

        this._channelMerger.connect(this._mixedMSD);

        return this._mixedMSD.stream;
    }

    /**
     * Disconnect the ChannelMergerNode stopping the audio mix process.References to MediaStreams are also cleared.
     *
     * @returns {void}
     */
    reset() {
        this._started = false;
        this._streamsToMix = [];
        this._channelMerger.disconnect();
    }
}
