/* global TransformStream */
/* eslint-disable no-bitwise */

// Worker for E2EE/Insertable streams.

import { Context } from './Context';

const contexts = new Map(); // Map participant id => context

let singleKey = false;
let singleContext = undefined;

/**
 * Retrieves the participant {@code Context}, creating it if necessary.
 *
 * @param {string} participantId - The participant whose context we need.
 * @returns {Object} The context.
 */
function getParticipantContext(participantId) {
   if (singleKey) {
       if (!singleContext) {
          singleContext = new Context();
        }
        
        return singleContext;
    } else {
        if (!contexts.has(participantId)) {
            contexts.set(participantId, new Context());
        }

        return contexts.get(participantId);
    }
}

/**
 * Sets an encode / decode transform.
 *
 * @param {Object} context - The participant context where the transform will be applied.
 * @param {string} operation - Encode / decode.
 * @param {Object} readableStream - Readable stream part.
 * @param {Object} writableStream - Writable stream part.
 */
function handleTransform(context, operation, readableStream, writableStream) {
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

onmessage = async event => {
    const { operation } = event.data;

    if (operation === 'encode' || operation === 'decode') {
        const { readableStream, writableStream, participantId } = event.data;
        const context = getParticipantContext(participantId);

        handleTransform(context, operation, readableStream, writableStream);
    } else if (operation === 'setKeyBytes') {
        const { participantId, key, keyIndex } = event.data;
        const context = getParticipantContext(participantId);

        if (key) {
            context.setKeyBytes(key, keyIndex);
        } else {
            context.setKeyBytes((false, keyIndex));
        }
    } else if (operation === 'setKey') {
        const { unique, participantId, key, keyIndex } = event.data;
        singleKey = unique;

        const context = getParticipantContext(participantId);

        context._setKeys(key, keyIndex);
    } else if (operation === 'cleanup') {
        const { participantId } = event.data;

        contexts.delete(participantId);
    } else {
        console.error('e2ee worker', operation);
    }
};

// Operations using RTCRtpScriptTransform.
if (self.RTCTransformEvent) {
    self.onrtctransform = event => {
        const transformer = event.transformer;
        const { operation, participantId } = transformer.options;
        const context = getParticipantContext(participantId);

        handleTransform(context, operation, transformer.readable, transformer.writable);
    };
}
