/* global TransformStream */
/* eslint-disable no-bitwise */

// Worker for E2EE/Insertable streams.
//

/**
 * Polyfill RTCEncoded(Audio|Video)Frame.getMetadata() (not available in M83, available M84+).
 * The polyfill can not be done on the prototype since its not exposed in workers. Instead,
 * it is done as another transformation to keep it separate.
 */
function polyFillEncodedFrameMetadata(encodedFrame, controller) {
    if (!encodedFrame.getMetadata) {
        encodedFrame.getMetadata = function() {
            return {
                // TODO: provide a more complete polyfill based on additionalData for video.
                synchronizationSource: this.synchronizationSource,
                contributingSources: this.contributingSources
            };
        };
    }
    controller.enqueue(encodedFrame);
}

/**
 * Compares two byteArrays for equality.
 */
function isArrayEqual(a1, a2) {
    if (a1.byteLength !== a2.byteLength) {
        return false;
    }
    for (let i = 0; i < a1.byteLength; i++) {
        if (a1[i] !== a2[i]) {
            return false;
        }
    }

    return true;
}

// We use a ringbuffer of keys so we can change them and still decode packets that were
// encrypted with an old key.
const keyRingSize = 3;

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

// Use truncated SHA-256 hashes, 80 bіts for video, 32 bits for audio.
// This follows the same principles as DTLS-SRTP.
const authenticationTagOptions = {
    name: 'HMAC',
    hash: 'SHA-256'
};
const digestLength = {
    key: 10,
    delta: 10,
    undefined: 4 // frame.type is not set on audio
};

/**
 * Derives a set of keys from the master key.
 * @param {Uint8Array} keyBytes - Value to derive key from
 * @param {Uint8Array} salt - Salt used in key derivation
 *
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
async function deriveKeys(keyBytes) {
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
    const material = await crypto.subtle.importKey('raw', keyBytes,
        'HKDF', false, [ 'deriveBits', 'deriveKey' ]);

    const info = new ArrayBuffer();
    const textEncoder = new TextEncoder();

    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#HKDF
    // https://developer.mozilla.org/en-US/docs/Web/API/HkdfParams
    const encryptionKey = await crypto.subtle.deriveKey({
        name: 'HKDF',
        salt: textEncoder.encode('JFrameEncryptionKey'),
        hash: 'SHA-256',
        info
    }, material, {
        name: 'AES-CTR',
        length: 128
    }, false, [ 'encrypt', 'decrypt' ]);
    const authenticationKey = await crypto.subtle.deriveKey({
        name: 'HKDF',
        salt: textEncoder.encode('JFrameAuthenticationKey'),
        hash: 'SHA-256',
        info
    }, material, {
        name: 'HMAC',
        hash: 'SHA-256'
    }, false, [ 'sign' ]);
    const saltKey = await crypto.subtle.deriveBits({
        name: 'HKDF',
        salt: textEncoder.encode('JFrameSaltKey'),
        hash: 'SHA-256',
        info
    }, material, 128);

    return {
        encryptionKey,
        authenticationKey,
        saltKey
    };
}


/**
 * Per-participant context holding the cryptographic keys and
 * encode/decode functions
 */
class Context {
    /**
     * @param {string} id - local muc resourcepart
     */
    constructor(id) {
        // An array (ring) of keys that we use for sending and receiving.
        this._cryptoKeyRing = new Array(keyRingSize);

        // A pointer to the currently used key.
        this._currentKeyIndex = -1;

        // A per-sender counter that is used create the AES CTR.
        // Must be incremented on every frame that is sent, can be reset on
        // key changes.
        this._sendCount = 0n;

        this._id = id;
    }

    /**
     * Sets a key, derives the different subkeys and starts using them for encryption or
     * decryption.
     * @param {CryptoKey} key
     * @param {Number} keyIndex
     */
    async setKey(key, keyIndex) {
        this._currentKeyIndex = keyIndex % this._cryptoKeyRing.length;
        if (key) {
            this._cryptoKeyRing[this._currentKeyIndex] = await deriveKeys(key);
        } else {
            this._cryptoKeyRing[this._currentKeyIndex] = false;
        }
        this._sendCount = 0n; // Reset the send count (bigint).
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
            const frameHeader = new Uint8Array(encodedFrame.data, 0, unencryptedBytes[encodedFrame.type]);

            // Construct frame trailer. Similar to the frame header described in
            // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.2
            // but we put it at the end.
            //                                             0 1 2 3 4 5 6 7
            // ---------+---------------------------------+-+-+-+-+-+-+-+-+
            // payload  |    CTR... (length=LEN)          |S|LEN  |0| KID |
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

            const frameTrailer = new Uint8Array(counterLength + 1);

            frameTrailer.set(new Uint8Array(counter.buffer, counter.byteLength - counterLength));

            // Since we never send a counter of 0 we send counterLength - 1 on the wire.
            // This is different from the sframe draft, increases the key space and lets us
            // ignore the case of a zero-length counter at the receiver.
            frameTrailer[frameTrailer.byteLength - 1] = keyIndex | ((counterLength - 1) << 4);

            // XOR the counter with the saltKey to construct the AES CTR.
            const saltKey = new DataView(this._cryptoKeyRing[keyIndex].saltKey);

            for (let i = 0; i < counter.byteLength; i++) {
                counterView.setUint8(i, counterView.getUint8(i) ^ saltKey.getUint8(i));
            }

            return crypto.subtle.encrypt({
                name: 'AES-CTR',
                counter,
                length: 64
            }, this._cryptoKeyRing[keyIndex].encryptionKey, new Uint8Array(encodedFrame.data,
                unencryptedBytes[encodedFrame.type]))
            .then(cipherText => {
                const newData = new ArrayBuffer(frameHeader.byteLength + cipherText.byteLength
                    + digestLength[encodedFrame.type] + frameTrailer.byteLength);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(frameHeader); // copy first bytes.
                newUint8.set(new Uint8Array(cipherText), unencryptedBytes[encodedFrame.type]); // add ciphertext.
                // Leave some space for the authentication tag. This is filled with 0s initially, similar to
                // STUN message-integrity described in https://tools.ietf.org/html/rfc5389#section-15.4
                newUint8.set(frameTrailer, frameHeader.byteLength + cipherText.byteLength
                    + digestLength[encodedFrame.type]); // append trailer.

                return crypto.subtle.sign(authenticationTagOptions, this._cryptoKeyRing[keyIndex].authenticationKey,
                    new Uint8Array(newData)).then(authTag => {
                    // Set the truncated authentication tag.
                    newUint8.set(new Uint8Array(authTag, 0, digestLength[encodedFrame.type]),
                        unencryptedBytes[encodedFrame.type] + cipherText.byteLength);
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
        const keyIndex = data[encodedFrame.data.byteLength - 1] & 0x7;

        if (this._cryptoKeyRing[keyIndex]) {
            const counterLength = 1 + ((data[encodedFrame.data.byteLength - 1] >> 4) & 0x7);
            const frameHeader = new Uint8Array(encodedFrame.data, 0, unencryptedBytes[encodedFrame.type]);

            // Extract the truncated authentication tag.
            const authTagOffset = encodedFrame.data.byteLength - (digestLength[encodedFrame.type]
                + counterLength + 1);
            const authTag = encodedFrame.data.slice(authTagOffset, authTagOffset
                + digestLength[encodedFrame.type]);

            // Set authentication tag bytes to 0.
            const zeros = new Uint8Array(digestLength[encodedFrame.type]);

            data.set(zeros, encodedFrame.data.byteLength - (digestLength[encodedFrame.type] + counterLength + 1));

            const calculatedTag = await crypto.subtle.sign(authenticationTagOptions,
                this._cryptoKeyRing[keyIndex].authenticationKey, encodedFrame.data);

            // Do truncated hash comparison.
            if (!isArrayEqual(new Uint8Array(authTag),
                    new Uint8Array(calculatedTag.slice(0, digestLength[encodedFrame.type])))) {
                // TODO: at this point we need to ratchet until we get a key that works. If we ratchet too often
                // we need to return an error to the app.
                console.error('Authentication tag mismatch', new Uint8Array(authTag), new Uint8Array(calculatedTag,
                    0, digestLength[encodedFrame.type]));

                return;
            }

            // Extract the counter.
            const counter = new Uint8Array(16);

            counter.set(data.slice(encodedFrame.data.byteLength - (counterLength + 1),
                encodedFrame.data.byteLength - 1), 16 - counterLength);
            const counterView = new DataView(counter.buffer);

            // XOR the counter with the saltKey to construct the AES CTR.
            const saltKey = new DataView(this._cryptoKeyRing[keyIndex].saltKey);

            for (let i = 0; i < counter.byteLength; i++) {
                counterView.setUint8(i,
                    counterView.getUint8(i) ^ saltKey.getUint8(i));
            }

            return crypto.subtle.decrypt({
                name: 'AES-CTR',
                counter,
                length: 64
            }, this._cryptoKeyRing[keyIndex].encryptionKey, new Uint8Array(encodedFrame.data,
                    unencryptedBytes[encodedFrame.type],
                    encodedFrame.data.byteLength - (unencryptedBytes[encodedFrame.type]
                    + digestLength[encodedFrame.type] + counterLength + 1))
            ).then(plainText => {
                const newData = new ArrayBuffer(unencryptedBytes[encodedFrame.type] + plainText.byteLength);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(frameHeader);
                newUint8.set(new Uint8Array(plainText), unencryptedBytes[encodedFrame.type]);
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
        } else if (keyIndex >= this._cryptoKeyRing.length && this._cryptoKeyRing[this._currentKeyIndex]) {
            // If we are encrypting but don't have a key for the remote drop the frame.
            // This is a heuristic since we don't know whether a packet is encrypted,
            // do not have a checksum and do not have signaling for whether a remote participant does
            // encrypt or not.
            return;
        }

        // TODO: this just passes through to the decoder. Is that ok? If we don't know the key yet
        // we might want to buffer a bit but it is still unclear how to do that (and for how long etc).
        controller.enqueue(encodedFrame);
    }
}

const contexts = new Map(); // Map participant id => context

onmessage = async event => {
    const { operation } = event.data;

    if (operation === 'encode') {
        const { readableStream, writableStream, participantId } = event.data;

        if (!contexts.has(participantId)) {
            contexts.set(participantId, new Context(participantId));
        }
        const context = contexts.get(participantId);
        const transformStream = new TransformStream({
            transform: context.encodeFunction.bind(context)
        });

        readableStream
            .pipeThrough(new TransformStream({
                transform: polyFillEncodedFrameMetadata // M83 polyfill.
            }))
            .pipeThrough(transformStream)
            .pipeTo(writableStream);
    } else if (operation === 'decode') {
        const { readableStream, writableStream, participantId } = event.data;

        if (!contexts.has(participantId)) {
            contexts.set(participantId, new Context(participantId));
        }
        const context = contexts.get(participantId);
        const transformStream = new TransformStream({
            transform: context.decodeFunction.bind(context)
        });

        readableStream
            .pipeThrough(new TransformStream({
                transform: polyFillEncodedFrameMetadata // M83 polyfill.
            }))
            .pipeThrough(transformStream)
            .pipeTo(writableStream);
    } else if (operation === 'setKey') {
        const { participantId, key, keyIndex } = event.data;

        if (!contexts.has(participantId)) {
            contexts.set(participantId, new Context(participantId));
        }
        const context = contexts.get(participantId);

        if (key) {
            context.setKey(key, keyIndex);
        } else {
            context.setKey(false, keyIndex);
        }
    } else if (operation === 'cleanup') {
        const { participantId } = event.data;

        contexts.delete(participantId);
    } else {
        console.error('e2ee worker', operation);
    }
};
