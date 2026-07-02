import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import FeatureFlags from '../flags/FeatureFlags';

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

    describe('_removeRemoteTrack under SSRC rewriting', () => {
        // The remote audio wedge recovery recycles a source via source-remove then source-add reusing the SAME
        // rewritten SSRC. Remote tracks are keyed by SSRC in remoteTracksBySsrc and _createRemoteTrack drops a create
        // whose SSRC is already present. So _removeRemoteTrack must clear that SSRC entry, otherwise the re-add is
        // discarded as a duplicate and the participant is left with no audio track.
        const SSRC = 12345;

        /**
         * Builds a minimal remote track stub.
         *
         * @param {string} participantId - The owner endpoint id.
         * @returns {object}
         */
        function mockRemoteTrack(participantId = 'endpoint-1'): any {
            return {
                dispose: jasmine.createSpy('dispose'),
                getParticipantId: () => participantId,
                getSsrc: () => SSRC,
                getStreamId: () => 'stream-1',
                getTrackId: () => 'track-1',
                getType: () => MediaType.AUDIO
            };
        }

        /**
         * Builds the minimal `this` context {@link TraceablePeerConnection._removeRemoteTrack} touches.
         *
         * @param {Map} remoteTracksBySsrc - The SSRC->track map.
         * @returns {object}
         */
        function context(remoteTracksBySsrc: Map<number, any>): any {
            return {
                eventEmitter: { emit: jasmine.createSpy('emit') },
                isP2P: false,
                remoteTracks: new Map(),
                remoteTracksBySsrc
            };
        }

        const removeRemoteTrack = (TraceablePeerConnection.prototype as any)._removeRemoteTrack;

        beforeEach(() => {
            spyOn(FeatureFlags, 'isSsrcRewritingSupported').and.returnValue(true);
        });

        it('clears the SSRC entry so a re-add for the same SSRC is not deduped, and emits REMOTE_TRACK_REMOVED', () => {
            const track = mockRemoteTrack();
            const ctx = context(new Map([ [ SSRC, track ] ]));

            removeRemoteTrack.call(ctx, track);

            expect(ctx.remoteTracksBySsrc.has(SSRC)).toBe(false);
            expect(track.dispose).toHaveBeenCalled();
            expect(ctx.eventEmitter.emit).toHaveBeenCalledWith(RTCEvents.REMOTE_TRACK_REMOVED, track);
        });

        it('does not clear the SSRC entry when it now maps to a different (remapped) current track', () => {
            const oldTrack = mockRemoteTrack();
            const currentTrack = mockRemoteTrack();
            const ctx = context(new Map([ [ SSRC, currentTrack ] ]));

            removeRemoteTrack.call(ctx, oldTrack);

            // The slot was remapped to currentTrack; removing the stale oldTrack must not evict currentTrack's entry.
            expect(ctx.remoteTracksBySsrc.get(SSRC)).toBe(currentTrack);
            expect(ctx.eventEmitter.emit).toHaveBeenCalledWith(RTCEvents.REMOTE_TRACK_REMOVED, oldTrack);
        });

        it('is a no-op for a track with no owner (does not emit or clear)', () => {
            const track = mockRemoteTrack('' /* no participantId */);
            const ctx = context(new Map([ [ SSRC, track ] ]));

            removeRemoteTrack.call(ctx, track);

            expect(ctx.remoteTracksBySsrc.has(SSRC)).toBe(true);
            expect(ctx.eventEmitter.emit).not.toHaveBeenCalled();
        });
    });
});
