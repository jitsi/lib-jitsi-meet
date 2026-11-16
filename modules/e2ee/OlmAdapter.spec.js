import olm from '@matrix-org/olm/olm_legacy.js';

import { ManagedKeyHandler } from './ManagedKeyHandler';
import { OlmAdapter } from './OlmAdapter';

// Constants mirrored from the modules under test so this spec does not need to pull in the
// heavy XMPP/conference modules just to reference a couple of string values.
const FEATURE_E2EE = 'https://jitsi.org/meet/e2ee';
const JITSI_MEET_MUC_TYPE = 'type';
const OLM_MESSAGE_TYPE = 'olm';
const PARTICIPANT_PROPERTY_CHANGED = 'conference.participant_property_changed';
const REQ_TIMEOUT = 5 * 1000;

/**
 * Deep-clones a JSON-serializable value, emulating what a real transport does to a message.
 *
 * @param {object} value - The value to clone.
 * @returns {object}
 */
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

/**
 * Builds a minimal fake JitsiParticipant.
 *
 * @param {string} id - The participant id.
 * @returns {object}
 */
function makeParticipant(id) {
    const props = new Map();

    return {
        _props: props,
        getFeatures: () => Promise.resolve(new Set([ FEATURE_E2EE ])),
        getId: () => id,
        getProperty: name => props.get(name),
        hasFeature: () => true
    };
}

/**
 * Builds a minimal fake JitsiConference exposing only what OlmAdapter uses.
 *
 * @param {string} id - The local participant id.
 * @returns {object}
 */
function makeConference(id) {
    const listeners = new Map();

    return {
        _listeners: listeners,
        _restartMediaSessions: () => { /* not needed */ },
        emit(event, ...args) {
            (listeners.get(event) || []).forEach(cb => cb(...args));
        },
        eventEmitter: { emit: () => { /* not needed */ } },
        getLocalTracks: () => [],
        getMediaSessions: () => [],
        getParticipants: () => [],
        isE2EEEnabled: () => true,
        myUserId: () => id,
        on(event, cb) {
            if (!listeners.has(event)) {
                listeners.set(event, []);
            }
            listeners.get(event).push(cb);
        },
        rtc: { on: () => { /* not needed */ } },
        sendMessage: () => { /* wired in connect() */ },
        setLocalParticipantProperty: () => { /* wired in connect() */ }
    };
}

/**
 * Wires two OlmAdapters together through fake conferences that relay both the E2EE messages and
 * the presence properties between them. The relay supports optional in-transit tampering so we can
 * emulate a malicious/compromised server.
 *
 * @param {string} idA - Id of the first (initiating) participant. Must sort before idB.
 * @param {string} idB - Id of the second participant.
 * @param {Function} [createAdapter] - Creates the adapter of a conference.
 * @returns {object}
 */
function connect(idA, idB, createAdapter = conference => new OlmAdapter(conference)) {
    const confA = makeConference(idA);
    const confB = makeConference(idB);
    const participantBinA = makeParticipant(idB); // How A sees B.
    const participantAinB = makeParticipant(idA); // How B sees A.

    confA.getParticipants = () => [ participantBinA ];
    confB.getParticipants = () => [ participantAinB ];

    const ctx = {
        confA,
        confB,
        participantAinB,
        participantBinA,
        sentByA: [],
        sentByB: [],
        state: {
            adapterA: null,
            adapterB: null,
            transformAtoB: null,
            transformBtoA: null
        }
    };

    // Presence propagation: a property published locally on one side becomes readable on the
    // participant object representing that side on the other conference.
    confA.setLocalParticipantProperty = (name, value) => {
        const old = participantAinB.getProperty(name);

        participantAinB._props.set(name, value);
        confB.emit(PARTICIPANT_PROPERTY_CHANGED, participantAinB, name, old, value);
    };
    confB.setLocalParticipantProperty = (name, value) => {
        const old = participantBinA.getProperty(name);

        participantBinA._props.set(name, value);
        confA.emit(PARTICIPANT_PROPERTY_CHANGED, participantBinA, name, old, value);
    };

    // Message routing, always serializing (like a real transport) and applying any active transform.
    confA.sendMessage = data => {
        ctx.sentByA.push(data);
        const payload = clone(data);

        ctx.state.adapterB._onEndpointMessageReceived(
            participantAinB,
            ctx.state.transformAtoB ? ctx.state.transformAtoB(payload) : payload);
    };
    confB.sendMessage = data => {
        ctx.sentByB.push(data);
        const payload = clone(data);

        ctx.state.adapterA._onEndpointMessageReceived(
            participantBinA,
            ctx.state.transformBtoA ? ctx.state.transformBtoA(payload) : payload);
    };

    ctx.state.adapterA = createAdapter(confA);
    ctx.state.adapterB = createAdapter(confB);

    return ctx;
}

/**
 * Stands in for the E2EE worker and records the messages that E2EEContext posts to it.
 */
class FakeWorker {
    /**
     * Creates a worker that has received no messages.
     */
    constructor() {
        this.messages = [];
    }

    /**
     * Records a message.
     *
     * @param {object} message - The message for the worker.
     * @returns {void}
     */
    postMessage(message) {
        this.messages.push(message);
    }
}

/**
 * Wires two ManagedKeyHandlers together the same way connect() wires two adapters, so a test can turn
 * E2EE on and off as the application does. The adapters in the context are the ones of the handlers.
 *
 * @param {string} idA - Id of the first participant. Must sort before idB.
 * @param {string} idB - Id of the second participant.
 * @returns {object}
 */
function connectKeyHandlers(idA, idB) {
    const handlers = new Map();
    const ctx = connect(idA, idB, conference => {
        const handler = new ManagedKeyHandler(conference);

        conference.isE2EEEnabled = () => handler.isEnabled();
        handlers.set(conference.myUserId(), handler);

        return handler._olmAdapter;
    });

    ctx.handlerA = handlers.get(idA);
    ctx.handlerB = handlers.get(idB);

    return ctx;
}

/**
 * Returns what the given key handler last passed to its E2EE context as the key of a participant.
 *
 * @param {ManagedKeyHandler} handler - The key handler.
 * @param {string} participantId - The participant that owns the key.
 * @returns {object|undefined} - The setKey message for the worker.
 */
function lastKeySet(handler, participantId) {
    return handler.e2eeCtx._worker.messages
        .filter(message => message.operation === 'setKey' && message.participantId === participantId)
        .pop();
}

/**
 * Establishes the Olm sessions in both directions by having A initiate towards B.
 *
 * @param {object} ctx - The context returned by connect().
 * @returns {Promise<void>}
 */
async function establishSessions(ctx) {
    await ctx.state.adapterA._init;
    await ctx.state.adapterB._init;

    await ctx.state.adapterA._sendSessionInit(ctx.participantBinA);
}

/**
 * Builds a signed session-init message exactly as the given adapter would, with an optional
 * mutation applied to the message data to emulate tampering or a downgrade. Returned directly so a
 * test can deliver it to the receiver without going through the initiator's request/timeout logic.
 *
 * @param {OlmAdapter} adapter - The adapter that plays the initiator (source of the keys/signature).
 * @param {Function} [mutate] - Optional callback receiving the message data object to mutate.
 * @returns {object}
 */
function buildSessionInit(adapter, mutate) {
    adapter._olmAccount.generate_one_time_keys(1);
    const otKey = Object.values(JSON.parse(adapter._olmAccount.one_time_keys()).curve25519)[0];

    adapter._olmAccount.mark_keys_as_published();

    const idKey = adapter._idKeys.curve25519;
    const data = {
        idKey,
        otKey,
        signature: adapter._signKeys({ idKey,
            otKey }),
        uuid: 'test-session-init'
    };

    if (mutate) {
        mutate(data);
    }

    return {
        [JITSI_MEET_MUC_TYPE]: OLM_MESSAGE_TYPE,
        olm: {
            data,
            type: 'session-init'
        }
    };
}

/**
 * Drives a full SAS verification between the two adapters, auto-confirming the SAS on both sides
 * (as if both users compared and accepted the emoji/numbers).
 *
 * @param {object} ctx - The context returned by connect().
 * @returns {Promise<{ aSuccess: boolean, bSuccess: boolean }>}
 */
async function runSasVerification(ctx) {
    const a = ctx.state.adapterA;
    const b = ctx.state.adapterB;

    const aReady = new Promise(resolve => {
        a.addListener(OlmAdapter.events.PARTICIPANT_SAS_READY, () => resolve());
    });
    const bReady = new Promise(resolve => {
        b.addListener(OlmAdapter.events.PARTICIPANT_SAS_READY, () => resolve());
    });

    const aCompleted = new Promise(resolve => {
        a.addListener(OlmAdapter.events.PARTICIPANT_VERIFICATION_COMPLETED, (pId, success) => resolve(success));
    });
    const bCompleted = new Promise(resolve => {
        b.addListener(OlmAdapter.events.PARTICIPANT_VERIFICATION_COMPLETED, (pId, success) => resolve(success));
    });

    a.startVerification(ctx.participantBinA);

    // Only confirm once both sides have exchanged SAS keys and displayed the SAS, mirroring the two
    // users comparing the emoji/numbers and each accepting. Confirming earlier would send a MAC
    // before the peer has the SAS key it needs to verify it.
    await Promise.all([ aReady, bReady ]);

    a.markParticipantVerified(ctx.participantBinA, true);
    b.markParticipantVerified(ctx.participantAinB, true);

    const [ aSuccess, bSuccess ] = await Promise.all([ aCompleted, bCompleted ]);

    return {
        aSuccess,
        bSuccess
    };
}

/**
 * Makes a fake conference keep the messages of the given type instead of delivering them.
 *
 * @param {object} conf - The fake conference whose outgoing messages are filtered.
 * @param {string} type - The olm message type to keep.
 * @returns {Promise<object>} - Resolved with the first message that was kept.
 */
function holdMessages(conf, type) {
    const deliver = conf.sendMessage;

    return new Promise(resolve => {
        conf.sendMessage = data => {
            if (data.olm.type === type) {
                resolve(data);
            } else {
                deliver(data);
            }
        };
    });
}

describe('OlmAdapter key authentication', () => {
    const RealWorker = window.Worker;

    beforeAll(async () => {
        await olm.init();
        window.Olm = olm;
        window.Worker = FakeWorker;
    });

    afterAll(() => {
        window.Worker = RealWorker;
    });

    describe('Olm session establishment', () => {
        it('establishes sessions in both directions when signatures are valid', async () => {
            const ctx = connect('alice', 'bob');

            await establishSessions(ctx);

            const atA = ctx.state.adapterA._getParticipantOlmData(ctx.participantBinA);
            const atB = ctx.state.adapterB._getParticipantOlmData(ctx.participantAinB);

            expect(atA.session).toBeTruthy();
            expect(atB.session).toBeTruthy();

            // Each side remembers the peer's authenticated curve25519 key, which SAS binds to.
            expect(typeof atA.curve25519).toBe('string');
            expect(typeof atB.curve25519).toBe('string');
        });

        it('rejects a session-init whose curve25519 key was substituted in transit', async () => {
            const ctx = connect('alice', 'bob');

            await ctx.state.adapterA._init;
            await ctx.state.adapterB._init;

            // A session-init carrying a curve25519 key the signature does not cover (as a relay
            // swapping the key would produce), delivered straight to the receiver.
            const init = buildSessionInit(ctx.state.adapterA, data => {
                data.idKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
            });

            await ctx.state.adapterB._onEndpointMessageReceived(ctx.participantAinB, init);

            const atB = ctx.state.adapterB._getParticipantOlmData(ctx.participantAinB);

            expect(atB.session).toBeUndefined();
            expect(ctx.sentByB.some(m => m.olm && m.olm.type === 'error')).toBe(true);
        });

        it('rejects a session-init with a missing signature (unpatched/downgrading peer)', async () => {
            const ctx = connect('alice', 'bob');

            await ctx.state.adapterA._init;
            await ctx.state.adapterB._init;

            const init = buildSessionInit(ctx.state.adapterA, data => {
                delete data.signature;
            });

            await ctx.state.adapterB._onEndpointMessageReceived(ctx.participantAinB, init);

            const atB = ctx.state.adapterB._getParticipantOlmData(ctx.participantAinB);

            expect(atB.session).toBeUndefined();
            expect(ctx.sentByB.some(m => m.olm && m.olm.type === 'error')).toBe(true);
        });
    });

    describe('Key distribution', () => {
        const keyInfosSentBy = sent => sent.filter(m => m.olm?.type === 'key-info');

        it('sends the key once to a peer that enables E2EE while the sessions are being set up', async () => {
            const ctx = connect('alice', 'bob');
            const a = ctx.state.adapterA;
            const b = ctx.state.adapterB;
            const key = new Uint8Array(32).fill(7);

            await a._init;
            await b._init;

            // Same sequence as ManagedKeyHandler._setEnabled.
            const enabled = a.initSessions().then(() => a.updateKey(key));

            // The peer turns E2EE on as a reaction to our presence, before our sessions are ready.
            ctx.confB.setLocalParticipantProperty('e2ee.enabled', true);

            await enabled;

            // Let the presence handler, which waits for the session setup, run to completion.
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(keyInfosSentBy(ctx.sentByA).length).toBe(1);
            expect(b._getParticipantOlmData(ctx.participantAinB).lastKey).toEqual(key);
        });

        it('sends the key to a peer that enables E2EE when there is no session with it yet', async () => {
            const ctx = connect('alice', 'bob');
            const a = ctx.state.adapterA;
            const b = ctx.state.adapterB;
            const key = new Uint8Array(32).fill(7);

            await a._init;
            await b._init;

            // We already have a key, the peer was not part of its distribution.
            a.updateCurrentMediaKey(key);

            const keyReceived = new Promise(resolve => {
                b.addListener(OlmAdapter.events.PARTICIPANT_KEY_UPDATED, (id, receivedKey) => resolve(receivedKey));
            });

            ctx.confB.setLocalParticipantProperty('e2ee.enabled', true);

            expect(await keyReceived).toEqual(key);
            expect(keyInfosSentBy(ctx.sentByA).length).toBe(1);
        });

        it('sends nothing when E2EE is turned off and a peer that keeps it on drops the key', async () => {
            const ctx = connectKeyHandlers('alice', 'bob');
            const { handlerA, handlerB } = ctx;

            await Promise.all([ handlerA.setEnabled(true), handlerB.setEnabled(true) ]);

            const aliceKey = lastKeySet(handlerB, 'alice');
            const bobKey = lastKeySet(handlerB, 'bob');

            expect(aliceKey.key).toEqual(handlerA._key);

            ctx.sentByA.length = 0;
            ctx.sentByB.length = 0;

            await handlerA.setEnabled(false);

            expect(ctx.sentByA).toEqual([]);
            expect(ctx.sentByB).toEqual([]);

            // The peer no longer has the key, nor the session that delivered it.
            expect(lastKeySet(handlerB, 'alice')).toEqual({ ...aliceKey,
                key: false });
            expect(ctx.state.adapterB._getParticipantOlmData(ctx.participantAinB).session).toBeUndefined();

            // Its own key is not affected.
            expect(handlerB.isEnabled()).toBe(true);
            expect(lastKeySet(handlerB, 'bob')).toEqual(bobKey);
            expect(lastKeySet(handlerA, 'alice').key).toBe(false);
        });

        it('exchanges the keys again with a peer that turns E2EE off and on', async () => {
            const ctx = connectKeyHandlers('alice', 'bob');
            const { handlerA, handlerB } = ctx;

            await Promise.all([ handlerA.setEnabled(true), handlerB.setEnabled(true) ]);
            await handlerA.setEnabled(false);
            await handlerA.setEnabled(true);

            expect(lastKeySet(handlerB, 'alice').key).toEqual(handlerA._key);
            expect(lastKeySet(handlerA, 'bob').key).toEqual(handlerB._key);

            // The other endpoint id order, where the peer that toggles does not start the session.
            await handlerB.setEnabled(false);

            expect(lastKeySet(handlerA, 'bob').key).toBe(false);

            await handlerB.setEnabled(true);

            expect(lastKeySet(handlerA, 'bob').key).toEqual(handlerB._key);
            expect(lastKeySet(handlerB, 'alice').key).toEqual(handlerA._key);
        });
    });

    describe('SAS verification', () => {
        it('completes on both sides and the SAS MAC covers the curve25519 key', async () => {
            const ctx = connect('alice', 'bob');

            await establishSessions(ctx);

            const { aSuccess, bSuccess } = await runSasVerification(ctx);

            expect(aSuccess).toBe(true);
            expect(bSuccess).toBe(true);

            // The emitted SAS MAC must include the curve25519 key that actually derives media keys.
            const sasMac = ctx.sentByA.find(m => m.olm && m.olm.type === 'sas-mac');

            expect(sasMac).toBeTruthy();
            expect(Object.keys(sasMac.olm.data.mac).some(k => k.startsWith('curve25519:'))).toBe(true);
            expect(Object.keys(sasMac.olm.data.mac).some(k => k.startsWith('ed25519:'))).toBe(true);
        });

        it('fails when the curve25519 MAC entry is stripped in transit', async () => {
            const ctx = connect('alice', 'bob');

            await establishSessions(ctx);

            // A relay that drops the curve25519 entry from A's MAC, leaving only the (irrelevant)
            // ed25519 entry the original vulnerable code relied on.
            ctx.state.transformAtoB = data => {
                if (data.olm && data.olm.type === 'sas-mac') {
                    for (const keyId of Object.keys(data.olm.data.mac)) {
                        if (keyId.startsWith('curve25519:')) {
                            delete data.olm.data.mac[keyId];
                        }
                    }
                }

                return data;
            };

            const { bSuccess } = await runSasVerification(ctx);

            expect(bSuccess).toBe(false);
        });
    });

    describe('Request timeouts', () => {
        afterEach(() => {
            jasmine.clock().uninstall();
        });

        it('handles a key-info-ack that arrives after the request timed out', async () => {
            const ctx = connect('alice', 'bob');
            const a = ctx.state.adapterA;
            const b = ctx.state.adapterB;
            const keyOfB = new Uint8Array(32).fill(9);

            await establishSessions(ctx);
            b.updateCurrentMediaKey(keyOfB);

            const onKeyUpdated = jasmine.createSpy('onKeyUpdated');

            a.addListener(OlmAdapter.events.PARTICIPANT_KEY_UPDATED, onKeyUpdated);

            jasmine.clock().install();

            const lateAck = holdMessages(ctx.confB, 'key-info-ack');
            const updated = a.updateKey(new Uint8Array(32).fill(7));
            const ack = await lateAck;

            jasmine.clock().tick(REQ_TIMEOUT);
            await updated;

            await expectAsync(a._onEndpointMessageReceived(ctx.participantBinA, clone(ack))).toBeResolved();

            // The key that came with the ack is still applied.
            expect(onKeyUpdated).toHaveBeenCalledOnceWith('bob', keyOfB, jasmine.any(Number));
        });

        it('keeps a pending session-init when an older key-info times out', async () => {
            const ctx = connect('alice', 'bob');
            const a = ctx.state.adapterA;
            const b = ctx.state.adapterB;

            await a._init;
            await b._init;
            a.updateCurrentMediaKey(new Uint8Array(32).fill(7));

            jasmine.clock().install();

            // The peer enables E2EE: a session is created and our key is sent, but its ack never arrives.
            holdMessages(ctx.confB, 'key-info-ack');
            await a._onParticipantPropertyChanged(ctx.participantBinA, 'e2ee.enabled', false, true);

            expect(a._reqs.size).toBe(1);

            // The peer disables E2EE and enables it again before the key-info request times out.
            a.clearParticipantSession(ctx.participantBinA);
            b.clearParticipantSession(ctx.participantAinB);
            jasmine.clock().tick(REQ_TIMEOUT - 1000);

            const heldAck = holdMessages(ctx.confB, 'session-ack');
            const enabledAgain = a._onParticipantPropertyChanged(ctx.participantBinA, 'e2ee.enabled', false, true);
            const ack = await heldAck;

            // The key-info request times out while the new session-init still waits for its ack.
            jasmine.clock().tick(1000);

            await a._onEndpointMessageReceived(ctx.participantBinA, clone(ack));

            expect(a._getParticipantOlmData(ctx.participantBinA).session).toBeTruthy();
            expect(ctx.sentByA.some(m => m.olm.type === 'error')).toBe(false);

            await enabledAgain;
        });

        it('keeps a pending session-init when an older session-init times out', async () => {
            const ctx = connect('alice', 'bob');
            const a = ctx.state.adapterA;
            const b = ctx.state.adapterB;

            await a._init;
            await b._init;

            jasmine.clock().install();

            // The peer enables E2EE and we send a session-init, but its ack never arrives.
            const lostAck = holdMessages(ctx.confB, 'session-ack');
            const enabled = a._onParticipantPropertyChanged(ctx.participantBinA, 'e2ee.enabled', false, true);

            await lostAck;

            // The peer disables E2EE and enables it again before that session-init times out.
            a.clearParticipantSession(ctx.participantBinA);
            b.clearParticipantSession(ctx.participantAinB);
            jasmine.clock().tick(REQ_TIMEOUT - 1000);

            const heldAck = holdMessages(ctx.confB, 'session-ack');
            const enabledAgain = a._onParticipantPropertyChanged(ctx.participantBinA, 'e2ee.enabled', false, true);
            const ack = await heldAck;

            // The first session-init times out while the new one still waits for its ack.
            jasmine.clock().tick(1000);
            await enabled;

            await a._onEndpointMessageReceived(ctx.participantBinA, clone(ack));

            expect(a._getParticipantOlmData(ctx.participantBinA).session).toBeTruthy();
            expect(ctx.sentByA.some(m => m.olm.type === 'error')).toBe(false);

            await enabledAgain;
        });
    });
});
