import olm from '@matrix-org/olm/olm_legacy.js';

import { OlmAdapter } from './OlmAdapter';

// Constants mirrored from the modules under test so this spec does not need to pull in the
// heavy XMPP/conference modules just to reference a couple of string values.
const FEATURE_E2EE = 'https://jitsi.org/meet/e2ee';
const JITSI_MEET_MUC_TYPE = 'type';
const OLM_MESSAGE_TYPE = 'olm';
const PARTICIPANT_PROPERTY_CHANGED = 'conference.participant_property_changed';

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
        emit(event, ...args) {
            (listeners.get(event) || []).forEach(cb => cb(...args));
        },
        getParticipants: () => [],
        isE2EEEnabled: () => true,
        myUserId: () => id,
        on(event, cb) {
            if (!listeners.has(event)) {
                listeners.set(event, []);
            }
            listeners.get(event).push(cb);
        },
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
 * @returns {object}
 */
function connect(idA, idB) {
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

    ctx.state.adapterA = new OlmAdapter(confA);
    ctx.state.adapterB = new OlmAdapter(confB);

    return ctx;
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

describe('OlmAdapter key authentication', () => {
    beforeAll(async () => {
        await olm.init();
        window.Olm = olm;
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
});
