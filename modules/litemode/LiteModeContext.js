/* global TransformStream */
import { getLogger } from '@jitsi/logger';

import RTCEvents from '../../service/RTC/RTCEvents';
import FeatureFlags from '../flags/FeatureFlags';

// Flag to set on receivers to avoid setting up the lite mode
// more than once.
const kJitsiLiteMode = Symbol('kJitsiLiteMode');

const logger = getLogger(__filename);

/**
 * This module implements a discard-all insertable stream.  Use to reduce decoder CPU load for testing.
 */
export class LiteModeContext {
    /**
     * A constructor.
     * @param {JitsiConference} conference - The conference instance for which lite mode is to be enabled.
     */
    constructor(conference) {
        this.enabled = FeatureFlags.isRunInLiteModeEnabled();
        if (!this.enabled) {
            return;
        }

        conference.rtc.on(
            RTCEvents.REMOTE_TRACK_ADDED,
            (track, tpc) => this._setupLiteModeForTrack(tpc, track));
    }

    /**
     * Setup Lite Mode for a track.
     *
     * @private
     */
    _setupLiteModeForTrack(tpc, track) {
        if (!this.enabled) {
            return;
        }

        const receiver = tpc.findReceiverForTrack(track.track);

        if (!receiver) {
            logger.warn(`Could set up lite mode for ${track}: receiver not found in: ${tpc}`);

            return;
        }

        if (receiver[kJitsiLiteMode]) {
            return;
        }
        receiver[kJitsiLiteMode] = true;

        const receiverStreams = receiver.createEncodedStreams();

        this._setupLiteMode(receiverStreams.readable, receiverStreams.writable);
    }

    /**
     * Setup lite mode for receiver streams
     */
    _setupLiteMode(readableStream, writableStream) {
        const transformStream = new TransformStream({
            transform: this.dropAll
        });

        readableStream.pipeThrough(transformStream).pipeTo(writableStream);
    }

    /**
     * Drop all encoded media received
     * Function that will be injected in a stream and will encrypt the given encoded frames.
     */
    dropAll() {
        // Don't call controller.enqueue(encodedFrame), and so drop everything
    }
}
