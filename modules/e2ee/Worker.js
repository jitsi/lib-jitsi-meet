/* global TransformStream */

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

// We use a ringbuffer of keys so we can change them and still decode packets that were
// encrypted with an old key.
const keyRingSize = 3;

// We use a 96 bit IV for AES GCM. This is signalled in plain together with the
// packet. See https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
const ivLength = 12;

// We use a 128 bit key for AES GCM.
const keyGenParameters = {
    name: 'AES-GCM',
    length: 128
};

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

// Salt used in key derivation
// FIXME: We currently use the MUC room name for this which has the same lifetime
// as this worker. While not (pseudo)random as recommended in
// https://developer.mozilla.org/en-US/docs/Web/API/Pbkdf2Params
// this is easily available and the same for all participants.
// We currently do not enforce a minimum length of 16 bytes either.
let _keySalt;

/**
 * Derives a AES-GCM key from the input using PBKDF2
 * The key length can be configured above and should be either 128 or 256 bits.
 * @param {Uint8Array} keyBytes - Value to derive key from
 * @param {Uint8Array} salt - Salt used in key derivation
 */
async function deriveKey(keyBytes, salt) {
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
    const material = await crypto.subtle.importKey('raw', keyBytes,
        'PBKDF2', false, [ 'deriveBits', 'deriveKey' ]);

    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#PBKDF2
    return crypto.subtle.deriveKey({
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
    }, material, keyGenParameters, false, [ 'encrypt', 'decrypt' ]);
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

        // We keep track of how many frames we have sent per ssrc.
        // Starts with a random offset similar to the RTP sequence number.
        this._sendCounts = new Map();

        this._id = id;
    }

    /**
     * Derives a per-participant key.
     * @param {Uint8Array} keyBytes - Value to derive key from
     * @param {Uint8Array} salt - Salt used in key derivation
     */
    async deriveKey(keyBytes, salt) {
        const encoder = new TextEncoder();
        const idBytes = encoder.encode(this._id);

        // Separate both parts by a null byte to avoid ambiguity attacks.
        const participantSalt = new Uint8Array(salt.byteLength + idBytes.byteLength + 1);

        participantSalt.set(salt);
        participantSalt.set(idBytes, salt.byteLength + 1);

        return deriveKey(keyBytes, participantSalt);
    }

    /**
     * Sets a key and starts using it for encrypting.
     * @param {CryptoKey} key
     * @param {Number} keyIndex
     */
    setKey(key, keyIndex) {
        this._currentKeyIndex = keyIndex % this._cryptoKeyRing.length;
        this._cryptoKeyRing[this._currentKeyIndex] = key;
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
    makeIV(synchronizationSource, timestamp) {
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
    encodeFunction(encodedFrame, controller) {
        const keyIndex = this._currentKeyIndex;

        if (this._cryptoKeyRing[keyIndex]) {
            const iv = this.makeIV(encodedFrame.getMetadata().synchronizationSource, encodedFrame.timestamp);

            return crypto.subtle.encrypt({
                name: 'AES-GCM',
                iv,
                additionalData: new Uint8Array(encodedFrame.data, 0, unencryptedBytes[encodedFrame.type])
            }, this._cryptoKeyRing[keyIndex], new Uint8Array(encodedFrame.data,
                unencryptedBytes[encodedFrame.type]))
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
    decodeFunction(encodedFrame, controller) {
        const data = new Uint8Array(encodedFrame.data);
        const keyIndex = data[encodedFrame.data.byteLength - 1];

        if (this._cryptoKeyRing[keyIndex]) {
            const iv = new Uint8Array(encodedFrame.data, encodedFrame.data.byteLength - ivLength - 1, ivLength);
            const cipherTextStart = unencryptedBytes[encodedFrame.type];
            const cipherTextLength = encodedFrame.data.byteLength - (unencryptedBytes[encodedFrame.type]
                + ivLength + 1);

            return crypto.subtle.decrypt({
                name: 'AES-GCM',
                iv,
                additionalData: new Uint8Array(encodedFrame.data, 0, unencryptedBytes[encodedFrame.type])
            }, this._cryptoKeyRing[keyIndex], new Uint8Array(encodedFrame.data, cipherTextStart, cipherTextLength))
            .then(plainText => {
                const newData = new ArrayBuffer(unencryptedBytes[encodedFrame.type] + plainText.byteLength);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(new Uint8Array(encodedFrame.data, 0, unencryptedBytes[encodedFrame.type]));
                newUint8.set(new Uint8Array(plainText), unencryptedBytes[encodedFrame.type]);

                encodedFrame.data = newData;

                return controller.enqueue(encodedFrame);
            }, e => {
                console.error(e);

                // TODO: notify the application about error status.

                // TODO: For video we need a better strategy since we do not want to based any
                // non-error frames on a garbage keyframe.
                if (encodedFrame.type === undefined) { // audio, replace with silence.
                    // audio, replace with silence.
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

    if (operation === 'initialize') {
        _keySalt = event.data.salt;
    } else if (operation === 'encode') {
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
            context.setKey(await context.deriveKey(key, _keySalt), keyIndex);
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
