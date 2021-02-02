/* global TransformStream */
/* eslint-disable no-bitwise */

// Worker for E2EE/Insertable streams.

import { Context } from './Context';
import { polyFillEncodedFrameMetadata } from './utils';

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
    } else if (operation === 'setSignatureKey') {
        const { participantId, key, signatureOptions } = event.data;

        if (!contexts.has(participantId)) {
            contexts.set(participantId, new Context(participantId));
        }
        const context = contexts.get(participantId);

        context.setSignatureKey(key, signatureOptions);

    } else if (operation === 'cleanup') {
        const { participantId } = event.data;

        contexts.delete(participantId);
    } else {
        console.error('e2ee worker', operation);
    }
};
