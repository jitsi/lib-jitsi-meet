/* eslint-disable no-bitwise */

// Worker for E2EE/Insertable streams.

import { Context } from './Context';

const contexts = new Map<string, Context>(); // Map participant id => context

let sharedContext: Context | undefined;

export interface IInitializeMessage {
    operation: 'initialize';
    sharedKey?: any;
}

export interface ITransformMessage {
    operation: 'encode' | 'decode';
    participantId: string;
    readableStream: ReadableStream;
    writableStream: WritableStream;
}

export interface ISetKeyMessage {
    key?: any;
    keyIndex?: number;
    operation: 'setKey';
    participantId: string;
}

export interface ICleanupMessage {
    operation: 'cleanup';
    participantId: string;
}

export interface ICleanupAllMessage {
    operation: 'cleanupAll';
}

type WorkerMessage =
    | IInitializeMessage
    | ITransformMessage
    | ISetKeyMessage
    | ICleanupMessage
    | ICleanupAllMessage;

/**
 * Retrieves the participant {@code Context}, creating it if necessary.
 *
 * @param {string} participantId - The participant whose context we need.
 * @returns {Context} The context.
 */
function getParticipantContext(participantId: string): Context {
    if (sharedContext) {
        return sharedContext;
    }

    if (!contexts.has(participantId)) {
        contexts.set(participantId, new Context());
    }

    return contexts.get(participantId);
}

/**
 * Sets an encode / decode transform.
 *
 * @param {Context} context - The participant context where the transform will be applied.
 * @param {string} operation - Encode / decode.
 * @param {ReadableStream} readableStream - Readable stream part.
 * @param {WritableStream} writableStream - Writable stream part.
 */
function handleTransform(
        context: Context,
        operation: 'encode' | 'decode',
        readableStream: ReadableStream,
        writableStream: WritableStream
): void {
    if (operation === 'encode' || operation === 'decode') {
        const transformFn = operation === 'encode' ? context.encodeFunction : context.decodeFunction;
        const transformStream = new TransformStream({
            transform: transformFn.bind(context)
        });

        readableStream.pipeThrough(transformStream).pipeTo(writableStream);
    } else {
        console.error(`Invalid operation: ${operation}`);
    }
}

onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { operation } = event.data;

    if (operation === 'initialize') {
        const { sharedKey } = event.data as IInitializeMessage;

        if (sharedKey) {
            sharedContext = new Context({ sharedKey });
        }
    } else if (operation === 'encode' || operation === 'decode') {
        const { readableStream, writableStream, participantId } = event.data as ITransformMessage;
        const context = getParticipantContext(participantId);

        handleTransform(context, operation, readableStream, writableStream);
    } else if (operation === 'setKey') {
        const { participantId, key, keyIndex } = event.data as ISetKeyMessage;
        const context = getParticipantContext(participantId);

        if (key) {
            context.setKey(key, keyIndex);
        } else {
            context.setKey(false, keyIndex);
        }
    } else if (operation === 'cleanup') {
        const { participantId } = event.data as ICleanupMessage;

        contexts.delete(participantId);
    } else if (operation === 'cleanupAll') {
        contexts.clear();
    } else {
        console.error('e2ee worker', operation);
    }
};

// Operations using RTCRtpScriptTransform.
if ((self as any).RTCTransformEvent) {
    (self as any).onrtctransform = (event: Event
        & { transformer: { options: ITransformMessage; readable: ReadableStream; writable: WritableStream; }; }) => {
        const transformer = (event as any).transformer;
        const { operation, participantId } = transformer.options;
        const context = getParticipantContext(participantId);

        handleTransform(context, operation, transformer.readable, transformer.writable);
    };
}

