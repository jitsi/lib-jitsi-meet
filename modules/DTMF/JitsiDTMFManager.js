const logger = require('jitsi-meet-logger').getLogger(__filename);

/**
 *
 * @param localAudio
 * @param peerConnection
 */
function JitsiDTMFManager(localAudio, peerConnection) {
    const audioTrack = localAudio.getTrack();

    if (!audioTrack) {
        throw new Error('Failed to initialize DTMFSender: no audio track.');
    }
    this.dtmfSender
        = peerConnection.peerconnection.createDTMFSender(audioTrack);
    logger.debug('Initialized DTMFSender');
}

JitsiDTMFManager.prototype.sendTones = function(tones, duration, pause) {
    this.dtmfSender.insertDTMF(tones, duration || 200, pause || 200);
};

module.exports = JitsiDTMFManager;

