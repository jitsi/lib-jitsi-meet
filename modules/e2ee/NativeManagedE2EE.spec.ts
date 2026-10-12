import JitsiConference from '../../JitsiConference';
import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import JitsiConnection from '../../JitsiConnection';
import { CodecMimeType } from '../../service/RTC/CodecMimeType';
import SignalingLayer from '../../service/RTC/SignalingLayer';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import FeatureFlags from '../flags/FeatureFlags';
import Deferred from '../util/Deferred';

import { registerNativeE2EE } from './NativeE2EE';
import { OlmAdapter } from './OlmAdapter';

/** Actual conference/RTC/TPC and original managed key methods, with native acknowledgment doubles. */
describe('Native managed JitsiConference', () => {
    const Original = window.RTCPeerConnection;
    const previousOlm = (window as any).Olm;
    const originalBootstrap = (OlmAdapter.prototype as any)._bootstrapOlm;
    let sequence = 0;
    let conference: JitsiConference;
    let keyResult: () => Promise<boolean>;
    let retireResult: () => Promise<boolean>;
    let closeResult: () => Promise<boolean>;
    const native = {
        jitsiE2EEBindReceiver: jasmine.createSpy('bind receiver').and.resolveTo(true),
        jitsiE2EEConferenceClose: jasmine.createSpy('close store').and.callFake(() => closeResult()),
        jitsiE2EEConferenceCreate: jasmine.createSpy('create store').and.returnValue('private-store'),
        jitsiE2EEConferenceRemoveParticipant: jasmine.createSpy('remove owner').and.resolveTo(true),
        jitsiE2EEConferenceSetKey: jasmine.createSpy('install key').and.callFake(() => keyResult()),
        jitsiE2EERatchet: jasmine.createSpy('ratchet'),
        jitsiE2EERetirePeer: jasmine.createSpy('retire peer').and.callFake(() => retireResult()),
        jitsiE2EEVerifySender: jasmine.createSpy('verify sender').and.resolveTo(true)
    };

    class NativePeer extends Original {
        _pcId: number;
        protectedConfiguration: any;
        static isNativeManagedE2EESupported() { return true; }
        constructor(configuration) {
            super(configuration);
            this._pcId = ++sequence;
            this.protectedConfiguration = configuration;
        }
    }

    const crypto = {
        importKey: jasmine.createSpy('native import'),
        ratchet: jasmine.createSpy('native ratchet')
    };

    function create() {
        return conference.rtc.createPeerConnection(new SignalingLayer(), { iceServers: [] }, false, {
            codecSettings: { codecList: [ CodecMimeType.VP8 ] }, disableRtx: true, disableSimulcast: true
        });
    }

    beforeAll(() => {
        registerNativeE2EE({ RTCPeerConnection: NativePeer, crypto, nativeModule: native, platform: 'ios' });
    });

    beforeEach(() => {
        window.RTCPeerConnection = NativePeer;
        (window as any).Olm = {};
        keyResult = () => Promise.resolve(true);
        retireResult = () => Promise.resolve(true);
        closeResult = () => Promise.resolve(true);
        Object.values(native).forEach(spy => spy.calls.reset());
        // Olm cryptography is covered by the real-Olm authentication tests.
        // Here bootstrap is held locally; original generation/updateKey/handler methods still run.
        spyOn(OlmAdapter.prototype as any, '_bootstrapOlm').and.callFake(function() { this._init.resolve(); });
        const connection = new JitsiConnection(null, null, {
            hosts: { domain: 'invalid.example', muc: 'conference.invalid.example' },
            serviceUrl: 'wss://invalid.example/xmpp-websocket'
        } as any);

        conference = connection.initJitsiConference(`native-test-${++sequence}`, {
            avgRtpStatsN: 0, e2ee: { nativeManaged: true }, enableLobby: false, p2p: { enabled: false }
        });
        const room = conference.room;

        spyOn(room, 'leave').and.callFake(async () => { room.emit(XMPPEvents.MUC_LEFT); });
    });

    afterEach(async () => {
        await conference?.leave().catch(() => undefined);
        window.RTCPeerConnection = Original;
        (window as any).Olm = previousOlm;
        FeatureFlags.init({});
    });

    it('requires original managed key generation and native acknowledgment before join/SDP', async () => {
        const key = new Deferred<boolean>();

        keyResult = () => key.promise;
        expect(() => conference.join()).toThrowError('Native managed E2EE must be ready before joining');
        const enabling = conference.setE2EEEnabled(true);
        const tpc = create();
        const offerSpy = spyOn(tpc.peerconnection, 'createOffer').and.callThrough();
        const offer = tpc.createOffer({});

        for (let i = 0; i < 20; i++) await Promise.resolve();
        expect(offerSpy).not.toHaveBeenCalled();
        expect(native.jitsiE2EEConferenceSetKey.calls.count()).toBe(1);
        const args = native.jitsiE2EEConferenceSetKey.calls.first().args;

        expect(args[1]).toBe(conference.myUserId());
        expect(args[2].length).toBe(32);
        expect(args[3]).toBe(0);
        key.resolve(true);
        await enabling;
        await offer;
        expect((tpc.peerconnection as NativePeer).protectedConfiguration.jitsiE2EE).toBeTrue();
        expect((tpc.peerconnection as NativePeer).protectedConfiguration.jitsiE2EEConference).toBe('private-store');
        expect(args[2].every(value => value === 0)).toBeTrue();
        expect(conference.getNativeE2EEState().keyUpdates.local).toBe(1);
        expect(conference.getNativeE2EEState().ready).toBeTrue();
        await tpc.close();
    });

    it('awaits native retirement while retaining the store for a replacement JVB session', async () => {
        await conference.setE2EEEnabled(true);
        const tpc = create();
        const retirement = new Deferred<boolean>();

        retireResult = () => retirement.promise;
        let finished = false;
        const close = tpc.close().then(() => { finished = true; });

        await Promise.resolve();
        expect(finished).toBeFalse();
        expect(native.jitsiE2EEConferenceClose).not.toHaveBeenCalled();
        retirement.resolve(true);
        await close;
        const replacement = create();

        await replacement.createOffer({});
        expect(native.jitsiE2EEConferenceSetKey).toHaveBeenCalledTimes(1);
        expect(conference.getNativeE2EEState().retiredPeers).toBe(1);
        await replacement.close();
    });

    it('terminally fails a rejected native key and never reaches ordinary media', async () => {
        keyResult = () => Promise.resolve(false);
        const failure = jasmine.createSpy('conference failure');

        conference.on(JitsiConferenceEvents.CONFERENCE_FAILED, failure);
        await expectAsync(conference.setE2EEEnabled(true)).toBeRejected();
        expect(conference.getNativeE2EEState().closed).toBeTrue();
        expect(failure).toHaveBeenCalledWith('conference.nativeE2EEFailed');
        expect(() => create()).toThrow();
        expect(native.jitsiE2EEConferenceClose).toHaveBeenCalledTimes(1);
    });

    it('rejects changed final local identity and unexpected receiver owner changes', async () => {
        await conference.setE2EEEnabled(true);
        conference.room.myroomjid = 'native-test@conference.invalid.example/changed';
        expect(() => create()).toThrowError('Native conference ownership changed');
        expect(() => conference._assertNativeTrackOwner({ getParticipantId: () => 'original' } as any, 'other'))
            .toThrowError('Native receiver owner changed');
        expect(conference.getNativeE2EEState().closed).toBeTrue();
    });

    it('does not free Olm state until suspended callbacks drain after immediate native revocation', async () => {
        await conference.setE2EEEnabled(true);
        const handler = (conference as any)._e2eEncryption._keyHandler;
        const callback = new Deferred<void>();
        const free = jasmine.createSpy('free account');

        handler._olmAdapter._olmAccount = { free };
        handler._olmAdapter._nativeLifecycle.run(() => callback.promise);
        const leave = conference.leave();

        expect(conference.getNativeE2EEState().closed).toBeTrue();
        expect(native.jitsiE2EEConferenceClose).toHaveBeenCalledTimes(1);
        expect(free).not.toHaveBeenCalled();
        callback.resolve();
        await leave;
        expect(free).toHaveBeenCalledTimes(1);
        expect(conference.getNativeE2EEState().callbacksDrained).toBeTrue();
        expect(conference.getNativeE2EEState().sessionsFreed).toBeTrue();
        await conference.leave();
        expect(free).toHaveBeenCalledTimes(1);
    });

    it('tombstones departed owners before USER_LEFT and does not confuse source removal with departure', async () => {
        await conference.setE2EEEnabled(true);
        const participant = { getId: () => 'remote', getJid: () => 'room@conference.invalid.example/remote' };
        const context = conference.rtc.getNativeE2EEContext();
        const handler = (conference as any)._e2eEncryption._keyHandler;
        const callback = new Deferred<void>();
        const left = jasmine.createSpy('left');

        conference.participants.set('remote', participant as any);
        conference.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, {});
        expect(native.jitsiE2EEConferenceRemoveParticipant).not.toHaveBeenCalled();
        handler._olmAdapter._nativeLifecycle.run(() => callback.promise, [], 'remote');
        conference.on(JitsiConferenceEvents.USER_LEFT, left);
        conference.onMemberLeft(participant.getJid());
        expect(context.removed.has('remote')).toBeTrue();
        expect(native.jitsiE2EEConferenceRemoveParticipant).toHaveBeenCalledTimes(1);
        expect(left).not.toHaveBeenCalled();
        await context.setKey('remote', new Uint8Array(32), 2);
        callback.resolve();
        await handler._olmAdapter._nativeLifecycle.drain();
        for (let i = 0; i < 10; i++) await Promise.resolve();
        expect(left).toHaveBeenCalledWith('remote', participant, undefined);
        expect(conference.getNativeE2EEState('remote').nativeRemovalAcknowledged).toBeTrue();
    });

    it('cancels owned requests and completes leave without a remote reply', async () => {
        await conference.setE2EEEnabled(true);
        const adapter = (conference as any)._e2eEncryption._keyHandler._olmAdapter;
        const request = new Deferred<void>();

        adapter._reqs.set('private-request', request);
        adapter._nativeRequestOwners.set('private-request', 'remote');
        adapter._nativeLifecycle.run(() => request.promise, [], 'remote');
        await conference.leave();
        expect(adapter._reqs.size).toBe(0);
        expect(conference.getNativeE2EEState().callbacksDrained).toBeTrue();
        expect(conference.getNativeE2EEState().nativeErrors).toBe(0);
    });

    it('closes during original Olm bootstrap without late presence, keys, or account leaks', async () => {
        const adapter = (conference as any)._e2eEncryption._keyHandler._olmAdapter;
        const init = new Deferred<void>();
        const free = jasmine.createSpy('free late account');

        (window as any).Olm = {
            Account: class {
                create() {}
                identity_keys() { return JSON.stringify({ curve25519: 'public-curve', ed25519: 'public-signing' }); }
                free() { free(); }
            },
            Utility: class { free() {} },
            get_library_version: () => [ 3, 2, 15 ],
            init: () => init.promise
        };
        adapter._init = new Deferred<void>();
        const property = spyOn(conference, 'setLocalParticipantProperty').and.callThrough();
        const bootstrap = originalBootstrap.call(adapter);
        const enabling = conference.setE2EEEnabled(true);

        enabling.catch(() => undefined);
        const count = property.calls.count();
        const leave = conference.leave();

        expect(conference.getNativeE2EEState().closed).toBeTrue();
        init.resolve();
        await bootstrap;
        await expectAsync(enabling).toBeRejected();
        await leave;
        expect(property.calls.count()).toBe(count);
        expect(native.jitsiE2EEConferenceSetKey).not.toHaveBeenCalled();
        expect(free).toHaveBeenCalledTimes(1);
        expect(conference.getNativeE2EEState().nativeErrors).toBe(0);
    });

    it('frees an allocated account even when original Olm bootstrap fails', async () => {
        const adapter = (conference as any)._e2eEncryption._keyHandler._olmAdapter;
        const free = jasmine.createSpy('free failed account');

        (window as any).Olm = {
            Account: class {
                create() { throw new Error('Olm account creation failed'); }
                free() { free(); }
            },
            init: () => Promise.resolve()
        };
        adapter._init = new Deferred<void>();
        adapter._init.catch(() => undefined);
        const bootstrap = originalBootstrap.call(adapter);
        const enabling = conference.setE2EEEnabled(true);

        enabling.catch(() => undefined);
        await bootstrap;
        await expectAsync(enabling).toBeRejected();
        await expectAsync(conference.leave()).toBeRejected();
        expect(free).toHaveBeenCalledTimes(1);
        expect(adapter._olmAccount).toBeUndefined();
        expect(native.jitsiE2EEConferenceClose).toHaveBeenCalledTimes(1);
        expect(conference.getNativeE2EEState().callbacksDrained).toBeTrue();
    });

    it('does not report successful key-store disposal when native close rejects', async () => {
        await conference.setE2EEEnabled(true);
        closeResult = () => Promise.resolve(false);
        await expectAsync(conference.leave()).toBeRejected();
        expect(conference.getNativeE2EEState().keysCleared).not.toBeTrue();
        expect(conference.getNativeE2EEState().nativeContexts).not.toBe(0);
        expect(conference.getNativeE2EEState().nativeErrors).toBe(1);
    });

    it('reserves exact receiver ownership before pending native acknowledgment', async () => {
        await conference.setE2EEEnabled(true);
        const tpc = create();
        const peer = tpc.peerconnection as NativePeer;
        const receiver = peer.addTransceiver('audio').receiver as any;
        const context = conference.rtc.getNativeE2EEContext();

        receiver._peerConnectionId = peer._pcId;
        receiver._id = 'private-receiver';
        const first = context.handleReceiver(receiver, 'audio', 'remote');
        const forged = context.handleReceiver(receiver, 'audio', 'other');

        await Promise.allSettled([ first, forged ]);
        expect(context.closed).toBeTrue();
        expect(conference.getNativeE2EEState('other')).toBeNull();
    });

    it('keeps ordinary E2EE-disabled conferences unprotected without opt-in', async () => {
        const creates = native.jitsiE2EEConferenceCreate.calls.count();
        const ordinary = new JitsiConference({ ...conference.options,
            config: { ...conference.options.config, e2ee: { disabled: true } },
            name: 'ordinary-native-room'
        });
        const room = ordinary.room;

        spyOn(room, 'leave').and.callFake(async () => { room.emit(XMPPEvents.MUC_LEFT); });
        const tpc = ordinary.rtc.createPeerConnection(new SignalingLayer(), { iceServers: [] }, false, {
            codecSettings: { codecList: [ CodecMimeType.VP8 ] }, disableRtx: true, disableSimulcast: true
        });

        expect((tpc.peerconnection as NativePeer).protectedConfiguration.jitsiE2EE).toBeUndefined();
        expect(ordinary.getNativeE2EEState()).toBeNull();
        expect(native.jitsiE2EEConferenceCreate.calls.count()).toBe(creates);
        await tpc.close();
        await ordinary.leave();
    });

    it('accepts Android only with the same complete native capability contract', () => {
        expect(() => registerNativeE2EE({
            RTCPeerConnection: NativePeer, crypto, nativeModule: native, platform: 'android'
        })).not.toThrow();
        expect(conference.isE2EESupported()).toBeTrue();
        expect(() => registerNativeE2EE({
            RTCPeerConnection: NativePeer, crypto, nativeModule: {}, platform: 'android'
        })).toThrowError('Native managed E2EE provider unavailable');
    });

    it('rejects replacement peer constructors and disabled or externally managed opt-in', () => {
        window.RTCPeerConnection = Original;
        expect(conference.isE2EESupported()).toBeFalse();
        window.RTCPeerConnection = NativePeer;
        for (const option of [ { disabled: true }, { externallyManagedKey: true } ]) {
            expect(() => new JitsiConference({ ...conference.options,
                config: { ...conference.options.config, e2ee: { nativeManaged: true, ...option } },
                name: 'unsupported-native-room'
            })).toThrowError('Requested native managed E2EE is unsupported');
        }
    });

    it('frees the reusable upstream Olm utility exactly once on native leave', async () => {
        const adapter = (conference as any)._e2eEncryption._keyHandler._olmAdapter;
        const free = jasmine.createSpy('free utility');

        adapter._olmUtility = { free };
        await conference.leave();
        await conference.leave();
        expect(free).toHaveBeenCalledTimes(1);
        expect(adapter._olmUtility).toBeUndefined();
    });

    it('rejects native-managed mode when effective SSRC rewriting is enabled', () => {
        FeatureFlags.init({ ssrcRewritingEnabled: true });
        expect(conference.isE2EESupported()).toBeFalse();
        expect(() => new JitsiConference({ ...conference.options, name: 'unsupported-native-room' }))
            .toThrowError('Requested native managed E2EE is unsupported');
    });
});
