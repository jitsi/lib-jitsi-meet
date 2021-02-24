/* eslint-disable no-bitwise */
/* global BigInt */

import { deriveKeys, importKey, ratchet } from './crypto-utils';
import { isArrayEqual } from './utils';

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

// Use truncated SHA-256 hashes, 80 bіts for video, 32 bits for audio.
// This follows the same principles as DTLS-SRTP.
const AUTHENTICATIONTAG_OPTIONS = {
    name: 'HMAC',
    hash: 'SHA-256'
};
const ENCRYPTION_ALGORITHM = 'AES-CTR';

// https://developer.mozilla.org/en-US/docs/Web/API/AesCtrParams
const CTR_LENGTH = 64;

const DIGEST_LENGTH = {
    key: 10,
    delta: 10,
    undefined: 4 // frame.type is not set on audio
};

// Maximum number of forward ratchets to attempt when the authentication
// tag on a remote packet does not match the current key.
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

        // A per-sender counter that is used create the AES CTR.
        // Must be incremented on every frame that is sent, can be reset on
        // key changes.
        this._sendCount = BigInt(0); // eslint-disable-line new-cap

        this._id = id;

        this._signatureKey = null;
        this._signatureOptions = null;
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
     * Sets the public or private key used to sign or verify frames.
     * @param {CryptoKey} public or private CryptoKey object.
     * @param {Object} signature options. Will be passed to sign/verify and need to specify byteLength of the signature.
     *  Defaults to ECDSA with SHA-256 and a byteLength of 132.
     */
    setSignatureKey(key, options = {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
        byteLength: 132 // Length of the signature.
    }) {
        this._signatureKey = key;
        this._signatureOptions = options;
    }

    /**
     * Decide whether we should sign a frame.
     * @returns {boolean}
     * @private
     */
    _shouldSignFrame() {
        if (!this._signatureKey) {
            return false;
        }

        return true;
    }

    /**
     * Function that will be injected in a stream and will encrypt the given encoded frames.
     *
     * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     *
     * The packet format is a variant of
     *   https://tools.ietf.org/html/draft-omara-sframe-00
     * using a trailer instead of a header. One of the design goals was to not require
     * changes to the SFU which for video requires not encrypting the keyframe bit of VP8
     * as SFUs need to detect a keyframe (framemarking or the generic frame descriptor will
     * solve this eventually). This also "hides" that a client is using E2EE a bit.
     *
     * Note that this operates on the full frame, i.e. for VP8 the data described in
     *   https://tools.ietf.org/html/rfc6386#section-9.1
     *
     * The VP8 payload descriptor described in
     *   https://tools.ietf.org/html/rfc7741#section-4.2
     * is part of the RTP packet and not part of the encoded frame and is therefore not
     * controllable by us. This is fine as the SFU keeps having access to it for routing.
     */
    encodeFunction(encodedFrame, controller) {
        const keyIndex = this._currentKeyIndex;

        if (this._cryptoKeyRing[keyIndex]) {
            this._sendCount++;

            // Thіs is not encrypted and contains the VP8 payload descriptor or the Opus TOC byte.
            const frameHeader = new Uint8Array(encodedFrame.data, 0, UNENCRYPTED_BYTES[encodedFrame.type]);

            // Construct frame trailer. Similar to the frame header described in
            // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.2
            // but we put it at the end.
            //                                             0 1 2 3 4 5 6 7
            // ---------+---------------------------------+-+-+-+-+-+-+-+-+
            // payload  |    CTR... (length=LEN)          |S|LEN  |KID    |
            // ---------+---------------------------------+-+-+-+-+-+-+-+-+
            const counter = new Uint8Array(16);
            const counterView = new DataView(counter.buffer);

            // The counter is encoded as a variable-length field.
            counterView.setBigUint64(8, this._sendCount);
            let counterLength = 8;

            for (let i = 8; i < counter.byteLength; i++ && counterLength--) {
                if (counterView.getUint8(i) !== 0) {
                    break;
                }
            }


            // If a signature is included, the S bit is set and a fixed number
            // of bytes (depending on the signature algorithm) is inserted between
            // CTR and the trailing byte.
            const signatureLength = this._shouldSignFrame(encodedFrame) ? this._signatureOptions.byteLength : 0;
            const frameTrailer = new Uint8Array(counterLength + signatureLength + 1);

            frameTrailer.set(new Uint8Array(counter.buffer, counter.byteLength - counterLength));

            // Since we never send a counter of 0 we send counterLength - 1 on the wire.
            // This is different from the sframe draft, increases the key space and lets us
            // ignore the case of a zero-length counter at the receiver.
            frameTrailer[frameTrailer.byteLength - 1] = keyIndex | ((counterLength - 1) << 4);
            if (signatureLength) {
                frameTrailer[frameTrailer.byteLength - 1] |= 0x80; // set the signature bit.
            }

            // XOR the counter with the saltKey to construct the AES CTR.
            const saltKey = new DataView(this._cryptoKeyRing[keyIndex].saltKey);

            for (let i = 0; i < counter.byteLength; i++) {
                counterView.setUint8(i, counterView.getUint8(i) ^ saltKey.getUint8(i));
            }

            return crypto.subtle.encrypt({
                name: ENCRYPTION_ALGORITHM,
                counter,
                length: CTR_LENGTH
            }, this._cryptoKeyRing[keyIndex].encryptionKey, new Uint8Array(encodedFrame.data,
                UNENCRYPTED_BYTES[encodedFrame.type]))
            .then(cipherText => {
                const newData = new ArrayBuffer(frameHeader.byteLength + cipherText.byteLength
                    + DIGEST_LENGTH[encodedFrame.type] + frameTrailer.byteLength);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(frameHeader); // copy first bytes.
                newUint8.set(new Uint8Array(cipherText), UNENCRYPTED_BYTES[encodedFrame.type]); // add ciphertext.
                // Leave some space for the authentication tag. This is filled with 0s initially, similar to
                // STUN message-integrity described in https://tools.ietf.org/html/rfc5389#section-15.4
                newUint8.set(frameTrailer, frameHeader.byteLength + cipherText.byteLength
                    + DIGEST_LENGTH[encodedFrame.type]); // append trailer.

                return crypto.subtle.sign(AUTHENTICATIONTAG_OPTIONS, this._cryptoKeyRing[keyIndex].authenticationKey,
                    new Uint8Array(newData)).then(async authTag => {
                    const truncatedAuthTag = new Uint8Array(authTag, 0, DIGEST_LENGTH[encodedFrame.type]);


                    // Set the truncated authentication tag.
                    newUint8.set(truncatedAuthTag, UNENCRYPTED_BYTES[encodedFrame.type] + cipherText.byteLength);

                    // Sign with the long-term signature key.
                    if (signatureLength) {
                        const signature = await crypto.subtle.sign(this._signatureOptions,
                            this._signatureKey, truncatedAuthTag);

                        newUint8.set(new Uint8Array(signature), newUint8.byteLength - signature.byteLength - 1);
                    }
                    encodedFrame.data = newData;

                    return controller.enqueue(encodedFrame);
                });
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
        const keyIndex = data[encodedFrame.data.byteLength - 1] & 0xf; // lower four bits.

        if (this._cryptoKeyRing[this._currentKeyIndex] && this._cryptoKeyRing[keyIndex]) {
            const counterLength = 1 + ((data[encodedFrame.data.byteLength - 1] >> 4) & 0x7);
            const signatureLength = data[encodedFrame.data.byteLength - 1] & 0x80
                ? this._signatureOptions.byteLength : 0;
            const frameHeader = new Uint8Array(encodedFrame.data, 0, UNENCRYPTED_BYTES[encodedFrame.type]);

            // Extract the truncated authentication tag.
            const authTagOffset = encodedFrame.data.byteLength - (DIGEST_LENGTH[encodedFrame.type]
                + counterLength + signatureLength + 1);
            const authTag = encodedFrame.data.slice(authTagOffset, authTagOffset
                + DIGEST_LENGTH[encodedFrame.type]);

            // Verify the long-term signature of the authentication tag.
            if (signatureLength) {
                if (this._signatureKey) {
                    const signature = data.subarray(data.byteLength - signatureLength - 1, data.byteLength - 1);
                    const validSignature = await crypto.subtle.verify(this._signatureOptions,
                            this._signatureKey, signature, authTag);

                    if (!validSignature) {
                        // TODO: surface this to the app. We are encrypted but validation failed.
                        console.error('Long-term signature mismatch (or no signature key)');

                        return;
                    }

                    // TODO: surface this to the app. We are now encrypted and verified.
                } else {
                    // TODO: surface this to the app. We are now encrypted but can not verify.
                }

                // Then set signature bytes to 0.
                data.set(new Uint8Array(signatureLength), encodedFrame.data.byteLength - (signatureLength + 1));
            }

            // Set authentication tag bytes to 0.
            data.set(new Uint8Array(DIGEST_LENGTH[encodedFrame.type]), encodedFrame.data.byteLength
                - (DIGEST_LENGTH[encodedFrame.type] + counterLength + signatureLength + 1));

            // Do truncated hash comparison of the authentication tag.
            // If the hash does not match we might have to advance the ratchet a limited number
            // of times. See (even though the description there is odd)
            // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
            let { authenticationKey, material } = this._cryptoKeyRing[keyIndex];
            let validAuthTag = false;
            let newKeys = null;

            for (let distance = 0; distance < RATCHET_WINDOW_SIZE; distance++) {
                const calculatedTag = await crypto.subtle.sign(AUTHENTICATIONTAG_OPTIONS,
                    authenticationKey, encodedFrame.data);

                if (isArrayEqual(new Uint8Array(authTag),
                        new Uint8Array(calculatedTag.slice(0, DIGEST_LENGTH[encodedFrame.type])))) {
                    validAuthTag = true;
                    if (distance > 0) {
                        this._setKeys(newKeys, keyIndex);
                    }
                    break;
                }

                // Attempt to ratchet and generate the next set of keys.
                material = await importKey(await ratchet(material));
                newKeys = await deriveKeys(material);
                authenticationKey = newKeys.authenticationKey;
            }

            // Check whether we found a valid authentication tag.
            if (!validAuthTag) {
                // TODO: return an error to the app.

                console.error('Authentication tag mismatch');

                return;
            }

            // Extract the counter.
            const counter = new Uint8Array(16);

            counter.set(data.slice(encodedFrame.data.byteLength - (counterLength + signatureLength + 1),
                encodedFrame.data.byteLength - (signatureLength + 1)), 16 - counterLength);
            const counterView = new DataView(counter.buffer);

            // XOR the counter with the saltKey to construct the AES CTR.
            const saltKey = new DataView(this._cryptoKeyRing[keyIndex].saltKey);

            for (let i = 0; i < counter.byteLength; i++) {
                counterView.setUint8(i,
                    counterView.getUint8(i) ^ saltKey.getUint8(i));
            }

            return crypto.subtle.decrypt({
                name: ENCRYPTION_ALGORITHM,
                counter,
                length: CTR_LENGTH
            }, this._cryptoKeyRing[keyIndex].encryptionKey, new Uint8Array(encodedFrame.data,
                    UNENCRYPTED_BYTES[encodedFrame.type],
                    encodedFrame.data.byteLength - (UNENCRYPTED_BYTES[encodedFrame.type]
                    + DIGEST_LENGTH[encodedFrame.type] + counterLength + signatureLength + 1))
            ).then(plainText => {
                const newData = new ArrayBuffer(UNENCRYPTED_BYTES[encodedFrame.type] + plainText.byteLength);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(frameHeader);
                newUint8.set(new Uint8Array(plainText), UNENCRYPTED_BYTES[encodedFrame.type]);
                encodedFrame.data = newData;

                return controller.enqueue(encodedFrame);
            }, e => {
                console.error(e);

                // TODO: notify the application about error status.
                // TODO: For video we need a better strategy since we do not want to based any
                // non-error frames on a garbage keyframe.
                if (encodedFrame.type === undefined) { // audio, replace with silence.
                    const newData = new ArrayBuffer(3);
                    const newUint8 = new Uint8Array(newData);

                    newUint8.set([ 0xd8, 0xff, 0xfe ]); // opus silence frame.
                    encodedFrame.data = newData;
                    controller.enqueue(encodedFrame);
                }
            });
        }

        // TODO: this just passes through to the decoder. Is that ok? If we don't know the key yet
        // we might want to buffer a bit but it is still unclear how to do that (and for how long etc).
        controller.enqueue(encodedFrame);
    }
}
