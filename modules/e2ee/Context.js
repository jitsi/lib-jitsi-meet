/* eslint-disable no-bitwise */
/* global BigInt */

import { deriveKeys, importKey, ratchet } from './crypto-utils';

// We use a ringbuffer of keys so we can change them and still decode packets that were
// encrypted with an old key. We use a size of 16 which corresponds to the four bits
// in the frame trailer.
const KEYRING_SIZE = 16;

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
const UNENCRYPTED_BYTES = {
    key: 10,
    delta: 3,
    undefined: 1 // frame.type is not set on audio
};
const ENCRYPTION_ALGORITHM = 'AES-GCM';

/* We use a 96 bit IV for AES GCM. This is signalled in plain together with the
 packet. See https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams */
const IV_LENGTH = 12;

const RATCHET_WINDOW_SIZE = 8;

/**
 * Per-participant context holding the cryptographic keys and
 * encode/decode functions
 */
export class Context {
    /**
     * @param {string} id - local muc resourcepart
     */
    constructor(id) {
        // An array (ring) of keys that we use for sending and receiving.
        this._cryptoKeyRing = new Array(KEYRING_SIZE);

        // A pointer to the currently used key.
        this._currentKeyIndex = -1;

        this._sendCounts = new Map();

        this._id = id;
    }

    /**
     * Derives the different subkeys and starts using them for encryption or
     * decryption.
     * @param {Uint8Array|false} key bytes. Pass false to disable.
     * @param {Number} keyIndex
     */
    async setKey(keyBytes, keyIndex) {
        let newKey;

        if (keyBytes) {
            const material = await importKey(keyBytes);

            newKey = await deriveKeys(material);
        } else {
            newKey = false;
        }
        this._currentKeyIndex = keyIndex % this._cryptoKeyRing.length;
        this._setKeys(newKey);
    }

    /**
     * Sets a set of keys and resets the sendCount.
     * decryption.
     * @param {Object} keys set of keys.
     * @param {Number} keyIndex optional
     * @private
     */
    _setKeys(keys, keyIndex = -1) {
        if (keyIndex >= 0) {
            this._cryptoKeyRing[keyIndex] = keys;
        } else {
            this._cryptoKeyRing[this._currentKeyIndex] = keys;
        }
        this._sendCount = BigInt(0); // eslint-disable-line new-cap
    }

    /**
     * Function that will be injected in a stream and will encrypt the given encoded frames.
     *
     * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     *
     * The VP8 payload descriptor described in
     * https://tools.ietf.org/html/rfc7741#section-4.2
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
     * 8) Append a single byte for the key identifier.
     * 9) Enqueue the encrypted frame for sending.
     */
    encodeFunction(encodedFrame, controller) {
        const keyIndex = this._currentKeyIndex;

        if (this._cryptoKeyRing[keyIndex]) {
            const iv = this._makeIV(encodedFrame.getMetadata().synchronizationSource, encodedFrame.timestamp);

            // Construct frame trailer. Similar to the frame header described in
            // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.2
            // but we put it at the end.
            //                                             
            // ---------+---------------------------------+---------------------------+-------
            // payload  |    GCM... (length=LEN)          |IV...(length = IV_LENGTH)  |KID   |
            // ---------+---------------------------------+---------------------------+-------

            return crypto.subtle.encrypt({
                name: ENCRYPTION_ALGORITHM,
                iv,
                additionalData: new Uint8Array(encodedFrame.data, 0, UNENCRYPTED_BYTES[encodedFrame.type])
            }, this._cryptoKeyRing[keyIndex].encryptionKey, new Uint8Array(encodedFrame.data,
                UNENCRYPTED_BYTES[encodedFrame.type]))
            .then(cipherText => {
                const newData = new ArrayBuffer(UNENCRYPTED_BYTES[encodedFrame.type] + cipherText.byteLength
                    + iv.byteLength + 1);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(
                    new Uint8Array(encodedFrame.data, 0, UNENCRYPTED_BYTES[encodedFrame.type])); // copy first bytes.
                newUint8.set(
                    new Uint8Array(cipherText), UNENCRYPTED_BYTES[encodedFrame.type]); // add ciphertext.
                newUint8.set(
                    new Uint8Array(iv), UNENCRYPTED_BYTES[encodedFrame.type] + cipherText.byteLength); // append IV.
                newUint8[UNENCRYPTED_BYTES[encodedFrame.type] + cipherText.byteLength + IV_LENGTH]
                    = keyIndex; // set key index.

                encodedFrame.data = newData;

                return controller.enqueue(encodedFrame);
            }, e => {
                // TODO: surface this to the app.
                console.error(e);

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
     */
    async decodeFunction(encodedFrame, controller) {
        const data = new Uint8Array(encodedFrame.data);
        const keyIndex = data[encodedFrame.data.byteLength - 1];

        if (this._cryptoKeyRing[keyIndex]) {

            const decodedFrame = await this._decryptFrame(
                encodedFrame,
                keyIndex);

            return controller.enqueue(decodedFrame);
        }

        // TODO: this just passes through to the decoder. Is that ok? If we don't know the key yet
        // we might want to buffer a bit but it is still unclear how to do that (and for how long etc).
        controller.enqueue(encodedFrame);
    }

    /**
     * Function that will decrypt the given encoded frame. If the decryption fails, it will
     * ratchet the key for up to RATCHET_WINDOW_SIZE times.
     *
     * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
     * @param {number} keyIndex - the index of the decryption data in _cryptoKeyRing array.
     * @param {number} ratchetCount - the number of retries after ratcheting the key.
     * @returns {RTCEncodedVideoFrame|RTCEncodedAudioFrame} - The decrypted frame.
     * @private
     */
    async _decryptFrame(
            encodedFrame,
            keyIndex,
            ratchetCount = 0) {

        const { encryptionKey } = this._cryptoKeyRing[keyIndex];
        let { material } = this._cryptoKeyRing[keyIndex];

        // Construct frame trailer. Similar to the frame header described in
        // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.2
        // but we put it at the end.
        //                                             0 1 2 3 4 5 6 7
        // ---------+---------------------------------+-+-+-+-+-+-+-+-+
        // payload  |    CTR... (length=LEN)          |S|LEN  |KID    |
        // ---------+---------------------------------+-+-+-+-+-+-+-+-+

        const iv = new Uint8Array(encodedFrame.data, encodedFrame.data.byteLength - IV_LENGTH - 1, IV_LENGTH);
        const cipherTextStart = UNENCRYPTED_BYTES[encodedFrame.type];
        const cipherTextLength = encodedFrame.data.byteLength - (UNENCRYPTED_BYTES[encodedFrame.type]
            + IV_LENGTH + 1);

        return crypto.subtle.decrypt({
            name: 'AES-GCM',
            iv,
            additionalData: new Uint8Array(encodedFrame.data, 0, UNENCRYPTED_BYTES[encodedFrame.type])
        },
            encryptionKey,
            new Uint8Array(encodedFrame.data, cipherTextStart, cipherTextLength))
            .then(plainText => {
                const newData = new ArrayBuffer(UNENCRYPTED_BYTES[encodedFrame.type] + plainText.byteLength);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(new Uint8Array(encodedFrame.data, 0, UNENCRYPTED_BYTES[encodedFrame.type]));
                newUint8.set(new Uint8Array(plainText), UNENCRYPTED_BYTES[encodedFrame.type]);

                encodedFrame.data = newData;

                return encodedFrame;
            }, async e => {
                console.error(e);

                if (ratchetCount < RATCHET_WINDOW_SIZE) {
                    material = await importKey(await ratchet(material));

                    const newKey = await deriveKeys(material);

                    this._setKeys(newKey);

                    return await this._decryptFrame(
                        encodedFrame,
                        keyIndex,
                        ratchetCount + 1);
                }

                // TODO: notify the application about error status.

                // TODO: For video we need a better strategy since we do not want to based any
                // non-error frames on a garbage keyframe.
                if (encodedFrame.type === undefined) { // audio, replace with silence.
                    const newData = new ArrayBuffer(3);
                    const newUint8 = new Uint8Array(newData);

                    newUint8.set([ 0xd8, 0xff, 0xfe ]); // opus silence frame.
                    encodedFrame.data = newData;

                    return encodedFrame;
                }
            });
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
        const iv = new ArrayBuffer(IV_LENGTH);
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
}
