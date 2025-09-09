import { getLogger } from '@jitsi/logger';

import { createAudioContext } from './WebAudioUtils';

const logger = getLogger('webaudio:AudioMixer');

/**
 * The AudioMixer, as the name implies, mixes a number of MediaStreams containing audio tracks into a single
 * MediaStream.
 */
export default class AudioMixer {
    private _started: boolean;
    private _streamsToMix: MediaStream[];
    private _streamMSSArray: MediaStreamAudioSourceNode[];
    private _audioContext?: AudioContext;
    private _mixedMSD?: MediaStreamAudioDestinationNode;

    /**
     * Create AudioMixer instance.
     */
    constructor() {
        this._started = false;
        this._streamsToMix = [];
        this._streamMSSArray = [];
    }

    /**
     * Add audio MediaStream to be mixed, if the stream doesn't contain any audio tracks it will be ignored.
     *
     * @param {MediaStream} stream - MediaStream to be mixed.
     */
    addMediaStream(stream: MediaStream): void {
        if (!stream.getAudioTracks() || stream.getAudioTracks().length === 0) {
            logger.warn('Added MediaStream doesn\'t contain audio tracks.');
        }

        this._streamsToMix.push(stream);
    }

    /**
     * At this point a WebAudio ChannelMergerNode is created and and the two associated MediaStreams are connected to
     * it; the resulting mixed MediaStream is returned.
     *
     * @returns {Nullable<MediaStream>} - MediaStream containing added streams mixed together, or null if no MediaStream
     * is added.
     */
    start(): Nullable<MediaStream> {
        // If the mixer was already started just return the existing mixed stream.
        if (this._started && this._mixedMSD) {
            return this._mixedMSD.stream;
        }

        this._audioContext = createAudioContext();

        if (!this._streamsToMix.length) {
            logger.warn('No MediaStream\'s added to AudioMixer, nothing will happen.');

            return null;
        }

        this._started = true;

        this._mixedMSD = this._audioContext!.createMediaStreamDestination();

        for (const stream of this._streamsToMix) {
            const streamMSS = this._audioContext!.createMediaStreamSource(stream);

            streamMSS.connect(this._mixedMSD);

            // Maintain a list of MediaStreamAudioSourceNode so we can disconnect them on reset.
            this._streamMSSArray.push(streamMSS);
        }

        return this._mixedMSD.stream;
    }

    /**
     * Disconnect MediaStreamAudioSourceNode and clear references.
     *
     * @returns {void}
     */
    reset(): void {
        this._started = false;
        this._streamsToMix = [];

        // Clean up created MediaStreamAudioSourceNode.
        for (const streamMSS of this._streamMSSArray) {
            streamMSS.disconnect();
        }

        this._streamMSSArray = [];

        if (this._audioContext) {
            this._audioContext = undefined;
        }
        this._mixedMSD = undefined;
    }
}
