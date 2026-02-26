/**
 * Unit tests for JibriSession module.
 */

import RTCStats from '../RTCStats/RTCStats';

import JibriSession from './JibriSession';

describe('JibriSession', () => {
    let sendStatsEntrySpy: jasmine.Spy;
    let mockConnection: any;
    let sendIQSpy: jasmine.Spy;

    beforeEach(() => {
        // Spy on RTCStats.sendStatsEntry to verify error logging
        sendStatsEntrySpy = spyOn(RTCStats, 'sendStatsEntry');

        // Create mock connection with sendIQ method
        sendIQSpy = jasmine.createSpy('sendIQ');
        mockConnection = {
            jid: 'user@example.com',
            sendIQ: sendIQSpy
        };
    });

    describe('Constructor and basic properties', () => {
        it('should initialize with default values', () => {
            const session = new JibriSession();

            expect(session.getError()).toBeUndefined();
            expect(session.getID()).toBeUndefined();
            expect(session.getStatus()).toBe('');
            expect(session.getJibriJid()).toBeNull();
        });

        it('should initialize with provided options', () => {
            const session = new JibriSession({
                connection: mockConnection,
                focusMucJid: 'focus@conference.example.com',
                mode: 'file',
                sessionID: 'test-session-123',
                status: 'on'
            });

            expect(session.getID()).toBe('test-session-123');
            expect(session.getStatus()).toBe('on');
            expect(session.getMode()).toBe('file');
        });

        it('should set and get error', () => {
            const session = new JibriSession();

            session.setError('service-unavailable');

            expect(session.getError()).toBe('service-unavailable');
        });

        it('should set and get live stream view URL', () => {
            const session = new JibriSession();

            session.setLiveStreamViewURL('https://youtube.com/watch?v=abc123');

            expect(session.getLiveStreamViewURL()).toBe('https://youtube.com/watch?v=abc123');
        });

        it('should set and get initiator', () => {
            const session = new JibriSession();

            session.setInitiator('initiator@example.com');

            expect(session.getInitiator()).toBe('initiator@example.com');
        });

        it('should set and get terminator', () => {
            const session = new JibriSession();

            session.setTerminator('terminator@example.com');

            expect(session.getTerminator()).toBe('terminator@example.com');
        });

        it('should set and get jibri JID', () => {
            const session = new JibriSession();

            session.setJibriJid('jibri@example.com');

            expect(session.getJibriJid()).toBe('jibri@example.com');
        });

        it('should set status from jicofo and fallback to it', () => {
            const session = new JibriSession();

            session.setStatusFromJicofo('on');

            expect(session.getStatus()).toBe('on');

            // When _status is set, it takes precedence
            session.setStatus('pending');

            expect(session.getStatus()).toBe('pending');
        });
    });

    describe('_setErrorFromIq', () => {
        it('should extract error from XML IQ with error element', () => {
            const session = new JibriSession();
            const mockErrorIq = document.createElement('iq');

            mockErrorIq.setAttribute('type', 'error');

            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '503');

            const reasonEl = document.createElement('service-unavailable');

            errorEl.appendChild(reasonEl);
            mockErrorIq.appendChild(errorEl);

            session._setErrorFromIq(mockErrorIq);

            expect(session.getError()).toBe('SERVICE-UNAVAILABLE');
        });

        it('should extract error from IQ wrapped error element', () => {
            const session = new JibriSession();
            const mockErrorIq = document.createElement('iq');
            const errorEl = document.createElement('error');
            const reasonEl = document.createElement('not-authorized');

            errorEl.appendChild(reasonEl);
            mockErrorIq.appendChild(errorEl);

            session._setErrorFromIq(mockErrorIq);

            expect(session.getError()).toBe('NOT-AUTHORIZED');
        });

        it('should handle string error like "Not connected"', () => {
            const session = new JibriSession();

            session._setErrorFromIq('Not connected');

            expect(session.getError()).toBe('Not connected');
        });

        it('should handle null error as timeout', () => {
            const session = new JibriSession();

            session._setErrorFromIq(null);

            expect(session.getError()).toBe('timeout');
        });

        it('should handle undefined error as timeout', () => {
            const session = new JibriSession();

            session._setErrorFromIq(undefined);

            expect(session.getError()).toBe('timeout');
        });

        it('should handle XML without error element', () => {
            const session = new JibriSession();
            const mockIq = document.createElement('iq');

            mockIq.setAttribute('type', 'result');

            session._setErrorFromIq(mockIq);

            expect(session.getError()).toBe('unknown');
        });

        it('should handle error element without children', () => {
            const session = new JibriSession();
            const mockErrorIq = document.createElement('iq');
            const errorEl = document.createElement('error');

            mockErrorIq.appendChild(errorEl);

            session._setErrorFromIq(mockErrorIq);

            expect(session.getError()).toBe('unknown');
        });

        it('should handle various XMPP error types', () => {
            const session = new JibriSession();
            const errorTypes = [
                { tag: 'service-unavailable', expected: 'SERVICE-UNAVAILABLE' },
                { tag: 'not-authorized', expected: 'NOT-AUTHORIZED' },
                { tag: 'forbidden', expected: 'FORBIDDEN' },
                { tag: 'item-not-found', expected: 'ITEM-NOT-FOUND' },
                { tag: 'bad-request', expected: 'BAD-REQUEST' },
                { tag: 'internal-server-error', expected: 'INTERNAL-SERVER-ERROR' }
            ];

            errorTypes.forEach(({ tag, expected }) => {
                const mockErrorIq = document.createElement('iq');
                const errorEl = document.createElement('error');
                const reasonEl = document.createElement(tag);

                errorEl.appendChild(reasonEl);
                mockErrorIq.appendChild(errorEl);

                session._setErrorFromIq(mockErrorIq);

                expect(session.getError()).toBe(expected);
            });
        });
    });

    describe('start() method', () => {
        it('should successfully start recording and set status to pending', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'file'
            });

            // Mock successful IQ response with session ID
            const mockSuccessResponse = document.createElement('iq');
            const jibriEl = document.createElement('jibri');

            jibriEl.setAttribute('session_id', 'session-abc-123');
            mockSuccessResponse.appendChild(jibriEl);

            sendIQSpy.and.callFake((iq: any, successCallback: any) => {
                successCallback(mockSuccessResponse);
            });

            await session.start({
                focusMucJid: 'focus@conference.example.com'
            });

            expect(session.getStatus()).toBe('pending');
            expect(session.getID()).toBe('session-abc-123');
            expect(sendIQSpy).toHaveBeenCalled();
        });

        it('should handle 503 service-unavailable error', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'file'
            });

            const mockErrorIq = document.createElement('iq');

            mockErrorIq.setAttribute('type', 'error');

            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '503');

            const reasonEl = document.createElement('service-unavailable');

            errorEl.appendChild(reasonEl);

            const textEl = document.createElement('text');

            textEl.textContent = 'No Jibri instances available';
            errorEl.appendChild(textEl);
            mockErrorIq.appendChild(errorEl);

            sendIQSpy.and.callFake((iq: any, successCallback: any, errorCallback: any) => {
                errorCallback(mockErrorIq);
            });

            await expectAsync(
                session.start({ focusMucJid: 'focus@conference.example.com' })
            ).toBeRejected();

            expect(session.getError()).toBe('SERVICE-UNAVAILABLE');
            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('503');
            expect(statsCall.reason).toBe('SERVICE-UNAVAILABLE');
            expect(statsCall.operation).toBe('start Jibri session request');
        });

        it('should handle 403 not-authorized error', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'stream'
            });

            const mockErrorIq = document.createElement('iq');
            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '403');

            const reasonEl = document.createElement('not-authorized');

            errorEl.appendChild(reasonEl);
            mockErrorIq.appendChild(errorEl);

            sendIQSpy.and.callFake((iq: any, successCallback: any, errorCallback: any) => {
                errorCallback(mockErrorIq);
            });

            await expectAsync(
                session.start({ focusMucJid: 'focus@conference.example.com' })
            ).toBeRejected();

            expect(session.getError()).toBe('NOT-AUTHORIZED');
            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('403');
            expect(statsCall.reason).toBe('NOT-AUTHORIZED');
        });

        it('should handle timeout error (null)', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'file'
            });

            sendIQSpy.and.callFake((iq: any, successCallback: any, errorCallback: any) => {
                errorCallback(null);
            });

            await expectAsync(
                session.start({ focusMucJid: 'focus@conference.example.com' })
            ).toBeRejected();

            expect(session.getError()).toBe('timeout');
            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('timeout');
        });

        it('should handle string error from connection', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'file'
            });

            sendIQSpy.and.callFake((iq: any, successCallback: any, errorCallback: any) => {
                errorCallback('Not connected');
            });

            await expectAsync(
                session.start({ focusMucJid: 'focus@conference.example.com' })
            ).toBeRejected();

            expect(session.getError()).toBe('Not connected');
            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('Not connected');
        });

        it('should include appData, broadcastId, and streamId in IQ', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'stream'
            });

            const mockSuccessResponse = document.createElement('iq');
            const jibriEl = document.createElement('jibri');

            jibriEl.setAttribute('session_id', 'stream-session-456');
            mockSuccessResponse.appendChild(jibriEl);

            sendIQSpy.and.callFake((iq: any, successCallback: any) => {
                successCallback(mockSuccessResponse);
            });

            await session.start({
                appData: '{"app":"youtube"}',
                broadcastId: 'youtube-broadcast-id',
                focusMucJid: 'focus@conference.example.com',
                streamId: 'youtube-stream-key'
            });

            expect(sendIQSpy).toHaveBeenCalled();

            const sentIq = sendIQSpy.calls.mostRecent().args[0];
            const iqString = sentIq.toString();

            expect(iqString).toContain('action="start"');
            expect(iqString).toContain('app_data="{&quot;app&quot;:&quot;youtube&quot;}"');
            expect(iqString).toContain('you_tube_broadcast_id="youtube-broadcast-id"');
            expect(iqString).toContain('streamid="youtube-stream-key"');
            expect(iqString).toContain('recording_mode="stream"');
        });

        it('should call handleStropheError with correct context on error', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'file'
            });

            const mockErrorIq = document.createElement('iq');
            const errorEl = document.createElement('error');
            const reasonEl = document.createElement('internal-server-error');

            errorEl.appendChild(reasonEl);
            mockErrorIq.appendChild(errorEl);

            sendIQSpy.and.callFake((iq: any, successCallback: any, errorCallback: any) => {
                errorCallback(mockErrorIq);
            });

            await expectAsync(
                session.start({ focusMucJid: 'focus@conference.example.com' })
            ).toBeRejected();

            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.operation).toBe('start Jibri session request');
            expect(statsCall.userJid).toBe('user@example.com');
        });
    });

    describe('stop() method', () => {
        it('should successfully stop recording', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'file'
            });

            const mockSuccessResponse = document.createElement('iq');

            mockSuccessResponse.setAttribute('type', 'result');

            sendIQSpy.and.callFake((iq: any, successCallback: any) => {
                successCallback(mockSuccessResponse);
            });

            await expectAsync(
                session.stop({ focusMucJid: 'focus@conference.example.com' })
            ).toBeResolved();

            expect(sendIQSpy).toHaveBeenCalled();

            const sentIq = sendIQSpy.calls.mostRecent().args[0];
            const iqString = sentIq.toString();

            expect(iqString).toContain('action="stop"');
            expect(iqString).toContain('recording_mode="file"');
        });

        it('should handle error when stopping recording', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'file'
            });

            const mockErrorIq = document.createElement('iq');
            const errorEl = document.createElement('error');

            errorEl.setAttribute('code', '404');

            const reasonEl = document.createElement('item-not-found');

            errorEl.appendChild(reasonEl);
            mockErrorIq.appendChild(errorEl);

            sendIQSpy.and.callFake((iq: any, successCallback: any, errorCallback: any) => {
                errorCallback(mockErrorIq);
            });

            await expectAsync(
                session.stop({ focusMucJid: 'focus@conference.example.com' })
            ).toBeRejected();

            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.code).toBe('404');
            expect(statsCall.reason).toBe('ITEM-NOT-FOUND');
            expect(statsCall.operation).toBe('stop Jibri session request');
        });

        it('should handle timeout when stopping', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'file'
            });

            sendIQSpy.and.callFake((iq: any, successCallback: any, errorCallback: any) => {
                errorCallback(null);
            });

            await expectAsync(
                session.stop({ focusMucJid: 'focus@conference.example.com' })
            ).toBeRejected();

            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('timeout');
            expect(statsCall.operation).toBe('stop Jibri session request');
        });

        it('should handle string error when stopping', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'stream'
            });

            sendIQSpy.and.callFake((iq: any, successCallback: any, errorCallback: any) => {
                errorCallback('Not connected');
            });

            await expectAsync(
                session.stop({ focusMucJid: 'focus@conference.example.com' })
            ).toBeRejected();

            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.reason).toBe('Not connected');
        });

        it('should call handleStropheError with correct context on error', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'stream'
            });

            const mockErrorIq = document.createElement('iq');
            const errorEl = document.createElement('error');
            const reasonEl = document.createElement('service-unavailable');

            errorEl.appendChild(reasonEl);
            mockErrorIq.appendChild(errorEl);

            sendIQSpy.and.callFake((iq: any, successCallback: any, errorCallback: any) => {
                errorCallback(mockErrorIq);
            });

            await expectAsync(
                session.stop({ focusMucJid: 'focus@conference.example.com' })
            ).toBeRejected();

            expect(sendStatsEntrySpy).toHaveBeenCalled();

            const statsCall = sendStatsEntrySpy.calls.mostRecent().args[2];

            expect(statsCall.operation).toBe('stop Jibri session request');
            expect(statsCall.userJid).toBe('user@example.com');
        });
    });

    describe('_createIQ method', () => {
        it('should create IQ with correct structure for start action', () => {
            const session = new JibriSession({ mode: 'file' });

            const iq = session._createIQ({
                action: 'start',
                focusMucJid: 'focus@conference.example.com'
            });

            const iqString = iq.toString();

            expect(iqString).toContain('to="focus@conference.example.com"');
            expect(iqString).toContain('type="set"');
            expect(iqString).toContain('<jibri');
            expect(iqString).toContain('action="start"');
            expect(iqString).toContain('recording_mode="file"');
            expect(iqString).toContain('xmlns="http://jitsi.org/protocol/jibri"');
        });

        it('should create IQ with correct structure for stop action', () => {
            const session = new JibriSession({ mode: 'stream' });

            const iq = session._createIQ({
                action: 'stop',
                focusMucJid: 'focus@conference.example.com'
            });

            const iqString = iq.toString();

            expect(iqString).toContain('action="stop"');
            expect(iqString).toContain('recording_mode="stream"');
        });

        it('should include optional parameters when provided', () => {
            const session = new JibriSession({ mode: 'stream' });

            const iq = session._createIQ({
                action: 'start',
                appData: '{"service":"youtube"}',
                broadcastId: 'broadcast-123',
                focusMucJid: 'focus@conference.example.com',
                streamId: 'stream-key-456'
            });

            const iqString = iq.toString();

            expect(iqString).toContain('app_data="{&quot;service&quot;:&quot;youtube&quot;}"');
            expect(iqString).toContain('you_tube_broadcast_id="broadcast-123"');
            expect(iqString).toContain('streamid="stream-key-456"');
        });
    });

    describe('Integration tests', () => {
        it('should handle complete file recording lifecycle', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'file'
            });

            // Start recording
            const startResponse = document.createElement('iq');
            const jibriEl = document.createElement('jibri');

            jibriEl.setAttribute('session_id', 'file-session-789');
            startResponse.appendChild(jibriEl);

            sendIQSpy.and.callFake((iq: any, successCallback: any) => {
                successCallback(startResponse);
            });

            await session.start({ focusMucJid: 'focus@conference.example.com' });

            expect(session.getStatus()).toBe('pending');
            expect(session.getID()).toBe('file-session-789');

            // Update status
            session.setStatus('on');
            expect(session.getStatus()).toBe('on');

            // Stop recording
            const stopResponse = document.createElement('iq');

            stopResponse.setAttribute('type', 'result');

            sendIQSpy.and.callFake((iq: any, successCallback: any) => {
                successCallback(stopResponse);
            });

            await session.stop({ focusMucJid: 'focus@conference.example.com' });

            expect(sendIQSpy).toHaveBeenCalledTimes(2);
        });

        it('should handle complete live streaming lifecycle', async () => {
            const session = new JibriSession({
                connection: mockConnection,
                mode: 'stream'
            });

            session.setInitiator('user@example.com');
            session.setLiveStreamViewURL('https://youtube.com/watch?v=test123');

            const startResponse = document.createElement('iq');
            const jibriEl = document.createElement('jibri');

            jibriEl.setAttribute('session_id', 'stream-session-999');
            startResponse.appendChild(jibriEl);

            sendIQSpy.and.callFake((iq: any, successCallback: any) => {
                successCallback(startResponse);
            });

            await session.start({
                broadcastId: 'youtube-broadcast',
                focusMucJid: 'focus@conference.example.com',
                streamId: 'youtube-key'
            });

            expect(session.getID()).toBe('stream-session-999');
            expect(session.getInitiator()).toBe('user@example.com');
            expect(session.getLiveStreamViewURL()).toBe('https://youtube.com/watch?v=test123');
        });
    });
});
