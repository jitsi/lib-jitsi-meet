
/**
 * Prefix used by all performance metrics taken by this library.
 */
export const JITSI_METRIC_PREFIX = 'jitsi.';

/**
 * All measure names currently taken by this library.
 */
export const MEASURES = {
    ATTACH: `${JITSI_METRIC_PREFIX}xmpp.attach`,
    CONNECT: `${JITSI_METRIC_PREFIX}xmpp.connect`,
    EXTERNAL_CONNECT: `${JITSI_METRIC_PREFIX}xmpp.external_connect`,
    BRIDGE_CHANNEL_OPEN: `${JITSI_METRIC_PREFIX}rtc.bridge-channel.open`,
    MUC_JOIN: `${JITSI_METRIC_PREFIX}xmpp.muc.join`,
    OBTAIN_PERMISSIONS: `${JITSI_METRIC_PREFIX}gum.obtain-permissions`,
    TRANSPORT_REPLACE: `${JITSI_METRIC_PREFIX}jingle.transport-replace`,
    SRD_SLD_CYCLE: `${JITSI_METRIC_PREFIX}rtc.pc.oa-cycle`,
    AUDIO_MUTE: `${JITSI_METRIC_PREFIX}.rtc.audio.mute`,
    AUDIO_UNMUTE: `${JITSI_METRIC_PREFIX}.rtc.audio.unmute`,
    VIDEO_MUTE: `${JITSI_METRIC_PREFIX}.rtc.video.mute`,
    VIDEO_UNMUTE: `${JITSI_METRIC_PREFIX}.rtc.video.unmute`
};
