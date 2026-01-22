/**
 * Unit tests for StropheErrorHandler module.
 */

import { getLogger } from '@jitsi/logger';

import RTCStats from '../RTCStats/RTCStats';

import { handleStropheError, IStropheErrorContext } from './StropheErrorHandler';

describe('StropheErrorHandler', () => {
    let sendStatsEntrySpy: jasmine.Spy;

    beforeEach(() => {
        // Spy on RTCStats.sendStatsEntry
        sendStatsEntrySpy = spyOn(RTCStats, 'sendStatsEntry');
    });

    describe('handleStropheError with Element error', () => {
        it('should extract error code, reason, and message from error element', () => {
            // Create mock error response
            const mockError = document.createElement('iq');

            mockError.setAttribute('type', 'error');

            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '404');

            const reasonEl = document.createElement('item-not-found');

            reasonEl.setAttribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-stanzas');
            errorEl.appendChild(reasonEl);

            const textEl = document.createElement('text');

            textEl.textContent = 'Item not found';
            errorEl.appendChild(textEl);

            mockError.appendChild(errorEl);

            const context: IStropheErrorContext = {
                operation: 'test operation',
                roomJid: 'room@conference.example.com',
                userJid: 'user@example.com'
            };

            handleStropheError(mockError, context);

            // Verify RTCStats was called
            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('404');
            expect(statsCall.reason).toBe('ITEM-NOT-FOUND');
            expect(statsCall.msg).toBe('Item not found');
            expect(statsCall.operation).toBe('test operation');
            expect(statsCall.roomJid).toBe('room@conference.example.com');
            expect(statsCall.userJid).toBe('user@example.com');
        });

        it('should handle error element without text message', () => {
            const mockError = document.createElement('iq');

            mockError.setAttribute('type', 'error');

            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '500');

            const reasonEl = document.createElement('internal-server-error');

            errorEl.appendChild(reasonEl);
            mockError.appendChild(errorEl);

            handleStropheError(mockError, { operation: 'test' });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('500');
            expect(statsCall.reason).toBe('INTERNAL-SERVER-ERROR');
            expect(statsCall.msg).toBeUndefined();
        });

        it('should extract raw XML for debugging', () => {
            const mockError = document.createElement('iq');
            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '403');
            const reasonEl = document.createElement('forbidden');

            errorEl.appendChild(reasonEl);
            mockError.appendChild(errorEl);

            handleStropheError(mockError, { operation: 'test' });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.raw).toContain('<error');
            expect(statsCall.raw).toContain('code="403"');
        });
    });

    describe('handleStropheError with timeout (null/undefined error)', () => {
        it('should handle timeout when error is null', () => {
            handleStropheError(null, {
                operation: 'timeout test',
                userJid: 'user@example.com'
            });

            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('timeout');
            expect(statsCall.operation).toBe('timeout test');
            expect(statsCall.userJid).toBe('user@example.com');
        });

        it('should handle timeout when error is undefined', () => {
            handleStropheError(undefined, {
                operation: 'timeout test'
            });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('timeout');
        });
    });

    describe('handleStropheError with context', () => {
        it('should merge contextual information into error object', () => {
            const mockError = document.createElement('iq');
            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '401');
            const reasonEl = document.createElement('not-authorized');

            errorEl.appendChild(reasonEl);
            mockError.appendChild(errorEl);

            const context: IStropheErrorContext = {
                affiliation: 'member',
                operation: 'set affiliation',
                participantJid: 'participant@example.com',
                roomJid: 'room@conference.example.com',
                userJid: 'user@example.com'
            };

            handleStropheError(mockError, context);

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('401');
            expect(statsCall.reason).toBe('NOT-AUTHORIZED');
            expect(statsCall.operation).toBe('set affiliation');
            expect(statsCall.affiliation).toBe('member');
            expect(statsCall.participantJid).toBe('participant@example.com');
            expect(statsCall.roomJid).toBe('room@conference.example.com');
            expect(statsCall.userJid).toBe('user@example.com');
        });

        it('should handle custom context fields', () => {
            const mockError = document.createElement('iq');
            const errorEl = document.createElement('error');

            errorEl.appendChild(document.createElement('service-unavailable'));
            mockError.appendChild(errorEl);

            const context = {
                customField1: 'value1',
                customField2: 42,
                operation: 'custom operation'
            };

            handleStropheError(mockError, context);

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.customField1).toBe('value1');
            expect(statsCall.customField2).toBe(42);
            expect(statsCall.operation).toBe('custom operation');
        });
    });

    describe('handleStropheError edge cases', () => {
        it('should handle error element that is directly passed (not wrapped in IQ)', () => {
            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '400');
            const reasonEl = document.createElement('bad-request');

            errorEl.appendChild(reasonEl);

            handleStropheError(errorEl, { operation: 'direct error element' });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('400');
            expect(statsCall.reason).toBe('BAD-REQUEST');
        });

        it('should handle error without code attribute', () => {
            const mockError = document.createElement('iq');
            const errorEl = document.createElement('error');
            const reasonEl = document.createElement('unexpected-error');

            errorEl.appendChild(reasonEl);
            mockError.appendChild(errorEl);

            handleStropheError(mockError, { operation: 'no code' });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('UNEXPECTED-ERROR');
            expect(statsCall.code).toBeUndefined();
        });

        it('should handle empty context object', () => {
            const mockError = document.createElement('iq');
            const errorEl = document.createElement('error');

            errorEl.appendChild(document.createElement('gone'));
            mockError.appendChild(errorEl);

            handleStropheError(mockError, {});

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('GONE');
        });
    });

    describe('handleStropheError with string error', () => {
        it('should handle string error like "Not connected"', () => {
            handleStropheError('Not connected', {
                operation: 'test operation',
                userJid: 'user@example.com'
            });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('Not connected');
            expect(statsCall.operation).toBe('test operation');
            expect(statsCall.userJid).toBe('user@example.com');
        });
    });

    describe('handleStropheError with unknown error type', () => {
        it('should handle invalid error types with reason "unknown"', () => {
            handleStropheError(12345 as any, {
                operation: 'test with number'
            });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('unknown');
            expect(statsCall.operation).toBe('test with number');
        });

        it('should handle array error with reason "unknown"', () => {
            handleStropheError([] as any, {
                operation: 'test with array'
            });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('unknown');
        });

        it('should still merge context for unknown error types', () => {
            handleStropheError({ unexpected: 'object' } as any, {
                operation: 'test with object',
                userJid: 'user@example.com'
            });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('unknown');
            expect(statsCall.operation).toBe('test with object');
            expect(statsCall.userJid).toBe('user@example.com');
        });
    });

    describe('Integration scenarios', () => {
        it('should handle Jibri session error scenario', () => {
            const mockError = document.createElement('iq');
            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '503');
            const reasonEl = document.createElement('service-unavailable');

            errorEl.appendChild(reasonEl);
            const textEl = document.createElement('text');

            textEl.textContent = 'No Jibri instances available';
            errorEl.appendChild(textEl);
            mockError.appendChild(errorEl);

            handleStropheError(mockError, {
                operation: 'start Jibri session request',
                userJid: 'user@example.com'
            });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('503');
            expect(statsCall.reason).toBe('SERVICE-UNAVAILABLE');
            expect(statsCall.msg).toBe('No Jibri instances available');
            expect(statsCall.operation).toBe('start Jibri session request');
        });

        it('should handle Jingle session error scenario', () => {
            const mockError = document.createElement('iq');
            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '404');
            const reasonEl = document.createElement('item-not-found');

            errorEl.appendChild(reasonEl);
            mockError.appendChild(errorEl);

            handleStropheError(mockError, {
                isP2P: false,
                operation: 'Jingle IQ',
                remoteJid: 'focus@auth.example.com/focus',
                roomJid: 'room@conference.example.com',
                session: 'JingleSessionPC[sid=abc123,initiator=false,p2p=false]',
                sid: 'abc123',
                state: 'ENDED',
                userJid: 'user@example.com'
            });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('404');
            expect(statsCall.reason).toBe('ITEM-NOT-FOUND');
            expect(statsCall.isP2P).toBe(false);
            expect(statsCall.operation).toBe('Jingle IQ');
            expect(statsCall.sid).toBe('abc123');
            expect(statsCall.state).toBe('ENDED');
        });

        it('should handle conference request error scenario', () => {
            const mockError = document.createElement('iq');
            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '403');
            const reasonEl = document.createElement('not-authorized');

            errorEl.appendChild(reasonEl);
            const textEl = document.createElement('text');

            textEl.textContent = 'Authentication required';
            errorEl.appendChild(textEl);
            mockError.appendChild(errorEl);

            handleStropheError(mockError, {
                mode: 'xmpp',
                operation: 'conference request (IQ)',
                roomJid: 'room@conference.example.com',
                targetJid: 'focus.example.com',
                userJid: 'user@example.com'
            });

            expect(sendStatsEntrySpy).toHaveBeenCalled();
            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('403');
            expect(statsCall.reason).toBe('NOT-AUTHORIZED');
            expect(statsCall.msg).toBe('Authentication required');
            expect(statsCall.mode).toBe('xmpp');
            expect(statsCall.operation).toBe('conference request (IQ)');
            expect(statsCall.targetJid).toBe('focus.example.com');
        });
    });
});
