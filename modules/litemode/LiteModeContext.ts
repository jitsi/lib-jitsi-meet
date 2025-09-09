import { getLogger } from '@jitsi/logger';

import JitsiConference from '../../JitsiConference';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import JitsiRemoteTrack from '../RTC/JitsiRemoteTrack';
import TraceablePeerConnection from '../RTC/TraceablePeerConnection';
import FeatureFlags from '../flags/FeatureFlags';

// Flag to set on receivers to avoid setting up the lite mode
// more than once.
const kJitsiLiteMode = Symbol('kJitsiLiteMode');

const logger = getLogger('testing:LiteModeContext');

/**
 * This module implements a discard-all insertable stream.  Use to reduce decoder CPU load for testing.
 */
export class LiteModeContext {
    private enabled: boolean;

    /**
     * A constructor.
     * @param {JitsiConference} conference - The conference instance for which lite mode is to be enabled.
     */
    constructor(conference: JitsiConference) {
        this.enabled = FeatureFlags.isRunInLiteModeEnabled();
        if (!this.enabled) {
            return;
        }

        conference.rtc.on(
            RTCEvents.REMOTE_TRACK_ADDED,
            (track: JitsiRemoteTrack, tpc: TraceablePeerConnection) => this._setupLiteModeForTrack(tpc, track));
    }

    /**
     * Setup Lite Mode for a track.
     *
     * @private
     */
    private _setupLiteModeForTrack(tpc: TraceablePeerConnection, track: JitsiRemoteTrack): void {
        if (!this.enabled) {
            return;
        }

        const receiver = tpc.findReceiverForTrack(track.getTrack());

        if (!receiver) {
            logger.warn(`Could not set up lite mode for ${track}: receiver not found in: ${tpc}`);

            return;
        }

        if (receiver[kJitsiLiteMode]) {
            return;
        }
        receiver[kJitsiLiteMode] = true;

        const receiverStreams = receiver.createEncodedStreams();

        const transformStream = new TransformStream({
            transform: () => {
                // Don't call controller.enqueue(encodedFrame), and so drop everything
            }
        });

        receiverStreams.readable.pipeThrough(transformStream).pipeTo(receiverStreams.writable);
    }
}
