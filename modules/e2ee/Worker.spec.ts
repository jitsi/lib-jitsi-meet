import { IEncodedFrame } from './Context';
import { IWorkerMessageEvent } from './Worker';
import './Worker';

// The worker installs its message handler on the global scope. Grab it and remove it from the window so it
// doesn't receive messages posted by other tests.
const workerOnMessage = globalThis.onmessage;

globalThis.onmessage = null;

const videoBytes = [ 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef ];

/**
 * Sends a message to the worker.
 *
 * @param {Object} data - The message data.
 * @returns {void}
 */
function postToWorker(data: IWorkerMessageEvent): void {
    workerOnMessage.call(globalThis, { data } as MessageEvent);
}

/**
 * Generates a dummy video frame.
 *
 * @param {ArrayBuffer} data - The frame payload.
 * @returns {IEncodedFrame}
 */
function makeVideoFrame(data: ArrayBuffer = new Uint8Array(videoBytes).buffer): IEncodedFrame {
    return {
        data,
        getMetadata: () => {
            return { synchronizationSource: 321 };
        },
        timestamp: 0,
        type: 'key'
    };
}

/**
 * Runs a frame through the worker's encode / decode transform.
 *
 * @param {string} operation - Encode / decode.
 * @param {IEncodedFrame} frame - The frame to transform.
 * @returns {Promise<IEncodedFrame[]>} The frames which came out of the transform.
 */
function transform(operation: string, frame: IEncodedFrame): Promise<IEncodedFrame[]> {
    return new Promise(resolve => {
        const output: IEncodedFrame[] = [];
        const readableStream = new ReadableStream({
            start(controller) {
                controller.enqueue(frame);
                controller.close();
            }
        });
        const writableStream = new WritableStream({
            close() {
                resolve(output);
            },
            write(chunk: IEncodedFrame) {
                output.push(chunk);
            }
        });

        postToWorker({
            operation,
            participantId: 'participant1',
            readableStream,
            writableStream
        });
    });
}

describe('E2EE Worker', () => {
    describe('shared key mode', () => {
        let encryptionKey: CryptoKey;

        beforeEach(async () => {
            encryptionKey = await crypto.subtle.importKey(
                'raw', new Uint8Array(32).fill(1), 'AES-GCM', false, [ 'encrypt', 'decrypt' ]);

            postToWorker({
                operation: 'initialize',
                sharedKey: true
            });

            // This is how ExternallyManagedKeyHandler sets the key: there is no participant.
            postToWorker({
                key: { encryptionKey },
                keyIndex: 0,
                operation: 'setKey',
                participantId: undefined
            });
        });

        afterEach(() => {
            postToWorker({
                enabled: false,
                operation: 'setEnabled'
            });
        });

        it('encrypts and decrypts frames when enabled', async () => {
            postToWorker({
                enabled: true,
                operation: 'setEnabled'
            });

            const [ encrypted ] = await transform('encode', makeVideoFrame());

            expect(encrypted).toBeDefined();

            // 16 bytes of GCM tag, 12 bytes of IV and 2 bytes of trailer get added.
            expect(encrypted.data.byteLength).toEqual(videoBytes.length + 16 + 12 + 2);
            expect(new Uint8Array(encrypted.data, 0, videoBytes.length))
                .not.toEqual(new Uint8Array(videoBytes));

            const [ decrypted ] = await transform('decode', makeVideoFrame(encrypted.data));

            expect(decrypted).toBeDefined();
            expect(new Uint8Array(decrypted.data)).toEqual(new Uint8Array(videoBytes));
        });

        it('passes frames through when disabled', async () => {
            const [ frame ] = await transform('encode', makeVideoFrame());

            expect(new Uint8Array(frame.data)).toEqual(new Uint8Array(videoBytes));
        });

        it('stays enabled when the shared context is created after enabling', async () => {
            postToWorker({
                enabled: true,
                operation: 'setEnabled'
            });
            postToWorker({
                operation: 'initialize',
                sharedKey: true
            });
            postToWorker({
                key: { encryptionKey },
                keyIndex: 0,
                operation: 'setKey'
            });

            const [ encrypted ] = await transform('encode', makeVideoFrame());

            expect(encrypted.data.byteLength).toEqual(videoBytes.length + 16 + 12 + 2);
        });
    });
});
