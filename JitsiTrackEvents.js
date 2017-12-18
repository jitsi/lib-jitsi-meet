/**
 * The media track was removed to the conference.
 */
export const LOCAL_TRACK_STOPPED = 'track.stopped';

/**
 * Audio levels of a this track was changed.
 * The first argument is a number with audio level value in range [0, 1].
 * The second argument is a <tt>TraceablePeerConnection</tt> which is the peer
 * connection which measured the audio level (one audio track can be added
 * to multiple peer connection at the same time). This argument is optional for
 * local tracks for which we can measure audio level without the peer
 * connection (the value will be <tt>undefined</tt>).
 *
 * NOTE The second argument should be treated as library internal and can be
 * removed at any time.
 */
export const TRACK_AUDIO_LEVEL_CHANGED = 'track.audioLevelsChanged';

/**
 * The audio output of the track was changed.
 */
export const TRACK_AUDIO_OUTPUT_CHANGED = 'track.audioOutputChanged';

/**
 * A media track mute status was changed.
 */
export const TRACK_MUTE_CHANGED = 'track.trackMuteChanged';

/**
 * The video type("camera" or "desktop") of the track was changed.
 */
export const TRACK_VIDEOTYPE_CHANGED = 'track.videoTypeChanged';

/**
 * Indicates that the track is not receiving any data even though we expect it
 * to receive data (i.e. the stream is not stopped).
 */
export const NO_DATA_FROM_SOURCE = 'track.no_data_from_source';
