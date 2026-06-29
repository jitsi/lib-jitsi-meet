import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';

import TraceablePeerConnection from './TraceablePeerConnection';

describe('TraceablePeerConnection', () => {
    // These helpers encode the sender-side direction logic used to suspend/resume a sender. The behaviour is
    // load-bearing on Firefox: unlike Chromium/WebKit, Firefox does not stop outgoing media when only the
    // encoding's active flag is set to false, so the transceiver direction has to be used instead. Without this,
    // a 2-party call routed over P2P (which suspends the JVB connection) would have a Firefox sender keep
    // transmitting over the suspended JVB connection, and the remote peer would receive the source twice - once
    // over P2P and once over JVB.
    describe('getTransceiverDirection', () => {
        // Arguments: (hasTrack, isFirefox, mediaType, mediaTransferActive). The fix is audio-only: a Firefox AUDIO
        // sender is set inactive while audio transfer is suspended (FF ignores encoding.active for audio). Video
        // is never set inactive here - it keeps using encoding.active so simulcast/screenshare and the P2P video
        // path are untouched.
        it('suspends a Firefox audio sender whose audio transfer is inactive (the duplicate-audio bug)', () => {
            expect(TraceablePeerConnection.getTransceiverDirection(true, true, MediaType.AUDIO, false))
                .toBe(MediaDirection.INACTIVE);
        });

        it('sends from a Firefox audio sender when audio transfer is active', () => {
            expect(TraceablePeerConnection.getTransceiverDirection(true, true, MediaType.AUDIO, true))
                .toBe(MediaDirection.SENDRECV);
        });

        it('does NOT suspend a Firefox VIDEO sender even when video transfer is inactive '
            + '(video is left on encoding.active; avoids breaking P2P video/screenshare)', () => {
            expect(TraceablePeerConnection.getTransceiverDirection(true, true, MediaType.VIDEO, false))
                .toBe(MediaDirection.SENDRECV);
        });

        it('keeps a non-Firefox audio sender at sendrecv even when audio transfer is inactive '
            + '(it relies on encoding.active to stop media)', () => {
            expect(TraceablePeerConnection.getTransceiverDirection(true, false, MediaType.AUDIO, false))
                .toBe(MediaDirection.SENDRECV);
        });

        it('sends from a non-Firefox sender when media transfer is active', () => {
            expect(TraceablePeerConnection.getTransceiverDirection(true, false, MediaType.AUDIO, true))
                .toBe(MediaDirection.SENDRECV);
        });

        it('keeps the direction at sendrecv for Firefox when a track is removed '
            + '(preserves the ssrcs for FF, regardless of media type or transfer state)', () => {
            expect(TraceablePeerConnection.getTransceiverDirection(false, true, MediaType.AUDIO, false))
                .toBe(MediaDirection.SENDRECV);
            expect(TraceablePeerConnection.getTransceiverDirection(false, true, MediaType.VIDEO, false))
                .toBe(MediaDirection.SENDRECV);
        });

        it('sets the direction to recvonly for non-Firefox when a track is removed', () => {
            expect(TraceablePeerConnection.getTransceiverDirection(false, false, MediaType.VIDEO, true))
                .toBe(MediaDirection.RECVONLY);
        });
    });

    describe('getMediaTransferDirection', () => {
        // Arguments: (enable, hasTrack). Only applied to Firefox senders.
        it('suspends a sender that has a track', () => {
            expect(TraceablePeerConnection.getMediaTransferDirection(false, true))
                .toBe(MediaDirection.INACTIVE);
        });

        it('suspends a sender even when it has no track', () => {
            expect(TraceablePeerConnection.getMediaTransferDirection(false, false))
                .toBe(MediaDirection.INACTIVE);
        });

        it('resumes a sender that has a track', () => {
            expect(TraceablePeerConnection.getMediaTransferDirection(true, true))
                .toBe(MediaDirection.SENDRECV);
        });

        it('leaves the direction unchanged when resuming a sender with no track', () => {
            // undefined => the caller must not touch the direction; replaceTrack will set it when a track is added.
            expect(TraceablePeerConnection.getMediaTransferDirection(true, false))
                .toBeUndefined();
        });
    });
});
