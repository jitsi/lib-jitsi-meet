import E2EESessionManager from '../E2EESessionManager';

describe('E2EESessionManager', () => {
    let manager;

    beforeEach(() => {
        manager = new E2EESessionManager();
    });

    it('initializes a session successfully', async () => {
        const participantId = 'test-participant';
        const mockSession = { id: participantId };

        const session = await manager.initializeSession(participantId, async () => mockSession);

        expect(session).toBe(mockSession);
        expect(manager.hasSession(participantId)).toBe(true);
    });

    it('prevents duplicate session initialization', async () => {
        const participantId = 'test-participant';
        const mockSession = { id: participantId };

        const promise1 = manager.initializeSession(participantId, async () => {
            await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
            return mockSession;
        });
        const promise2 = manager.initializeSession(participantId, async () => {
            throw new Error('Should not be called');
        });

        const [session1, session2] = await Promise.all([promise1, promise2]);

        expect(session1).toBe(mockSession);
        expect(session2).toBe(mockSession);
        expect(manager.hasSession(participantId)).toBe(true);
    });

    it('cleans up sessions correctly', async () => {
        const participantId = 'test-participant';
        await manager.initializeSession(participantId, async () => ({ id: participantId }));

        manager.cleanupSession(participantId);

        expect(manager.hasSession(participantId)).toBe(false);
    });

    it('cleans up all sessions', async () => {
        const participantId1 = 'test-participant-1';
        const participantId2 = 'test-participant-2';
        await manager.initializeSession(participantId1, async () => ({ id: participantId1 }));
        await manager.initializeSession(participantId2, async () => ({ id: participantId2 }));

        manager.cleanupAll();

        expect(manager.hasSession(participantId1)).toBe(false);
        expect(manager.hasSession(participantId2)).toBe(false);
    });

    it('handles initialization errors', async () => {
        const participantId = 'test-participant';

        await expect(
            manager.initializeSession(participantId, async () => {
                throw new Error('Init failed');
            })
        ).rejects.toThrow('Init failed');

        expect(manager.hasSession(participantId)).toBe(false);
    });
});
