/* global __filename */

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
     * FIXME: We currently use the MUC room name for this which has the same lifetime
     * as this context. While not (pseudo)random as recommended in
     * https://developer.mozilla.org/en-US/docs/Web/API/Pbkdf2Params
     * this is easily available and the same for all participants.
     * We currently do not enforce a minimum length of 16 bytes either.
     */
    constructor(options) {
        this._options = options;

        // Determine the URL for the worker script. Relative URLs are relative to
        // the entry point, not the script that launches the worker.
        let baseUrl = '';
        const ljm = document.querySelector('script[src*="lib-jitsi-meet"]');

        if (ljm) {
            const idx = ljm.src.lastIndexOf('/');

            baseUrl = `${ljm.src.substring(0, idx)}/`;
        }

        // Initialize the E2EE worker. In order to avoid CORS issues, start the worker and have it
        // synchronously load the JS.
        const workerUrl = `${baseUrl}lib-jitsi-meet.e2ee-worker.js`;
        const workerBlob
            = new Blob([ `importScripts("${workerUrl}");` ], { type: 'application/javascript' });
        const blobUrl = window.URL.createObjectURL(workerBlob);

        this._worker = new Worker(blobUrl, { name: 'E2EE Worker' });
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
     * Cleans up all state associated with the given participant. This is needed when a
     * participant leaves the current conference.
     *
     * @param {string} participantId - The participant that just left.
     */
    cleanup(participantId) {
        this._worker.postMessage({
            operation: 'cleanup',
            participantId
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
            readableStream: receiverStreams.readable || receiverStreams.readableStream,
            writableStream: receiverStreams.writable || receiverStreams.writableStream,
            participantId
        }, [ receiverStreams.readable || receiverStreams.readableStream,
            receiverStreams.writable || receiverStreams.writableStream ]);
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
            readableStream: senderStreams.readable || senderStreams.readableStream,
            writableStream: senderStreams.writable || senderStreams.writableStream,
            participantId
        }, [ senderStreams.readable || senderStreams.readableStream,
            senderStreams.writable || senderStreams.writableStream ]);
    }

    /**
     * Set the E2EE key for the specified participant.
     *
     * @param {string} participantId - the ID of the participant who's key we are setting.
     * @param {Uint8Array | boolean} key - they key for the given participant.
     * @param {Number} keyIndex - the key index.
     */
    setKey(participantId, key, keyIndex) {
        this._worker.postMessage({
            operation: 'setKey',
            participantId,
            key,
            keyIndex
        });
    }
}
