/* global __filename */

import { createWorkerScript } from './Worker';
import { getLogger } from 'jitsi-meet-logger';

const logger = getLogger(__filename);

// Flag to set on senders / receivers to avoid setting up the encryption transform
// more than once.
const kJitsiE2EE = Symbol('kJitsiE2EE');

/**
 * Context encapsulating the cryptography bits required for E2EE.
 * This uses the WebRTC Insertable Streams API which is explained in
 *   https://github.com/alvestrand/webrtc-media-streams/blob/master/explainer.md
 * that provides access to the encoded frames and allows them to be transformed.
 *
 * The encoded frame format is explained below in the _encodeFunction method.
 * High level design goals were:
 * - do not require changes to existing SFUs and retain (VP8) metadata.
 * - allow the SFU to rewrite SSRCs, timestamp, pictureId.
 * - allow for the key to be rotated frequently.
 */
export default class E2EEcontext {

    /**
     * Build a new E2EE context instance, which will be used in a given conference.
     *
     * @param {string} options.salt - Salt to be used for key deviation.
     *      FIXME: We currently use the MUC room name for this which has the same lifetime
     *      as this context. While not (pseudo)random as recommended in
     *        https://developer.mozilla.org/en-US/docs/Web/API/Pbkdf2Params
     *      this is easily available and the same for all participants.
     *      We currently do not enforce a minimum length of 16 bytes either.
     */
    constructor(options) {
        this._options = options;

        // Initialize the E2EE worker.
        this._worker = new Worker(createWorkerScript(), {
            name: 'E2EE Worker'
        });
        this._worker.onerror = e => logger.onerror(e);

        // Initialize the salt and convert it once.
        const encoder = new TextEncoder();

        // Send initial options to worker.
        this._worker.postMessage({
            operation: 'initialize',
            salt: encoder.encode(options.salt)
        });
    }

    /**
     * Handles the given {@code RTCRtpReceiver} by creating a {@code TransformStream} which will inject
     * a frame decoder.
     *
     * @param {RTCRtpReceiver} receiver - The receiver which will get the decoding function injected.
     * @param {string} kind - The kind of track this receiver belongs to.
     * @param {string} participantId - The participant id that this receiver belongs to.
     */
    handleReceiver(receiver, kind, participantId) {
        if (receiver[kJitsiE2EE]) {
            return;
        }
        receiver[kJitsiE2EE] = true;

        let receiverStreams;

        if (receiver.createEncodedStreams) {
            receiverStreams = receiver.createEncodedStreams();
        } else {
            receiverStreams = kind === 'video' ? receiver.createEncodedVideoStreams()
                : receiver.createEncodedAudioStreams();
        }

        this._worker.postMessage({
            operation: 'decode',
            readableStream: receiverStreams.readableStream,
            writableStream: receiverStreams.writableStream,
            participantId
        }, [ receiverStreams.readableStream, receiverStreams.writableStream ]);
    }

    /**
     * Handles the given {@code RTCRtpSender} by creating a {@code TransformStream} which will inject
     * a frame encoder.
     *
     * @param {RTCRtpSender} sender - The sender which will get the encoding function injected.
     * @param {string} kind - The kind of track this sender belongs to.
     * @param {string} participantId - The participant id that this sender belongs to.
     */
    handleSender(sender, kind, participantId) {
        if (sender[kJitsiE2EE]) {
            return;
        }
        sender[kJitsiE2EE] = true;

        let senderStreams;

        if (sender.createEncodedStreams) {
            senderStreams = sender.createEncodedStreams();
        } else {
            senderStreams = kind === 'video' ? sender.createEncodedVideoStreams()
                : sender.createEncodedAudioStreams();
        }

        this._worker.postMessage({
            operation: 'encode',
            readableStream: senderStreams.readableStream,
            writableStream: senderStreams.writableStream,
            participantId
        }, [ senderStreams.readableStream, senderStreams.writableStream ]);
    }

    /**
     * Sets the key to be used for E2EE.
     *
     * @param {string} value - Value to be used as the new key. May be falsy to disable end-to-end encryption.
     */
    setKey(value) {
        let key;

        if (value) {
            const encoder = new TextEncoder();

            key = encoder.encode(value);
        } else {
            key = false;
        }

        this._worker.postMessage({
            operation: 'setKey',
            key
        });
    }
}
