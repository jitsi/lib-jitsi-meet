/* eslint-disable no-bitwise */
import { Context } from './Context';
import { importKey, ratchet } from './crypto-utils';

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
 * generates an empty audio frame, as produced by the opus encoder when DTX is enabled.
 */
function makeEmptyAudioFrame() {
    return {
        data: new ArrayBuffer(0),
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
        sender.setEnabled(true);
        receiver = new Context('receiver');
        receiver.setEnabled(true);
    });

    describe('encode function', () => {
        beforeEach(async () => {
            await sender.setKey(key, 0);
            await receiver.setKey(key, 0);
        });

        it('with an audio frame', done => {
            sendController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    // An audio frame will have an overhead of 30 bytes and key size:
                    // 16 bytes authentication tag, 12 bytes iv, iv length (1 byte) and 1 byte key index.
                    expect(data.byteLength).toEqual(audioBytes.length + 30);

                    // TODO: provide test vector.
                    done();
                }
            };

            sender.encodeFunction(makeAudioFrame(), sendController);
        });

        it('with a video frame', done => {
            sendController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    // A video frame will have an overhead of 30 bytes and key size:
                    // 16 bytes authentication tag, 12 bytes iv, iv length (1 byte) and 1 byte key index.
                    expect(data.byteLength).toEqual(videoBytes.length + 30);

                    // TODO: provide test vector.
                    done();
                }
            };

            sender.encodeFunction(makeVideoFrame(), sendController);
        });

        it('passes an empty audio frame through', () => {
            const enqueued = [];

            sendController = {
                enqueue: encodedFrame => enqueued.push(encodedFrame)
            };

            const frame = makeEmptyAudioFrame();

            expect(() => sender.encodeFunction(frame, sendController)).not.toThrow();
            expect(enqueued).toEqual([ frame ]);
            expect(frame.data.byteLength).toEqual(0);
        });

        it('does not break the transform stream on an empty audio frame', async () => {
            const transformStream = new TransformStream({
                transform: sender.encodeFunction.bind(sender)
            });
            const writer = transformStream.writable.getWriter();
            const reader = transformStream.readable.getReader();

            // Not awaited, the writes only settle as the frames are read out of the stream.
            writer.write(makeEmptyAudioFrame());
            writer.write(makeAudioFrame());

            // The empty frame is passed through unmodified.
            expect((await reader.read()).value.data.byteLength).toEqual(0);

            // The stream must still be usable for the frames that follow.
            expect((await reader.read()).value.data.byteLength).toEqual(audioBytes.length + 30);
        });
    });

    describe('decode function', () => {
        beforeEach(async () => {
            await receiver.setKey(key, 0);
        });

        it('passes an empty audio frame through', async () => {
            const enqueued = [];

            receiveController = {
                enqueue: encodedFrame => enqueued.push(encodedFrame)
            };

            const frame = makeEmptyAudioFrame();

            await receiver.decodeFunction(frame, receiveController);

            expect(enqueued).toEqual([ frame ]);
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

        it('with an audio frame', done => {
            receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(audioBytes.length);
                    expect(Array.from(data)).toEqual(audioBytes);
                    done();
                }
            };

            sender.encodeFunction(makeAudioFrame(), sendController);
        });

        it('with a video frame', done => {
            receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(videoBytes.length);
                    expect(Array.from(data)).toEqual(videoBytes);
                    done();
                }
            };

            sender.encodeFunction(makeVideoFrame(), sendController);
        });

        it('the receiver ratchets forward', done => {
            receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(audioBytes.length);
                    expect(Array.from(data)).toEqual(audioBytes);
                    done();
                }
            };

            const encodeFunction = async () => {
                // Ratchet the key. We reimport from the raw bytes.
                const material = await importKey(key.buffer);

                await sender.setKey(await ratchet(material), 0);

                sender.encodeFunction(makeAudioFrame(), sendController);
            };

            encodeFunction();
        });
    });
});
