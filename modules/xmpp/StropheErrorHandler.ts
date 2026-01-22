/**
 * Centralized Strophe error handler for logging and analytics.
 * Extracts error code, reason, message, and context from XMPP error stanzas.
 */

import { getLogger } from '@jitsi/logger';

import RTCStats from '../RTCStats/RTCStats';
import { RTCStatsEvents } from '../RTCStats/RTCStatsEvents';

const logger = getLogger('xmpp:StropheErrorHandler');

export interface IStropheErrorContext {
    [key: string]: any;
    operation?: string;
    roomJid?: string;
    userJid?: string;
}

export function handleStropheError(errResponse: any, context: IStropheErrorContext = {}) {
    const errorObj: any = {};
    let errorEl: Element | null = null;

    if (errResponse) {
        if (errResponse.nodeType === 1 && errResponse.tagName.toUpperCase() === 'ERROR') {
            errorEl = errResponse;
        } else if (errResponse.nodeType === 1) {
            const errorElements = errResponse.getElementsByTagName('error');

            if (errorElements?.length > 0) {
                errorEl = Array.from(errorElements as HTMLCollectionOf<Element>)[0] || null;
            }
        }
    }

    if (errorEl) {
        errorObj.code = errorEl.getAttribute('code') || undefined;

        // Get first child element as reason
        const reasonEl = Array.from(errorEl.children)[0];

        if (reasonEl) {
            errorObj.reason = reasonEl.tagName;
        }

        // Get <text> child element
        const msgEl = Array.from(errorEl.getElementsByTagName('text'))[0];

        if (msgEl?.textContent) {
            errorObj.msg = msgEl.textContent;
        }

        // Raw XML string for debugging
        errorObj.raw = errorEl.outerHTML;

    // if the connection is not established we directly return a string as error from sendIQ method
    } else if (typeof errResponse === 'string') {
        errorObj.reason = errResponse;
    } else if (!errResponse) { // null or undefined
        errorObj.reason = 'timeout';
    } else { // Invalid type of error.
        errorObj.reason = 'unknown';
    }

    // Merge in contextual info
    Object.assign(errorObj, context);

    logger.error('Strophe error:', JSON.stringify(errorObj));
    RTCStats.sendStatsEntry(RTCStatsEvents.STROPHE_ERROR_EVENT, null, errorObj);
}
