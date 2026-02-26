/* eslint-disable no-bitwise */

// Worker for E2EE/Insertable streams.

import { Context } from './Context';

const contexts: Map<string, Context> = new Map(); // Map participant id => context

let sharedContext: Optional<Context>;

let enabled = false;

/**
 * Retrieves the participant {@code Context}, creating it if necessary.
 *
 * @param {string} participantId - The participant whose context we need.
 * @returns {Object} The context.
 */
function getParticipantContext(participantId: string): Context {
    if (sharedContext) {
        return sharedContext;
    }

    if (!contexts.has(participantId)) {
        const context = new Context();

        context.setEnabled(enabled);
        contexts.set(participantId, context);
    }

    return contexts.get(participantId);
}

/**
 * Sets an encode / decode transform.
 *
 * @param {Object} context - The participant context where the transform will be applied.
 * @param {string} operation - Encode / decode.
 * @param {Object} readableStream - Readable stream part.
 * @param {Object} writableStream - Writable stream part.
 */
function handleTransform(
        context: Context,
        operation: string,
        readableStream: ReadableStream,
        writableStream: WritableStream
): void {
    if (operation === 'encode' || operation === 'decode') {
        const transformFn = operation === 'encode' ? context.encodeFunction : context.decodeFunction;
        const transformStream = new TransformStream({
            transform: transformFn.bind(context)
        });

        readableStream
            .pipeThrough(transformStream)
            .pipeTo(writableStream);
    } else {
        console.error(`Invalid operation: ${operation}`);
    }
}

interface IWorkerMessageEvent {
    enabled?: boolean;
    key?: ArrayBuffer | false;
    keyIndex?: number;
    operation: string;
    participantId?: string;
    readableStream?: ReadableStream;
    sharedKey?: ArrayBuffer;
    writableStream?: WritableStream;
}

interface IRTCTransformerEvent extends Event {
    transformer: {
        options: {
            operation: string;
            participantId: string;
        };
        readable: ReadableStream;
        writable: WritableStream;
    };
}

// Declare worker scope types
declare const self: {
    RTCTransformEvent?: IRTCTransformerEvent;
    onmessage: (event: MessageEvent<IWorkerMessageEvent>) => void;
    onrtctransform?: (event: IRTCTransformerEvent) => void;
};

onmessage = (event: MessageEvent<IWorkerMessageEvent>) => {
    const { operation } = event.data;

    if (operation === 'initialize') {
        const { sharedKey } = event.data;

        if (sharedKey) {
            sharedContext = new Context({ sharedKey });
        }
    } else if (operation === 'encode' || operation === 'decode') {
        const { readableStream, writableStream, participantId } = event.data;

        if (!readableStream || !writableStream || !participantId) {
            throw new Error('Missing required data: readableStream, writableStream, or participantId');
        }
        const context = getParticipantContext(participantId);

        handleTransform(context, operation, readableStream, writableStream);

    } else if (operation === 'setEnabled') {
        enabled = event.data.enabled;
        contexts.forEach(context => context.setEnabled(enabled));
    } else if (operation === 'setKey') {
        const { participantId, key, keyIndex } = event.data;

        if (!participantId || keyIndex === undefined) {
            throw new Error('Missing required data: participantId or keyIndex');
        }
        const context = getParticipantContext(participantId);

        if (key) {
            context.setKey(new Uint8Array(key), keyIndex);
        } else {
            context.setKey(false, keyIndex);
        }
    } else if (operation === 'cleanup') {
        const { participantId } = event.data;

        if (!participantId) {
            throw new Error('Missing required data: participantId');
        }
        contexts.delete(participantId);
    } else if (operation === 'cleanupAll') {
        contexts.clear();
    } else {
        console.error('e2ee worker', operation);
    }
};

// Operations using RTCRtpScriptTransform.
if (self.RTCTransformEvent) {
    self.onrtctransform = (event: IRTCTransformerEvent) => {
        const transformer = event.transformer;
        const { operation, participantId } = transformer.options;
        const context = getParticipantContext(participantId);

        handleTransform(context, operation, transformer.readable, transformer.writable);
    };
}
