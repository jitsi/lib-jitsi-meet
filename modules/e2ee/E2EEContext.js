/* global __filename, TransformStream */

import { getLogger } from 'jitsi-meet-logger';

const logger = getLogger(__filename);

// We use a ringbuffer of keys so we can change them and still decode packets that were
// encrypted with an old key.
// In the future when we dont rely on a globally shared key we will actually use it. For
// now set the size to 1 which means there is only a single key. This causes some
// glitches when changing the key but its ok.
const keyRingSize = 1;

// We use a 96 bit IV for AES GCM. This is signalled in plain together with the
// packet. See https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
const ivLength = 12;

// We copy the first bytes of the VP8 payload unencrypted.
// For keyframes this is 10 bytes, for non-keyframes (delta) 3. See
//   https://tools.ietf.org/html/rfc6386#section-9.1
// This allows the bridge to continue detecting keyframes (only one byte needed in the JVB)
// and is also a bit easier for the VP8 decoder (i.e. it generates funny garbage pictures
// instead of being unable to decode).
// This is a bit for show and we might want to reduce to 1 unconditionally in the final version.
//
// For audio (where frame.type is not set) we do not encrypt the opus TOC byte:
//   https://tools.ietf.org/html/rfc6716#section-3.1
const unencryptedBytes = {
    key: 10,
    delta: 3,
    undefined: 1 // frame.type is not set on audio
};

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
 * High level design goals were:.
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

        // An array (ring) of keys that we use for sending and receiving.
        this._cryptoKeyRing = new Array(keyRingSize);

        // A pointer to the currently used key.
        this._currentKeyIndex = -1;

        // We keep track of how many frames we have sent per ssrc.
        // Starts with a random offset similar to the RTP sequence number.
        this._sendCounts = new Map();

        // Initialize the salt and convert it once.
        const encoder = new TextEncoder();

        this._salt = encoder.encode(options.salt);
    }

    /**
     * Handles the given {@code RTCRtpReceiver} by creating a {@code TransformStream} which will injecct
     * a frame decoder.
     *
     * @param {RTCRtpReceiver} receiver - The receiver which will get the decoding function injected.
     * @param {string} kind - The kind of track this receiver belongs to.
     */
    handleReceiver(receiver, kind) {
        if (receiver[kJitsiE2EE]) {
            return;
        }

        const receiverStreams
            = kind === 'video' ? receiver.createEncodedVideoStreams() : receiver.createEncodedAudioStreams();
        const transform = new TransformStream({
            transform: this._decodeFunction.bind(this)
        });

        receiverStreams.readableStream
            .pipeThrough(transform)
            .pipeTo(receiverStreams.writableStream);

        receiver[kJitsiE2EE] = true;
    }

    /**
     * Handles the given {@code RTCRtpSender} by creating a {@code TransformStream} which will injecct
     * a frame encoder.
     *
     * @param {RTCRtpSender} sender - The sender which will get the encoding funcction injected.
     * @param {string} kind - The kind of track this sender belongs to.
     */
    handleSender(sender, kind) {
        if (sender[kJitsiE2EE]) {
            return;
        }

        const senderStreams
            = kind === 'video' ? sender.createEncodedVideoStreams() : sender.createEncodedAudioStreams();
        const transform = new TransformStream({
            transform: this._encodeFunction.bind(this)
        });

        senderStreams.readableStream
            .pipeThrough(transform)
            .pipeTo(senderStreams.writableStream);

        sender[kJitsiE2EE] = true;
    }

    /**
     * Sets the key to be used for E2EE.
     *
     * @param {string} value - Value to be used as the new key. May be falsy to disable end-to-end encryption.
     */
    async setKey(value) {
        let key;

        if (value) {
            const encoder = new TextEncoder();

            key = await this._deriveKey(encoder.encode(value));
        } else {
            key = false;
        }
        this._currentKeyIndex++;
        this._cryptoKeyRing[this._currentKeyIndex % this._cryptoKeyRing.length] = key;
    }

    /**
     * Derives a AES-GCM key with 128 bits from the input using PBKDF2
     * The salt is configured in the constructor of this class.
     * @param {Uint8Array} keyBytes - Value to derive key from
     */
    async _deriveKey(keyBytes) {
        // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
        const material = await crypto.subtle.importKey('raw', keyBytes,
            'PBKDF2', false, [ 'deriveBits', 'deriveKey' ]);

        // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#PBKDF2
        return crypto.subtle.deriveKey({
            name: 'PBKDF2',
            salt: this._salt,
            iterations: 100000,
            hash: 'SHA-256'
        }, material, {
            name: 'AES-GCM',
            length: 128
        }, false, [ 'encrypt', 'decrypt' ]);
    }

    /**
     * Construct the IV used for AES-GCM and sent (in plain) with the packet similar to
     * https://tools.ietf.org/html/rfc7714#section-8.1
     * It concatenates
     * - the 32 bit synchronization source (SSRC) given on the encoded frame,
     * - the 32 bit rtp timestamp given on the encoded frame,
     * - a send counter that is specific to the SSRC. Starts at a random number.
     * The send counter is essentially the pictureId but we currently have to implement this ourselves.
     * There is no XOR with a salt. Note that this IV leaks the SSRC to the receiver but since this is
     * randomly generated and SFUs may not rewrite this is considered acceptable.
     * The SSRC is used to allow demultiplexing multiple streams with the same key, as described in
     *   https://tools.ietf.org/html/rfc3711#section-4.1.1
     * The RTP timestamp is 32 bits and advances by the codec clock rate (90khz for video, 48khz for
     * opus audio) every second. For video it rolls over roughly every 13 hours.
     * The send counter will advance at the frame rate (30fps for video, 50fps for 20ms opus audio)
     * every second. It will take a long time to roll over.
     *
     * See also https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
     */
    _makeIV(synchronizationSource, timestamp) {
        const iv = new ArrayBuffer(ivLength);
        const ivView = new DataView(iv);

        // having to keep our own send count (similar to a picture id) is not ideal.
        if (!this._sendCounts.has(synchronizationSource)) {
            // Initialize with a random offset, similar to the RTP sequence number.
            this._sendCounts.set(synchronizationSource, Math.floor(Math.random() * 0xFFFF));
        }
        const sendCount = this._sendCounts.get(synchronizationSource);

        ivView.setUint32(0, synchronizationSource);
        ivView.setUint32(4, timestamp);
        ivView.setUint32(8, sendCount % 0xFFFF);

        this._sendCounts.set(synchronizationSource, sendCount + 1);

        return iv;
    }

    /**
     * Function that will be injected in a stream and will encrypt the given encoded frames.
     *
     * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     *
     * The packet format is described below. One of the design goals was to not require
     * changes to the SFU which for video requires not encrypting the keyframe bit of VP8
     * as SFUs need to detect a keyframe (framemarking or the generic frame descriptor will
     * solve this eventually). This also "hides" that a client is using E2EE a bit.
     *
     * Note that this operates on the full frame, i.e. for VP8 the data described in
     *   https://tools.ietf.org/html/rfc6386#section-9.1
     *
     * The VP8 payload descriptor described in
     *   https://tools.ietf.org/html/rfc7741#section-4.2
     * is part of the RTP packet and not part of the frame and is not controllable by us.
     * This is fine as the SFU keeps having access to it for routing.
     *
     * The encrypted frame is formed as follows:
     * 1) Leave the first (10, 3, 1) bytes unencrypted, depending on the frame type and kind.
     * 2) Form the GCM IV for the frame as described above.
     * 3) Encrypt the rest of the frame using AES-GCM.
     * 4) Allocate space for the encrypted frame.
     * 5) Copy the unencrypted bytes to the start of the encrypted frame.
     * 6) Append the ciphertext to the encrypted frame.
     * 7) Append the IV.
     * 8) Append a single byte for the key identifier. TODO: we don't need all the bits.
     * 9) Enqueue the encrypted frame for sending.
     */
    _encodeFunction(encodedFrame, controller) {
        const keyIndex = this._currentKeyIndex % this._cryptoKeyRing.length;

        if (this._cryptoKeyRing[keyIndex]) {
            const iv = this._makeIV(encodedFrame.synchronizationSource, encodedFrame.timestamp);

            return crypto.subtle.encrypt({
                name: 'AES-GCM',
                iv,
                additionalData: new Uint8Array(encodedFrame.data, 0, unencryptedBytes[encodedFrame.type])
            }, this._cryptoKeyRing[keyIndex], new Uint8Array(encodedFrame.data, unencryptedBytes[encodedFrame.type]))
            .then(cipherText => {
                const newData = new ArrayBuffer(unencryptedBytes[encodedFrame.type] + cipherText.byteLength
                    + iv.byteLength + 1);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(
                    new Uint8Array(encodedFrame.data, 0, unencryptedBytes[encodedFrame.type])); // copy first bytes.
                newUint8.set(
                    new Uint8Array(cipherText), unencryptedBytes[encodedFrame.type]); // add ciphertext.
                newUint8.set(
                    new Uint8Array(iv), unencryptedBytes[encodedFrame.type] + cipherText.byteLength); // append IV.
                newUint8[unencryptedBytes[encodedFrame.type] + cipherText.byteLength + ivLength]
                    = keyIndex; // set key index.

                encodedFrame.data = newData;

                return controller.enqueue(encodedFrame);
            }, e => {
                logger.error(e);

                // We are not enqueuing the frame here on purpose.
            });
        }

        /* NOTE WELL:
         * This will send unencrypted data (only protected by DTLS transport encryption) when no key is configured.
         * This is ok for demo purposes but should not be done once this becomes more relied upon.
         */
        controller.enqueue(encodedFrame);
    }

    /**
     * Function that will be injected in a stream and will decrypt the given encoded frames.
     *
     * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     *
     * The decrypted frame is formed as follows:
     * 1) Extract the key index from the last byte of the encrypted frame.
     *    If there is no key associated with the key index, the frame is enqueued for decoding
     *    and these steps terminate.
     * 2) Determine the frame type in order to look up the number of unencrypted header bytes.
     * 2) Extract the 12-byte IV from its position near the end of the packet.
     *    Note: the IV is treated as opaque and not reconstructed from the input.
     * 3) Decrypt the encrypted frame content after the unencrypted bytes using AES-GCM.
     * 4) Allocate space for the decrypted frame.
     * 5) Copy the unencrypted bytes from the start of the encrypted frame.
     * 6) Append the plaintext to the decrypted frame.
     * 7) Enqueue the decrypted frame for decoding.
     */
    _decodeFunction(encodedFrame, controller) {
        const data = new Uint8Array(encodedFrame.data);
        const keyIndex = data[encodedFrame.data.byteLength - 1];

        if (this._cryptoKeyRing[keyIndex]) {
            // TODO: use encodedFrame.type again, see https://bugs.chromium.org/p/chromium/issues/detail?id=1068468
            const encodedFrameType = encodedFrame.type
                ? (data[0] & 0x1) === 0 ? 'key' : 'delta' // eslint-disable-line no-bitwise
                : undefined;
            const iv = new Uint8Array(encodedFrame.data, encodedFrame.data.byteLength - ivLength - 1, ivLength);
            const cipherTextStart = unencryptedBytes[encodedFrameType];
            const cipherTextLength = encodedFrame.data.byteLength - (unencryptedBytes[encodedFrameType] + ivLength + 1);

            return crypto.subtle.decrypt({
                name: 'AES-GCM',
                iv,
                additionalData: new Uint8Array(encodedFrame.data, 0, unencryptedBytes[encodedFrameType])
            }, this._cryptoKeyRing[keyIndex], new Uint8Array(encodedFrame.data, cipherTextStart, cipherTextLength))
            .then(plainText => {
                const newData = new ArrayBuffer(unencryptedBytes[encodedFrameType] + plainText.byteLength);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(new Uint8Array(encodedFrame.data, 0, unencryptedBytes[encodedFrameType]));
                newUint8.set(new Uint8Array(plainText), unencryptedBytes[encodedFrameType]);

                encodedFrame.data = newData;

                return controller.enqueue(encodedFrame);
            }, e => {
                logger.error(e);

                // Just feed the (potentially encrypted) frame in case of error.
                // Worst case it is garbage.
                controller.enqueue(encodedFrame);
            });
        }

        // TODO: this just passes through to the decoder. Is that ok? If we don't know the key yet
        // we might want to buffer a bit but it is still unclear how to do that (and for how long etc).
        controller.enqueue(encodedFrame);
    }
}
