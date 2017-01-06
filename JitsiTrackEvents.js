/**
 * The media track was removed to the conference.
 */
export const LOCAL_TRACK_STOPPED = "track.stopped";
/**
 * Audio levels of a this track was changed.
 */
export const TRACK_AUDIO_LEVEL_CHANGED = "track.audioLevelsChanged";

/**
 * The audio output of the track was changed.
 */
export const TRACK_AUDIO_OUTPUT_CHANGED = "track.audioOutputChanged";
/**
 * A media track mute status was changed.
 */
export const TRACK_MUTE_CHANGED = "track.trackMuteChanged";
/**
 * The video type("camera" or "desktop") of the track was changed.
 */
export const TRACK_VIDEOTYPE_CHANGED = "track.videoTypeChanged";
/**
 * Indicates that the track is no receiving any data without reason(the
 * stream was stopped, etc)
 */
export const NO_DATA_FROM_SOURCE = "track.no_data_from_source";
