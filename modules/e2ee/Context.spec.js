/* eslint-disable no-bitwise */
import { Context } from './Context';
import { ratchet, importKey } from './crypto-utils';

/*
function hexdump(buffer) {
    const a = new Uint8Array(buffer);
    let s = '';

    for (let i = 0; i < a.byteLength; i++) {
        s += '0x';
        s += a[i].toString(16);
        s += ' ';
    }

    return s.trim();
}
*/

/* TODO: more tests
 * - delta frames
 * - frame header is not encrypted
 * - different sendCounts
 * - different key length
 * - ratcheting in decodeFunction
 * etc
 */
const audioBytes = [ 0xde, 0xad, 0xbe, 0xef ];
const videoBytes = [ 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef ];

/**
 * generates a dummy audio frame
 */
function makeAudioFrame() {
    return {
        data: new Uint8Array(audioBytes).buffer,
        type: undefined, // type is undefined for audio frames.
        getMetadata: () => {
            return { synchronizationSource: 123 };
        }
    };
}

/**
 * generates a dummy video frame
 */
function makeVideoFrame() {
    return {
        data: new Uint8Array(videoBytes).buffer,
        type: 'key',
        getMetadata: () => {
            return { synchronizationSource: 321 };
        }
    };
}


describe('E2EE Context', () => {
    let sender;
    let sendController;
    let receiver;
    let receiveController;
    const key = new Uint8Array([
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ]);

    beforeEach(() => {
        sender = new Context('sender');
        receiver = new Context('receiver');
    });

    describe('encode function', () => {
        beforeEach(async () => {
            await sender.setKey(key, 0);
            await receiver.setKey(key, 0);
        });

        it('with an audio frame', async done => {
            sendController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    // An audio frame will have an overhead of 6 bytes with this counter and key size:
                    //   4 bytes truncated signature, counter (1 byte) and 1 byte trailer.
                    expect(data.byteLength).toEqual(audioBytes.length + 6);

                    // TODO: provide test vector.
                    done();
                }
            };

            await sender.encodeFunction(makeAudioFrame(), sendController);
        });

        it('with a video frame', async done => {
            sendController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    // A video frame will have an overhead of 12 bytes with this counter and key size:
                    //   10 bytes signature, counter (1 byte) and 1 byte trailer.

                    expect(data.byteLength).toEqual(videoBytes.length + 12);

                    // TODO: provide test vector.
                    done();
                }
            };

            await sender.encodeFunction(makeVideoFrame(), sendController);
        });
    });

    describe('end-to-end test', () => {
        beforeEach(async () => {
            await sender.setKey(key, 0);
            await receiver.setKey(key, 0);
            sendController = {
                enqueue: async encodedFrame => {
                    await receiver.decodeFunction(encodedFrame, receiveController);
                }
            };
        });

        it('with an audio frame', async done => {
            receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(audioBytes.length);
                    expect(Array.from(data)).toEqual(audioBytes);
                    done();
                }
            };

            await sender.encodeFunction(makeAudioFrame(), sendController);
        });

        it('with a video frame', async done => {
            receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(videoBytes.length);
                    expect(Array.from(data)).toEqual(videoBytes);
                    done();
                }
            };

            await sender.encodeFunction(makeVideoFrame(), sendController);
        });

        it('the receiver ratchets forward', async done => {
            // Ratchet the key. We reimport from the raw bytes.
            const material = await importKey(key);

            await sender.setKey(await ratchet(material), 0);

            receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(audioBytes.length);
                    expect(Array.from(data)).toEqual(audioBytes);
                    done();
                }
            };

            await sender.encodeFunction(makeAudioFrame(), sendController);
        });
    });

    describe('E2EE Signature', () => {
        let privateKey;
        let publicKey;

        // Generated one-time using
        // await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-521'}, false, ['sign', 'verify']);
        // then exported as JWK. Only use as test vectors.
        const rawPublicKey = {
            crv: 'P-521',
            ext: true,
            key_ops: [ 'verify' ], // eslint-disable-line camelcase
            kty: 'EC',
            x: 'AEs3y1FyefvjTC6JaJ1s00k5CFnESu5xIofPAmu286Y4UWyx8kB3jTHPKDO8bK81XT2_HbbN9ONm2D5TYCCxoR5r',
            y: 'AZHlLHuSEWM401dy2lo-nu100Hp1ixcYePf9sNboaZruXctvoAt_sAX6MM0NccHx4587yhWfn9NG7fCX60P5KAvA'
        };
        const rawPrivateKey = {
            crv: 'P-521',
            ext: true,
            key_ops: [ 'sign' ], // eslint-disable-line camelcase
            kty: 'EC',
            d: 'AV3aTIFuO9Zm0SXVlnujUvlvGvyPrY0pEOtX2pxD2JwPvWWoLXfTA052MHhqiii2RORe_7Ivm_PNeBwhYcO04i-K',
            x: 'AEs3y1FyefvjTC6JaJ1s00k5CFnESu5xIofPAmu286Y4UWyx8kB3jTHPKDO8bK81XT2_HbbN9ONm2D5TYCCxoR5r',
            y: 'AZHlLHuSEWM401dy2lo-nu100Hp1ixcYePf9sNboaZruXctvoAt_sAX6MM0NccHx4587yhWfn9NG7fCX60P5KAvA'
        };

        beforeEach(async () => {
            privateKey = await crypto.subtle.importKey('jwk', rawPrivateKey, { name: 'ECDSA',
                namedCurve: 'P-521' }, false, [ 'sign' ]);
            publicKey = await crypto.subtle.importKey('jwk', rawPublicKey, { name: 'ECDSA',
                namedCurve: 'P-521' }, false, [ 'verify' ]);

            await sender.setKey(key, 0);
            await receiver.setKey(key, 0);
            sender.setSignatureKey(privateKey);
            receiver.setSignatureKey(publicKey);
        });

        it('signs the first frame', async done => {
            sendController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    // Check that the signature bit is set.
                    expect(data[data.byteLength - 1] & 0x80).toEqual(0x80);

                    // An audio frame will have an overhead of 6 bytes with this counter and key size:
                    //   4 bytes truncated signature, counter (1 byte) and 1 byte trailer.
                    // In addition to that we have the 132 bytes signature.
                    expect(data.byteLength).toEqual(audioBytes.length + 6 + 132);

                    // TODO: provide test vector for the signature.
                    done();
                }
            };
            await sender.encodeFunction(makeAudioFrame(), sendController);
        });

        it('signs subsequent frames from different sources', async done => {
            let frameCount = 0;

            sendController = {
                enqueue: encodedFrame => {
                    frameCount++;
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data[data.byteLength - 1] & 0x80).toEqual(0x80);

                    if (frameCount === 2) {
                        done();
                    }
                }
            };

            await sender.encodeFunction(makeAudioFrame(), sendController);

            const secondFrame = makeAudioFrame();

            secondFrame.getMetadata = () => {
                return { synchronizationSource: 456 };
            };
            await sender.encodeFunction(secondFrame, sendController);
        });

        it('signs subsequent key frames from the same source', async done => {
            let frameCount = 0;

            sendController = {
                enqueue: encodedFrame => {
                    frameCount++;
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data[data.byteLength - 1] & 0x80).toEqual(0x80);

                    if (frameCount === 2) {
                        done();
                    }
                }
            };

            await sender.encodeFunction(makeVideoFrame(), sendController);
            await sender.encodeFunction(makeVideoFrame(), sendController);
        });


        it('signs subsequent frames from the same source', async done => {
            let frameCount = 0;

            sendController = {
                enqueue: encodedFrame => {
                    frameCount++;
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data[data.byteLength - 1] & 0x80).toEqual(0x80);

                    if (frameCount === 2) {
                        done();
                    }
                }
            };

            await sender.encodeFunction(makeAudioFrame(), sendController);
            await sender.encodeFunction(makeAudioFrame(), sendController);
        });

        it('signs after ratcheting the sender key', async done => {
            let frameCount = 0;

            sendController = {
                enqueue: encodedFrame => {
                    frameCount++;
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data[data.byteLength - 1] & 0x80).toEqual(0x80);

                    if (frameCount === 2) {
                        done();
                    }
                }
            };

            await sender.encodeFunction(makeAudioFrame(), sendController);

            // Ratchet the key. We reimport from the raw bytes.
            const material = await importKey(key);

            await sender.setKey(await ratchet(material), 0);
            await sender.encodeFunction(makeAudioFrame(), sendController);
        });

        it('verifies the frame', async done => {
            sendController = {
                enqueue: async encodedFrame => {
                    await receiver.decodeFunction(encodedFrame, receiveController);
                }
            };
            receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(audioBytes.length);
                    expect(Array.from(data)).toEqual(audioBytes);
                    done();
                }
            };
            await sender.encodeFunction(makeAudioFrame(), sendController);
        });
    });
});
