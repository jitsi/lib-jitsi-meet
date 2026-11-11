import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import { RTCEvents } from '../../service/RTC/RTCEvents';
import { VideoType } from '../../service/RTC/VideoType';
import RTCStats from '../RTCStats/RTCStats';
import browser from '../browser';
import FeatureFlags from '../flags/FeatureFlags';

import JitsiLocalTrack from './JitsiLocalTrack';
import RTCUtils from './RTCUtils';
import { TPCUtils } from './TPCUtils';
import TraceablePeerConnection from './TraceablePeerConnection';

describe('TraceablePeerConnection', () => {
    describe('setVideoCodecs', () => {
        let tpc: TraceablePeerConnection;
        let camera: jasmine.SpyObj<JitsiLocalTrack>;
        let desktop: jasmine.SpyObj<JitsiLocalTrack>;
        let configuredCodecs: Map<JitsiLocalTrack, CodecMimeType>;
        let configureEncodings: jasmine.Spy;
        let getLocalVideoTracks: jasmine.Spy;
        let sendStats: jasmine.Spy;
        let usesCodecSelectionAPI: jasmine.Spy;
        const compatibleCodecs = [ CodecMimeType.VP9, CodecMimeType.VP8 ];

        beforeEach(() => {
            tpc = Object.create(TraceablePeerConnection.prototype);
            tpc.codecSettings = { codecList: compatibleCodecs };
            camera = jasmine.createSpyObj<JitsiLocalTrack>('camera', [ 'getVideoType' ]);
            desktop = jasmine.createSpyObj<JitsiLocalTrack>('desktop', [ 'getVideoType' ]);
            camera.getVideoType.and.returnValue(VideoType.CAMERA);
            desktop.getVideoType.and.returnValue(VideoType.DESKTOP);
            configuredCodecs = new Map([
                [ camera, CodecMimeType.VP9 ],
                [ desktop, CodecMimeType.VP9 ]
            ]);
            tpc.tpcUtils = jasmine.createSpyObj<TPCUtils>('tpcUtils', [ 'getConfiguredVideoCodec' ]);
            getLocalVideoTracks = spyOn(tpc, 'getLocalVideoTracks').and.returnValue([ camera, desktop ]);
            usesCodecSelectionAPI = spyOn(tpc, 'usesCodecSelectionAPI').and.returnValue(true);
            tpc.tpcUtils.getConfiguredVideoCodec = track => configuredCodecs.get(track);
            configureEncodings = spyOn(tpc, 'configureVideoSenderEncodings').and.callFake(
                (track, codec) => {
                    configuredCodecs.set(track, codec ?? tpc.codecSettings.codecList[0]);

                    return Promise.resolve();
                });
            sendStats = spyOn(RTCStats, 'sendStatsEntry');
        });

        it('does not reconfigure a compatible desktop track to an unsupported preference', () => {
            expect(tpc.setVideoCodecs(compatibleCodecs, CodecMimeType.AV1)).toBeFalse();
            expect(configureEncodings).not.toHaveBeenCalled();
            expect(sendStats).not.toHaveBeenCalled();
        });

        it('keeps distinct camera and desktop codecs without reconfiguring on repeated calls', () => {
            const codecs = [ ...compatibleCodecs, CodecMimeType.AV1 ];

            expect(tpc.setVideoCodecs(codecs, CodecMimeType.AV1)).toBeTrue();
            expect(configureEncodings).toHaveBeenCalledOnceWith(desktop, CodecMimeType.AV1);
            expect(tpc.setVideoCodecs(codecs, CodecMimeType.AV1)).toBeFalse();
            expect(configureEncodings).toHaveBeenCalledTimes(1);
            expect(sendStats).toHaveBeenCalledTimes(1);
        });

        it('downgrades and upgrades the desktop codec without losing the configured preference', () => {
            configuredCodecs.set(desktop, CodecMimeType.AV1);

            expect(tpc.setVideoCodecs(compatibleCodecs, CodecMimeType.AV1)).toBeTrue();
            expect(configureEncodings).toHaveBeenCalledOnceWith(desktop, CodecMimeType.VP9);
            expect(sendStats.calls.mostRecent().args[2]).toEqual({
                camera: CodecMimeType.VP9,
                screenshare: CodecMimeType.VP9
            });
            expect(tpc.codecSettings.screenshareCodec).toBe(CodecMimeType.AV1);

            expect(tpc.setVideoCodecs([ ...compatibleCodecs, CodecMimeType.AV1 ], undefined)).toBeTrue();
            expect(configureEncodings).toHaveBeenCalledWith(desktop, CodecMimeType.AV1);
            expect(sendStats.calls.mostRecent().args[2]).toEqual({
                camera: CodecMimeType.VP9,
                screenshare: CodecMimeType.AV1
            });
        });

        it('applies screenshare preference changes independently of the camera codec', () => {
            const codecs = [ ...compatibleCodecs, CodecMimeType.AV1 ];

            configuredCodecs.set(desktop, CodecMimeType.AV1);
            expect(tpc.setVideoCodecs(codecs, CodecMimeType.VP8)).toBeTrue();
            expect(configureEncodings).toHaveBeenCalledOnceWith(desktop, CodecMimeType.VP8);
            expect(tpc.setVideoCodecs(codecs, CodecMimeType.VP8)).toBeFalse();
            expect(configureEncodings).toHaveBeenCalledTimes(1);
        });

        it('updates camera-only connections to the first compatible codec', () => {
            getLocalVideoTracks.and.returnValue([ camera ]);

            expect(tpc.setVideoCodecs([ CodecMimeType.VP8 ], CodecMimeType.AV1)).toBeTrue();
            expect(configuredCodecs.get(camera)).toBe(CodecMimeType.VP8);
            expect(tpc.setVideoCodecs([ CodecMimeType.VP8 ], CodecMimeType.AV1)).toBeFalse();
            expect(configureEncodings).toHaveBeenCalledTimes(1);
        });

        it('only stores preferences when the codec selection API is unavailable', () => {
            usesCodecSelectionAPI.and.returnValue(false);

            expect(tpc.setVideoCodecs([ CodecMimeType.VP8 ], CodecMimeType.AV1)).toBeFalse();
            expect(tpc.codecSettings).toEqual({
                codecList: [ CodecMimeType.VP8 ],
                screenshareCodec: CodecMimeType.AV1
            });
            expect(configureEncodings).not.toHaveBeenCalled();
            expect(sendStats).not.toHaveBeenCalled();
        });

        it('ignores empty codec lists and missing codec settings', () => {
            expect(tpc.setVideoCodecs([], CodecMimeType.AV1)).toBeFalse();
            expect(tpc.codecSettings.codecList).toEqual(compatibleCodecs);
            tpc.codecSettings = undefined;
            expect(tpc.setVideoCodecs(compatibleCodecs, CodecMimeType.AV1)).toBeFalse();
            expect(configureEncodings).not.toHaveBeenCalled();
            expect(sendStats).not.toHaveBeenCalled();
        });
    });

    // These helpers encode the sender-side direction logic used to suspend/resume a sender. The behaviour is
    // load-bearing on Firefox: unlike Chromium/WebKit, Firefox does not stop outgoing media when only the
    // encoding's active flag is set to false, so the transceiver direction has to be used instead. Without this,
    // a 2-party call routed over P2P (which suspends the JVB connection) would have a Firefox sender keep
    // transmitting over the suspended JVB connection, and the remote peer would receive the source twice - once
    // over P2P and once over JVB.
    describe('getTransceiverDirection', () => {
        // Arguments: (hasTrack, mediaType, mediaTransferActive). The two browser conditions are looked up inside
        // the helper via the browser singleton; each test stubs the specific combination it exercises.
        /**
         * Stubs the two browser checks the helper reads.
         *
         * @param {boolean} isFirefox - value returned from browser.isFirefox().
         * @param {boolean} audioActiveSupported - value returned from supportsRTCRtpEncodingParametersActiveForAudio.
         * @returns {void}
         */
        function stubBrowser(isFirefox: boolean, audioActiveSupported: boolean): void {
            spyOn(browser, 'isFirefox').and.returnValue(isFirefox);
            spyOn(browser, 'supportsRTCRtpEncodingParametersActiveForAudio').and.returnValue(audioActiveSupported);
        }

        it('suspends an audio sender that needs the audio-active workaround while audio transfer is inactive', () => {
            stubBrowser(true /* isFirefox */, false /* audioActiveSupported */);
            expect(TraceablePeerConnection.getTransceiverDirection(true, MediaType.AUDIO, false))
                .toBe(MediaDirection.INACTIVE);
        });

        it('sends from an audio sender when audio transfer is active', () => {
            stubBrowser(true, false);
            expect(TraceablePeerConnection.getTransceiverDirection(true, MediaType.AUDIO, true))
                .toBe(MediaDirection.SENDRECV);
        });

        it('does not suspend a video sender even when video transfer is inactive', () => {
            stubBrowser(true, false);
            expect(TraceablePeerConnection.getTransceiverDirection(true, MediaType.VIDEO, false))
                .toBe(MediaDirection.SENDRECV);
        });

        it('keeps an audio sender at sendrecv when the audio-active workaround is not needed', () => {
            stubBrowser(false /* isFirefox */, true /* audioActiveSupported */);
            expect(TraceablePeerConnection.getTransceiverDirection(true, MediaType.AUDIO, false))
                .toBe(MediaDirection.SENDRECV);
        });

        it('keeps a Firefox audio sender at sendrecv when the audio-active workaround is not needed', () => {
            stubBrowser(true /* isFirefox */, true /* audioActiveSupported (Firefox 154+) */);
            expect(TraceablePeerConnection.getTransceiverDirection(true, MediaType.AUDIO, false))
                .toBe(MediaDirection.SENDRECV);
        });

        it('sends from a non-Firefox sender when media transfer is active', () => {
            stubBrowser(false, true);
            expect(TraceablePeerConnection.getTransceiverDirection(true, MediaType.AUDIO, true))
                .toBe(MediaDirection.SENDRECV);
        });

        it('keeps the direction at sendrecv for Firefox when a track is removed', () => {
            stubBrowser(true /* isFirefox */, true /* audioActiveSupported */);
            expect(TraceablePeerConnection.getTransceiverDirection(false, MediaType.AUDIO, false))
                .toBe(MediaDirection.SENDRECV);
            expect(TraceablePeerConnection.getTransceiverDirection(false, MediaType.VIDEO, false))
                .toBe(MediaDirection.SENDRECV);
        });

        it('sets the direction to recvonly for non-Firefox when a track is removed', () => {
            stubBrowser(false /* isFirefox */, true /* audioActiveSupported */);
            expect(TraceablePeerConnection.getTransceiverDirection(false, MediaType.VIDEO, true))
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

        it('releases the SSRC of a removed track whose owner was cleared, without emitting', () => {
            const track = mockRemoteTrack('' /* no participantId */);
            const ctx = context(new Map([ [ SSRC, track ] ]));

            ctx._removeRemoteTrack = removeRemoteTrack;
            spyOn(RTCUtils, 'isUserStreamById').and.returnValue(true);

            (TraceablePeerConnection.prototype as any)._remoteTrackRemoved.call(
                ctx, { id: 'stream-1' }, { id: 'track-1' });

            expect(track.dispose).toHaveBeenCalled();
            expect(ctx.remoteTracksBySsrc.has(SSRC)).toBe(false);
            expect(ctx.eventEmitter.emit).not.toHaveBeenCalled();
        });
    });

    describe('replaceTrack', () => {
        const replaceTrack = TraceablePeerConnection.prototype.replaceTrack;

        function transceiver(mid: string, senderTrack: object): any {
            return {
                mid,
                receiver: { track: { kind: MediaType.AUDIO } },
                sender: {
                    replaceTrack: jasmine.createSpy('replaceTrack').and.returnValue(Promise.resolve()),
                    track: senderTrack
                }
            };
        }

        function localTrack(rtcId: number, track: object): any {
            return {
                getSourceName: () => `endpoint-a${rtcId}`,
                getTrack: () => track,
                getType: () => MediaType.AUDIO,
                getVideoType: () => undefined,
                isMuted: () => false,
                rtcId,
                setSsrc: jasmine.createSpy('setSsrc')
            };
        }

        function context(transceivers: object[], mids: Map<number, string>, tracks: any[] = []): any {
            const localTracks = new Map(tracks.map(t => [ t.rtcId, t ]));

            return {
                _extractPrimarySSRC: (TraceablePeerConnection.prototype as any)._extractPrimarySSRC,
                _midsWithSentTrack: new Set(),
                _sendRtcStatsEvent: jasmine.createSpy('_sendRtcStatsEvent'),
                audioTransferActive: true,
                getLocalTracks: () => Array.from(localTracks.values()),
                isP2P: false,
                localSSRCs: new Map(),
                localTrackTransceiverMids: mids,
                localTracks,
                peerconnection: { getTransceivers: () => transceivers }
            };
        }

        it('replaces the track on the sender holding the old track', async () => {
            const micTrack = {};
            const first = transceiver('0', {});
            const second = transceiver('1', micTrack);
            const newTrack = localTrack(2, {});

            // The sender match wins over a recorded mid that points elsewhere.
            await replaceTrack.call(
                context([ first, second ], new Map([ [ 1, '0' ] ])), localTrack(1, micTrack), newTrack, true);

            expect(second.sender.replaceTrack).toHaveBeenCalledWith(newTrack.getTrack());
            expect(first.sender.replaceTrack).not.toHaveBeenCalled();
        });

        it('uses the transceiver of the old track when the sender holds a track the old track no longer exposes', async () => {
            // E.g. a track whose stream effect was stopped by stopStream() while the sender still has the
            // effect's output track.
            const first = transceiver('0', {});
            const second = transceiver('1', { label: 'effect output' });
            const newTrack = localTrack(2, {});

            await replaceTrack.call(
                context([ first, second ], new Map([ [ 1, '1' ] ])), localTrack(1, { label: 'mic' }), newTrack, true);

            expect(second.sender.replaceTrack).toHaveBeenCalledWith(newTrack.getTrack());
            expect(first.sender.replaceTrack).not.toHaveBeenCalled();
        });

        it('moves the mid and ssrc of the old track to the new one when replacing through its recorded mid', async () => {
            const second = transceiver('1', { label: 'effect output' });
            const oldTrack = localTrack(1, { label: 'mic' });
            const newTrack = localTrack(2, {});
            const ctx = context([ transceiver('0', {}), second ], new Map([ [ 1, '1' ] ]), [ oldTrack ]);
            const ssrcInfo = { groups: [], msid: 'msid', ssrcs: [ 1111 ] };

            ctx.localSSRCs.set(1, ssrcInfo);

            await replaceTrack.call(ctx, oldTrack, newTrack, false);

            expect(second.sender.replaceTrack).toHaveBeenCalledWith(newTrack.getTrack());
            expect(Array.from(ctx.localTrackTransceiverMids)).toEqual([ [ 2, '1' ] ]);
            expect(Array.from(ctx.localTracks.keys())).toEqual([ 2 ]);
            expect(ctx.localSSRCs.get(2)).toBe(ssrcInfo);
            expect(ctx.localSSRCs.has(1)).toBeFalse();
            expect(newTrack.setSsrc).toHaveBeenCalledWith(1111);
        });

        it('rejects when the recorded mid of the old track is sending another local track', async () => {
            const otherMicTrack = { label: 'other mic' };
            const first = transceiver('0', otherMicTrack);
            const oldTrack = localTrack(1, { label: 'mic' });

            await expectAsync(replaceTrack.call(
                context([ first ], new Map([ [ 1, '0' ] ]), [ oldTrack, localTrack(3, otherMicTrack) ]),
                oldTrack, localTrack(2, {}), true))
                .toBeRejectedWithError(/no transceiver/);
            expect(first.sender.replaceTrack).not.toHaveBeenCalled();
        });

        it('rejects when the old track is on no sender and has no known transceiver', async () => {
            const first = transceiver('0', {});

            await expectAsync(replaceTrack.call(
                context([ first ], new Map()), localTrack(1, {}), localTrack(2, {}), true))
                .toBeRejectedWithError(/no transceiver/);
            expect(first.sender.replaceTrack).not.toHaveBeenCalled();
        });
    });
});
