import E2EEContext from './E2EEContext';
import { ExternallyManagedKeyHandler } from './ExternallyManagedKeyHandler';

// ---------------------------------------------------------------------------
// Worker stub — prevents real script loading during tests
// ---------------------------------------------------------------------------

/** Minimal Worker stand-in that satisfies E2EEContext without loading a script. */
class FakeWorker {
    onerror: ((e: Event) => void) | null = null;
    postMessage = jasmine.createSpy('postMessage');
}

// ---------------------------------------------------------------------------
// Minimal conference mock
// ---------------------------------------------------------------------------

/**
 * Builds a mock conference that satisfies the dependencies of KeyHandler.
 *
 * @param {object} e2eeConfig - Value placed at options.config.e2ee.
 * @param {string} localId - ID returned by myUserId().
 */
function makeMockConference(e2eeConfig: object = {}, localId = 'local-user-id') {
    return {
        myUserId: () => localId,
        options: { config: { e2ee: e2eeConfig } },
        on: () => { /* KeyHandler event registration */ },
        rtc: { on: () => { /* RTCEvents registration */ } },
        setLocalParticipantProperty: () => { /* no-op */ },
        getMediaSessions: () => [],
        getLocalTracks: () => []
    };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ExternallyManagedKeyHandler', () => {
    let originalWorker: typeof Worker;

    beforeEach(() => {
        // Replace the global Worker constructor so that E2EEContext can be
        // instantiated without fetching a real worker script.
        originalWorker = window.Worker;
        (window as any).Worker = FakeWorker;
    });

    afterEach(() => {
        (window as any).Worker = originalWorker;
    });

    // -----------------------------------------------------------------------
    // Construction — sharedKey propagation
    // -----------------------------------------------------------------------

    describe('constructor', () => {
        it('defaults to shared-key mode when e2ee.externallyManagedSharedKey is not configured', () => {
            const conference = makeMockConference({});
            const handler = new ExternallyManagedKeyHandler(conference as any);

            // The worker receives an 'initialize' message with sharedKey: true.
            const worker = (handler as any).e2eeCtx._worker as FakeWorker;
            const initCall = worker.postMessage.calls.first();

            expect(initCall.args[0]).toEqual(jasmine.objectContaining({
                operation: 'initialize',
                sharedKey: true
            }));
        });

        it('uses per-sender mode when e2ee.externallyManagedSharedKey is false', () => {
            const conference = makeMockConference({ externallyManagedSharedKey: false });
            const handler = new ExternallyManagedKeyHandler(conference as any);

            const worker = (handler as any).e2eeCtx._worker as FakeWorker;
            const initCall = worker.postMessage.calls.first();

            expect(initCall.args[0]).toEqual(jasmine.objectContaining({
                operation: 'initialize',
                sharedKey: false
            }));
        });
    });

    // -----------------------------------------------------------------------
    // setKey — argument forwarding
    // -----------------------------------------------------------------------

    describe('setKey()', () => {
        const LOCAL_ID = 'alice';
        const rawKey = new Uint8Array([ 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10 ]);

        let handler: ExternallyManagedKeyHandler;
        let e2eeCtxSetKeySpy: jasmine.Spy;

        beforeEach(() => {
            const conference = makeMockConference({ externallyManagedSharedKey: false }, LOCAL_ID);

            handler = new ExternallyManagedKeyHandler(conference as any);
            // Spy on E2EEContext.setKey after construction to capture forwarded arguments
            // without executing the real postMessage call.
            e2eeCtxSetKeySpy = spyOn((handler as any).e2eeCtx, 'setKey');
        });

        it('forwards raw key bytes and index to e2eeCtx.setKey', () => {
            handler.setKey({ encryptionKey: rawKey, index: 0 });

            expect(e2eeCtxSetKeySpy).toHaveBeenCalledWith(LOCAL_ID, rawKey, 0);
        });

        it('uses the supplied participantId when provided', () => {
            const remoteId = 'bob';

            handler.setKey({ encryptionKey: rawKey, index: 1, participantId: remoteId });

            expect(e2eeCtxSetKeySpy).toHaveBeenCalledWith(remoteId, rawKey, 1);
        });

        it('falls back to the local participant ID when participantId is omitted', () => {
            handler.setKey({ encryptionKey: rawKey, index: 2 });

            const [ participantId ] = e2eeCtxSetKeySpy.calls.mostRecent().args;

            expect(participantId).toBe(LOCAL_ID);
        });

        it('falls back to the local participant ID when participantId is explicitly undefined', () => {
            handler.setKey({ encryptionKey: rawKey, index: 3, participantId: undefined });

            const [ participantId ] = e2eeCtxSetKeySpy.calls.mostRecent().args;

            expect(participantId).toBe(LOCAL_ID);
        });

        it('passes false to disable encryption for the local context', () => {
            handler.setKey({ encryptionKey: false, index: 0 });

            expect(e2eeCtxSetKeySpy).toHaveBeenCalledWith(LOCAL_ID, false, 0);
        });

        it('passes false with the remote participantId to disable a remote receive key', () => {
            const remoteId = 'charlie';

            handler.setKey({ encryptionKey: false, index: 0, participantId: remoteId });

            expect(e2eeCtxSetKeySpy).toHaveBeenCalledWith(remoteId, false, 0);
        });

        it('preserves the key ring index', () => {
            handler.setKey({ encryptionKey: rawKey, index: 15 });

            const [ , , index ] = e2eeCtxSetKeySpy.calls.mostRecent().args;

            expect(index).toBe(15);
        });

        it('accepts an ArrayBuffer in place of a Uint8Array', () => {
            const buf = rawKey.buffer.slice(0, 16);

            handler.setKey({ encryptionKey: buf, index: 0, participantId: 'dave' });

            expect(e2eeCtxSetKeySpy).toHaveBeenCalledWith('dave', buf, 0);
        });
    });

    // -----------------------------------------------------------------------
    // Worker message — end-to-end check that raw bytes reach the worker
    // -----------------------------------------------------------------------

    describe('setKey() → worker message (real E2EEContext, no prototype spy)', () => {
        it('sends a setKey operation with participantId and raw bytes to the worker', () => {
            // A fresh handler here — no spies on e2eeCtx, so the real setKey runs.
            const conference = makeMockConference({ externallyManagedSharedKey: false }, 'local');
            const handler = new ExternallyManagedKeyHandler(conference as any);
            const worker = (handler as any).e2eeCtx._worker as FakeWorker;

            // Discard the 'initialize' message posted during construction.
            worker.postMessage.calls.reset();

            const rawKey = new Uint8Array(32).fill(0xab);

            handler.setKey({ encryptionKey: rawKey, index: 0, participantId: 'peer1' });

            const lastCall = worker.postMessage.calls.mostRecent();

            expect(lastCall.args[0]).toEqual(jasmine.objectContaining({
                operation: 'setKey',
                participantId: 'peer1',
                keyIndex: 0
            }));
            // The key is forwarded as the Uint8Array passed in; Context.setKey inside
            // the worker converts it to ArrayBuffer before HKDF derivation.
            expect(lastCall.args[0].key).toEqual(rawKey);
        });
    });
});
