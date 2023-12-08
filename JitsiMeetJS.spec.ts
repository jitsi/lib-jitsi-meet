import JitsiMeetJS from './JitsiMeetJS';
import { VideoType } from './service/RTC/VideoType';
import { MediaType } from './service/RTC/MediaType';
import { JitsiTrackErrors } from './JitsiTrackErrors';

describe('JitsiMeetJS', () => {
    describe('createLocalTracksFromMediaStreams', () => {
        it('creates a local track from a media stream', () => {
            const canvas = document.createElement('canvas');

            const canvasStream = canvas.captureStream(5);
            const trackInfo = {
                stream: canvasStream,
                sourceType: 'canvas',
                mediaType: MediaType.VIDEO,
                videoType: VideoType.DESKTOP
            };
            const newTracks = JitsiMeetJS.createLocalTracksFromMediaStreams([ trackInfo ]);

            expect(newTracks).toBeDefined();
            expect(newTracks.length).toBe(1);
        });

        it('throws an error if track is not the correct media type', () => {
            const canvas = document.createElement('canvas');

            const canvasStream = canvas.captureStream(5);
            const trackInfo = {
                stream: canvasStream,
                sourceType: 'canvas',
                mediaType: MediaType.AUDIO,
                videoType: VideoType.DESKTOP
            };

            expect(() => JitsiMeetJS.createLocalTracksFromMediaStreams([ trackInfo ]))
                .toThrowError(JitsiTrackErrors.TRACK_NO_STREAM_TRACKS_FOUND);
        });
    });
});
