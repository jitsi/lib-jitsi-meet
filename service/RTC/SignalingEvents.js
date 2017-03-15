/**
 * Event triggered when participant's muted status changes.
 * @param {string} endpointId the track owner's identifier (MUC nickname)
 * @param {MediaType} mediaType "audio" or "video"
 * @param {boolean} isMuted the new muted state
 */
export const PEER_MUTED_CHANGED = 'signaling.peerMuted';

/**
 * Event triggered when participant's video type changes.
 * @param {string} endpointId the video owner's ID (MUC nickname)
 * @param {VideoType} videoType the new value
 */
export const PEER_VIDEO_TYPE_CHANGED = 'signaling.peerVideoType';
