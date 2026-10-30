import { XMPPEvents } from './service/xmpp/XMPPEvents';
import JitsiConference from './JitsiConference';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import JitsiConferenceEventManager from './JitsiConferenceEventManager';
import { JitsiTrackEvents } from './JitsiTrackEvents';
import JitsiRemoteTrack from './modules/RTC/JitsiRemoteTrack';
import { P2PFallbackReason } from './modules/qualitycontrol/QualityController';
import { ReceiverAudioController } from './modules/qualitycontrol/ReceiveAudioController';
import TraceablePeerConnection from './modules/RTC/TraceablePeerConnection';
import EventEmitter, { EventListener } from './modules/util/EventEmitter';
import SignalingLayerImpl from './modules/xmpp/SignalingLayerImpl';
import { MediaType } from './service/RTC/MediaType';
import { RTCEvents } from './service/RTC/RTCEvents';
import { TransportCost } from './service/RTC/TransportCost';
import { MediaConnectivityStatus } from './service/connectivity/MediaConnectivity';

describe('JitsiConference', () => {
    describe('remote track relays across SSRC remaps', () => {
        let activeTPC: TraceablePeerConnection;
        let conference: JitsiConference;
        let levels: jasmine.Spy;
        let mutes: jasmine.Spy;
        let room: EventEmitter;
        let signalingLayer: SignalingLayerImpl;

        function addAudioTrack(owner: string, sourceName: string): JitsiRemoteTrack {
            const track = new JitsiRemoteTrack(
                null, conference, owner, new MediaStream(),
                jasmine.createSpyObj('MediaStreamTrack', [ 'addEventListener' ]),
                MediaType.AUDIO, undefined, 1234, false, false, sourceName);

            conference.onRemoteTrackAdded(track);

            return track;
        }

        // Remaps the track the way the bridge's source map does, through the TRACK_OWNER_SET handler.
        function remap(track: JitsiRemoteTrack, owner?: string, sourceName?: string): void {
            room.emit(JitsiTrackEvents.TRACK_OWNER_SET, track, owner, sourceName, undefined);
        }

        beforeEach(() => {
            activeTPC = Object.create(TraceablePeerConnection.prototype);
            room = new EventEmitter();
            signalingLayer = new SignalingLayerImpl();

            // The real prototype with only the members the relays and the TRACK_OWNER_SET handler use.
            conference = Object.assign(Object.create(JitsiConference.prototype), {
                _remoteTrackRelays: new WeakMap(),
                _signalingLayer: signalingLayer,
                eventEmitter: new EventEmitter(),
                getActivePeerConnection: () => activeTPC,
                getParticipantById: () => undefined,
                isP2PActive: () => false,
                room: {
                    addListener: room.addListener.bind(room),
                    eventEmitter: room,
                    setParticipantPropertyListener: () => { /* no-op */ }
                }
            });
            new JitsiConferenceEventManager(conference).setupChatRoomListeners();

            levels = jasmine.createSpy('levels');
            mutes = jasmine.createSpy('mutes');
            conference.eventEmitter.on(JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED, levels);
            conference.eventEmitter.on(JitsiConferenceEvents.TRACK_MUTE_CHANGED,
                (track: JitsiRemoteTrack) => mutes(track.getParticipantId(), track.isMuted()));
        });

        it('relays audio levels under the current owner', () => {
            const track = addAudioTrack('aaaaaaaa', 'aaaaaaaa-a0');

            track.setAudioLevel(0.2, activeTPC);
            remap(track, 'bbbbbbbb', 'bbbbbbbb-a0');
            track.setAudioLevel(0.4, activeTPC);

            expect(levels.calls.allArgs()).toEqual([ [ 'aaaaaaaa', 0.2 ], [ 'bbbbbbbb', 0.4 ] ]);
        });

        it('relays no audio level while the track has no owner', () => {
            const track = addAudioTrack('aaaaaaaa', 'aaaaaaaa-a0');

            remap(track);
            track.setAudioLevel(0.2, activeTPC);

            expect(levels).not.toHaveBeenCalled();
        });

        it('relays no audio level from a translation the track was remapped to', () => {
            const track = addAudioTrack('aaaaaaaa', 'aaaaaaaa-a0');

            signalingLayer.setSyntheticSourceKind('bbbbbbbb-a0.fr', 'translation');
            remap(track, 'bbbbbbbb', 'bbbbbbbb-a0.fr');
            track.setAudioLevel(0.2, activeTPC);

            expect(levels).not.toHaveBeenCalled();
        });

        it('relays audio levels and mute changes of a speaker a translation track was remapped to', () => {
            signalingLayer.setSyntheticSourceKind('aaaaaaaa-a0.fr', 'translation');
            const track = addAudioTrack('aaaaaaaa', 'aaaaaaaa-a0.fr');

            track.setAudioLevel(0.2, activeTPC);
            remap(track, 'bbbbbbbb', 'bbbbbbbb-a0');
            track.setAudioLevel(0.4, activeTPC);
            track.setMute(true);

            expect(levels.calls.allArgs()).toEqual([ [ 'bbbbbbbb', 0.4 ] ]);
            expect(mutes.calls.allArgs()).toEqual([ [ 'bbbbbbbb', true ] ]);
        });

        it('keeps relaying mute changes when the application strips the track listeners on TRACK_REMOVED', () => {
            const track = addAudioTrack('aaaaaaaa', 'aaaaaaaa-a0');

            conference.eventEmitter.on(JitsiConferenceEvents.TRACK_REMOVED,
                (removed: JitsiRemoteTrack) => removed.removeAllListeners(JitsiTrackEvents.TRACK_MUTE_CHANGED));
            remap(track, 'bbbbbbbb', 'bbbbbbbb-a0');
            track.setMute(true);

            expect(mutes.calls.allArgs()).toEqual([ [ 'bbbbbbbb', true ] ]);
        });

        it('relays each event once however many times the track is remapped', () => {
            const track = addAudioTrack('aaaaaaaa', 'aaaaaaaa-a0');

            remap(track, 'bbbbbbbb', 'bbbbbbbb-a0');
            remap(track, 'aaaaaaaa', 'aaaaaaaa-a0');
            track.setAudioLevel(0.2, activeTPC);
            track.setMute(true);

            expect(levels.calls.allArgs()).toEqual([ [ 'aaaaaaaa', 0.2 ] ]);
            expect(mutes.calls.allArgs()).toEqual([ [ 'aaaaaaaa', true ] ]);
        });
    });

    describe('JitsiConferenceEvents message handling', () => {
        let conference;
        let eventManager;
        let emitterSpy;
        let mockChatRoom;

        beforeEach(() => {
            // Mock ChatRoom with proper listener tracking
            mockChatRoom = {
                addListener: () => {},
                setParticipantPropertyListener: () => {},
                connectionTimes: {},
                xmpp: {
                    connectionTimes: {}
                },
                listeners: new Map()
            };

            // Create minimal mock JitsiConference with all required properties
            conference = {
                room: mockChatRoom,
                eventEmitter: {
                    emit: () => {}
                },
                getParticipantById: () => null,
                xmpp: {
                    addListener: () => {},
                    removeListener: () => {}
                },
                rtc: {
                    addListener: () => {}
                },
                // Additional properties required by JitsiConferenceEventManager
                _onMucJoined: () => {},
                isJvbConnectionInterrupted: false,
                mutedByFocusActor: null,
                isMutedByFocus: false,
                mutedVideoByFocusActor: null,
                isVideoMutedByFocus: false,
                mutedDesktopByFocusActor: null,
                isDesktopMutedByFocus: false,
                onMemberKicked: () => {},
                onSuspendDetected: () => {},
                onMemberJoined: () => {},
                _onMemberBotTypeChanged: () => {},
                onMemberLeft: () => {},
                onDisplayNameChanged: () => {},
                onSilentStatusChanged: () => {},
                onLocalRoleChanged: () => {},
                onUserRoleChanged: () => {},
                authEnabled: false,
                authIdentity: null,
                onRemoteTrackAdded: () => {},
                onRemoteTrackRemoved: () => {},
                lastDominantSpeaker: null,
                dominantSpeakerIsSilent: false,
                statistics: null,
                myUserId: () => 'mockuser',
                options: { config: { startSilent: false } },
                getLocalTracks: () => [],
                onIncomingCall: () => {},
                onCallAccepted: () => {},
                onTransportInfo: () => {},
                onCallEnded: () => {},
                getParticipants: () => []
            };

            emitterSpy = spyOn(conference.eventEmitter, 'emit');
            eventManager = new JitsiConferenceEventManager(conference);
            
            // Mock addListener to capture listeners for testing
            spyOn(mockChatRoom, 'addListener').and.callFake((eventName, listener) => {
                mockChatRoom.listeners.set(eventName, listener);
            });

            // Setup chat room listeners to capture the event handlers
            eventManager.setupChatRoomListeners();
        });

        it('transforms XMPPEvents.MESSAGE_RECEIVED with source=visitor correctly', () => {
            // Get the MESSAGE_RECEIVED listener that was registered
            const messageListener = mockChatRoom.listeners.get(XMPPEvents.MESSAGE_RECEIVED);
            expect(messageListener).toBeDefined();

            // Simulate ChatRoom firing MESSAGE_RECEIVED event with display-name extension source='visitor'
            messageListener(
                'participant@example.com/resource', // jid
                'Hello from visitor',                // txt
                'myroom@conference.example.com',     // myJid
                1234567890,                          // ts
                'Visitor Name',                      // displayName
                true,                                // isVisitor
                'msg123',                           // messageId
                undefined,                          // source (undefined for visitor)
                undefined                           // replyToId
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                'resource',              // participantId (resource from jid)
                'Hello from visitor',    // txt
                1234567890,             // ts
                'Visitor Name',         // displayName
                true,                   // isVisitor
                'msg123',              // messageId
                undefined,             // source (undefined for visitor)
                undefined              // replyToId
            );
        });

        it('transforms XMPPEvents.MESSAGE_RECEIVED with source=token correctly', () => {
            // Get the MESSAGE_RECEIVED listener that was registered
            const messageListener = mockChatRoom.listeners.get(XMPPEvents.MESSAGE_RECEIVED);
            expect(messageListener).toBeDefined();

            // Simulate ChatRoom firing MESSAGE_RECEIVED event with display-name extension source='token'
            messageListener(
                'participant@example.com/resource', // jid
                'Hello from token user',             // txt
                'myroom@conference.example.com',     // myJid
                1234567890,                          // ts
                'Token User',                        // displayName
                false,                               // isVisitor
                'msg124',                           // messageId
                'token',                            // source
                undefined                           // replyToId
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                'resource',              // participantId (resource from jid)
                'Hello from token user', // txt
                1234567890,             // ts
                'Token User',           // displayName
                false,                  // isVisitor
                'msg124',              // messageId
                'token',               // source
                undefined              // replyToId
            );
        });

        it('transforms XMPPEvents.MESSAGE_RECEIVED with source=guest correctly', () => {
            // Get the MESSAGE_RECEIVED listener that was registered
            const messageListener = mockChatRoom.listeners.get(XMPPEvents.MESSAGE_RECEIVED);
            expect(messageListener).toBeDefined();

            // Simulate ChatRoom firing MESSAGE_RECEIVED event with display-name extension source='guest'
            messageListener(
                'participant@example.com/resource', // jid
                'Hello from guest user',             // txt
                'myroom@conference.example.com',     // myJid
                1234567891,                          // ts
                'Guest User',                        // displayName
                false,                               // isVisitor
                'msg125',                           // messageId
                'guest',                            // source
                undefined                           // replyToId
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                'resource',              // participantId (resource from jid)
                'Hello from guest user', // txt
                1234567891,             // ts
                'Guest User',           // displayName
                false,                  // isVisitor
                'msg125',              // messageId
                'guest',               // source
                undefined              // replyToId
            );
        });

        it('transforms XMPPEvents.MESSAGE_RECEIVED without display-name extension correctly', () => {
            // Get the MESSAGE_RECEIVED listener that was registered
            const messageListener = mockChatRoom.listeners.get(XMPPEvents.MESSAGE_RECEIVED);
            expect(messageListener).toBeDefined();

            // Simulate ChatRoom firing MESSAGE_RECEIVED event without display-name extension
            messageListener(
                'participant@example.com/resource', // jid
                'Hello regular message',             // txt
                'myroom@conference.example.com',     // myJid
                1234567892,                          // ts
                undefined,                           // displayName
                false,                               // isVisitor
                'msg126',                           // messageId
                undefined,                          // source
                undefined                           // replyToId
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                'resource',              // participantId
                'Hello regular message', // txt
                1234567892,             // ts
                undefined,              // displayName
                false,                  // isVisitor
                'msg126',              // messageId
                undefined,             // source
                undefined              // replyToId
            );
        });

        it('transforms XMPPEvents.PRIVATE_MESSAGE_RECEIVED with visitor correctly', () => {
            // Get the PRIVATE_MESSAGE_RECEIVED listener that was registered
            const privateMessageListener = mockChatRoom.listeners.get(XMPPEvents.PRIVATE_MESSAGE_RECEIVED);
            expect(privateMessageListener).toBeDefined();

            // Simulate ChatRoom firing PRIVATE_MESSAGE_RECEIVED event for visitor
            privateMessageListener(
                'participant@example.com/resource', // jid
                'Private message from visitor',     // txt
                'myroom@conference.example.com',     // myJid
                1234567893,                          // ts
                'msg127',                           // messageId
                'Visitor Name',                     // displayName
                true,                               // isVisitor
                'original@visitor.com',             // ofrom (originalFrom)
                undefined                           // replyToId
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.PRIVATE_MESSAGE_RECEIVED,
                'original@visitor.com',         // participantId (ofrom for visitor)
                'Private message from visitor', // txt
                1234567893,                    // ts
                'msg127',                     // messageId
                'Visitor Name',               // displayName
                true,                         // isVisitor
                undefined                     // replyToId
            );
        });

        it('transforms XMPPEvents.PRIVATE_MESSAGE_RECEIVED without visitor correctly', () => {
            // Get the PRIVATE_MESSAGE_RECEIVED listener that was registered
            const privateMessageListener = mockChatRoom.listeners.get(XMPPEvents.PRIVATE_MESSAGE_RECEIVED);
            expect(privateMessageListener).toBeDefined();

            // Simulate ChatRoom firing PRIVATE_MESSAGE_RECEIVED event for regular participant
            privateMessageListener(
                'participant@example.com/resource', // jid
                'Private message from regular',     // txt
                'myroom@conference.example.com',     // myJid
                1234567894,                          // ts
                'msg128',                           // messageId
                undefined,                          // displayName
                false,                              // isVisitor
                undefined,                          // ofrom
                undefined                           // replyToId
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.PRIVATE_MESSAGE_RECEIVED,
                'resource',                     // participantId (resource from jid)
                'Private message from regular', // txt
                1234567894,                    // ts
                'msg128',                     // messageId
                undefined,                    // displayName
                false,                        // isVisitor
                undefined                     // replyToId
            );
        });
    });

    describe('media connectivity', () => {
        const proto = JitsiConference.prototype as any;
        const assessment = (status: MediaConnectivityStatus) => ({ status });
        let conference;
        let jvb;
        let p2p;

        beforeEach(() => {
            jvb = { getMediaConnectivity: () => assessment(MediaConnectivityStatus.AT_RISK) };
            p2p = { getMediaConnectivity: () => undefined };
            conference = {
                _maybeEmitMediaConnectivity: proto._maybeEmitMediaConnectivity,
                eventEmitter: { emit: jasmine.createSpy('emit') },
                getActiveMediaSession: () => (conference.p2p ? p2p : jvb),
                p2p: false
            };
        });

        const onChanged = session => proto._onMediaConnectivityChanged.call(conference, session);

        it('forwards only the active session, once per assessment', () => {
            onChanged(p2p);
            onChanged(jvb);
            onChanged(jvb);

            expect(conference.eventEmitter.emit.calls.allArgs()).toEqual([
                [ JitsiConferenceEvents.MEDIA_CONNECTIVITY_CHANGED, assessment(MediaConnectivityStatus.AT_RISK) ]
            ]);
        });

        it('keeps a failure through restarted sessions until one connects', () => {
            const { AT_RISK, FAILED, GOOD } = MediaConnectivityStatus;

            for (const status of [ AT_RISK, FAILED, AT_RISK, FAILED, AT_RISK, GOOD ]) {
                jvb = { getMediaConnectivity: () => assessment(status) };
                onChanged(jvb);
            }

            expect(conference.eventEmitter.emit.calls.allArgs().map(([ , e ]) => e.status))
                .toEqual([ AT_RISK, FAILED, GOOD ]);
            expect(proto.getMediaConnectivity.call(conference)).toEqual(assessment(GOOD));
        });

        it('keeps the last assessment until the newly active session reports one', () => {
            onChanged(jvb);
            conference.p2p = true;
            proto._maybeEmitMediaConnectivity.call(conference);

            expect(conference.eventEmitter.emit).toHaveBeenCalledTimes(1);
            expect(proto.getMediaConnectivity.call(conference)).toEqual(assessment(MediaConnectivityStatus.AT_RISK));

            p2p.getMediaConnectivity = () => assessment(MediaConnectivityStatus.GOOD);
            onChanged(p2p);

            expect(conference.eventEmitter.emit).toHaveBeenCalledWith(
                JitsiConferenceEvents.MEDIA_CONNECTIVITY_CHANGED, assessment(MediaConnectivityStatus.GOOD));
        });
    });

    describe('P2P quality fallback', () => {
        // The methods under test only touch their own instance state, so they are exercised against a minimal
        // stand-in rather than a fully constructed conference.
        const proto = JitsiConference.prototype as any;

        describe('_shouldBeInP2PMode', () => {
            const makeConference = (latched: boolean) => ({
                _buildDesiredTranslations: () => new Map(),
                _hasVisitors: false,
                _p2pFallbackLatched: latched,
                _transcribingEnabled: false,
                getParticipants: () => [ {
                    getBotType: () => undefined,
                    hasFeature: () => false
                } ],

                // The merged _shouldBeInP2PMode also checks for an active voice-agent subscription.
                qualityController: {
                    audioController: {
                        getServiceIncludes: () => []
                    }
                }
            });

            it('allows p2p with a single peer before any fallback', () => {
                expect(proto._shouldBeInP2PMode.call(makeConference(false))).toBe(true);
            });

            it('blocks p2p once the fallback has latched', () => {
                expect(proto._shouldBeInP2PMode.call(makeConference(true))).toBe(false);
            });
        });

        describe('_onIceConnectionInterrupted', () => {
            const make = (overrides = {}) => {
                const session = { isP2P: true };

                return {
                    conference: {
                        eventEmitter: { emit: emitSpy },
                        isP2PActive: () => true,
                        p2pJingleSession: session,
                        ...overrides
                    },
                    session
                };
            };

            let emitSpy;

            beforeEach(() => {
                emitSpy = jasmine.createSpy('emit');
            });

            // P2P ICE is not given time to recover: resuming the JVB is local only, so the fallback is immediate.
            it('signals a fallback as soon as p2p ICE is interrupted', () => {
                const { conference, session } = make();

                proto._onIceConnectionInterrupted.call(conference, session);

                expect(emitSpy).toHaveBeenCalledWith(
                    JitsiConferenceEvents._P2P_FALLBACK_NEEDED, P2PFallbackReason.ICE_DISCONNECTED);
                expect(conference.isP2PConnectionInterrupted).toBe(true);
            });

            // The fallback is unconditional, so there is no configuration that can turn it off.
            it('signals even for a conference with no p2p configuration', () => {
                const { conference, session } = make({ options: { config: {} } });

                proto._onIceConnectionInterrupted.call(conference, session);

                expect(emitSpy).toHaveBeenCalledWith(
                    JitsiConferenceEvents._P2P_FALLBACK_NEEDED, P2PFallbackReason.ICE_DISCONNECTED);
            });

            // A terminated session can still emit an interruption after it has been replaced.
            it('does not signal for a session that is no longer the current one', () => {
                const { conference, session } = make({ p2pJingleSession: { isP2P: true } });

                proto._onIceConnectionInterrupted.call(conference, session);

                expect(emitSpy).not.toHaveBeenCalledWith(
                    JitsiConferenceEvents._P2P_FALLBACK_NEEDED, P2PFallbackReason.ICE_DISCONNECTED);
            });

            it('does not signal for the jvb session', () => {
                const { conference } = make();

                proto._onIceConnectionInterrupted.call(conference, { isP2P: false });

                expect(emitSpy).not.toHaveBeenCalledWith(
                    JitsiConferenceEvents._P2P_FALLBACK_NEEDED, P2PFallbackReason.ICE_DISCONNECTED);
                expect(conference.isJvbConnectionInterrupted).toBe(true);
            });
        });

        describe('_checkP2PTransportCost', () => {
            const { DIRECT, RELAY_TCP, RELAY_UDP } = TransportCost;
            const make = (p2pCost, jvbCost, overrides = {}) => {
                const tpc = { getSelectedTransportCost: () => p2pCost };

                return {
                    conference: {
                        _p2pTcpRelaySamples: 0,
                        eventEmitter: { emit: emitSpy },
                        jvbJingleSession: { peerconnection: { getSelectedTransportCost: () => jvbCost } },
                        p2pJingleSession: { peerconnection: tpc },
                        ...overrides
                    },
                    tpc
                };
            };

            let emitSpy;

            beforeEach(() => {
                emitSpy = jasmine.createSpy('emit');
            });

            // Relative on purpose: only worth abandoning p2p when the bridge has a better path. A null cost is the
            // pre-first-poll and the cannot-determine case, and is retried on the next poll.
            const costs: [string, Nullable<TransportCost>, Nullable<TransportCost>, boolean][] = [
                [ 'p2p is tcp relayed and the jvb is direct', RELAY_TCP, DIRECT, true ],
                [ 'p2p is tcp relayed and the jvb is udp relayed', RELAY_TCP, RELAY_UDP, true ],
                [ 'both legs are tcp relayed', RELAY_TCP, RELAY_TCP, false ],
                [ 'the p2p path is not tcp relayed', RELAY_UDP, DIRECT, false ],
                [ 'the jvb cost is undetermined', RELAY_TCP, null, false ],
                [ 'the p2p cost is undetermined', null, DIRECT, false ]
            ];

            costs.forEach(([ name, p2pCost, jvbCost, fallsBack ]) => {
                it(`${fallsBack ? 'falls back' : 'does not fall back'} when ${name}`, () => {
                    const { conference, tpc } = make(p2pCost, jvbCost);

                    // The cost has to hold, so drive enough samples for the streak to complete.
                    proto._checkP2PTransportCost.call(conference, tpc);
                    proto._checkP2PTransportCost.call(conference, tpc);

                    if (fallsBack) {
                        expect(emitSpy).toHaveBeenCalledOnceWith(
                            JitsiConferenceEvents._P2P_FALLBACK_NEEDED, P2PFallbackReason.TCP_RELAY);
                    } else {
                        expect(emitSpy).not.toHaveBeenCalled();
                    }
                });
            });

            it('does not fall back on the first sample', () => {
                const { conference, tpc } = make(RELAY_TCP, DIRECT);

                proto._checkP2PTransportCost.call(conference, tpc);

                expect(emitSpy).not.toHaveBeenCalled();
            });

            // ICE can still be on the pair that got the session connected when the first sample is taken, so a
            // single reading must not be enough to abandon the session.
            it('starts the streak over when a sample shows p2p is no longer the costlier path', () => {
                const { conference, tpc } = make(RELAY_TCP, DIRECT);
                let p2pCost = RELAY_TCP;

                tpc.getSelectedTransportCost = () => p2pCost;

                proto._checkP2PTransportCost.call(conference, tpc);
                p2pCost = RELAY_UDP;
                proto._checkP2PTransportCost.call(conference, tpc);
                p2pCost = RELAY_TCP;
                proto._checkP2PTransportCost.call(conference, tpc);

                expect(emitSpy).not.toHaveBeenCalled();
            });

            it('does not count an undetermined cost against the streak', () => {
                const { conference, tpc } = make(RELAY_TCP, DIRECT);
                let p2pCost: Nullable<TransportCost> = RELAY_TCP;

                tpc.getSelectedTransportCost = () => p2pCost;

                proto._checkP2PTransportCost.call(conference, tpc);
                p2pCost = null;
                proto._checkP2PTransportCost.call(conference, tpc);
                p2pCost = RELAY_TCP;
                proto._checkP2PTransportCost.call(conference, tpc);

                expect(emitSpy).toHaveBeenCalledOnceWith(
                    JitsiConferenceEvents._P2P_FALLBACK_NEEDED, P2PFallbackReason.TCP_RELAY);
            });

            // Guards that short-circuit before either cost is read.
            const guards: [string, object][] = [
                [ 'there is no jvb session to compare against', { jvbJingleSession: null } ],
                [ 'p2p is no longer active', { p2pJingleSession: null } ]
            ];

            guards.forEach(([ name, overrides ]) => {
                it(`does not fall back when ${name}`, () => {
                    const { conference, tpc } = make(RELAY_TCP, DIRECT, overrides);

                    proto._checkP2PTransportCost.call(conference, tpc);

                    expect(emitSpy).not.toHaveBeenCalled();
                });
            });

            // The collector reports for every peerconnection, so the jvb's own poll must not be read as p2p's.
            it('ignores a report from a peer connection that is not the p2p one', () => {
                const { conference } = make(RELAY_TCP, DIRECT);

                proto._checkP2PTransportCost.call(conference, { getSelectedTransportCost: () => DIRECT });

                expect(emitSpy).not.toHaveBeenCalled();
            });
        });

    });

    describe('audio subscriptions (translation + voice agents)', () => {
        let conference: any;
        let sent: any[];

        const participant = (id: string) => ({
            getBotType: () => undefined,
            getId: () => id,
            hasFeature: () => false
        });
        const lastInclude = () => sent[sent.length - 1].include.sort();

        beforeEach(() => {
            sent = [];

            // A fake conference over the REAL prototype (so the real translation/agent subscription wiring
            // runs) with a REAL ReceiverAudioController over a captured bridge channel. Only the XMPP
            // request stanza is stubbed out.
            conference = Object.create(JitsiConference.prototype);
            conference._receiverTranslationLanguage = null;
            conference._participantTranslationLanguages = new Map();
            conference._translationRequests = new Map();
            conference.getParticipants = () => [ participant('aaaaaaaa'), participant('bbbbbbbb') ];
            conference._sendTranslationRequestStanza = () => true;

            // P2P management (translation forces JVB) is out of scope here and needs a full conference.
            conference._maybeStartOrStopP2P = () => { /* stubbed */ };
            conference.qualityController = {
                audioController: new ReceiverAudioController({
                    rtc: { sendReceiverAudioSubscriptionMessage: (message: any) => sent.push(message) }
                } as any)
            };
        });

        it('subscribes to every speaker\'s translated source for the default language', () => {
            conference.setReceiverTranslationLanguage('en');

            expect(lastInclude()).toEqual([ 'aaaaaaaa-a0.en', 'bbbbbbbb-a0.en' ]);
            expect(sent[sent.length - 1].all).toBe(true);
        });

        it('honors a per-participant language override', () => {
            conference.setReceiverTranslationLanguage('en');
            conference.setParticipantTranslationLanguage('aaaaaaaa', 'de');

            expect(lastInclude()).toEqual([ 'aaaaaaaa-a0.de', 'bbbbbbbb-a0.en' ]);
        });

        it('clearTranslation empties the translation subscription', () => {
            conference.setReceiverTranslationLanguage('en');
            conference.clearTranslation();

            expect(lastInclude()).toEqual([]);
        });

        it('translation and voice-agent subscriptions co-exist', () => {
            conference.setReceiverTranslationLanguage('en');
            conference.setAgentAudioSubscription([ 'agent001-a0' ]);

            expect(lastInclude()).toEqual([ 'aaaaaaaa-a0.en', 'agent001-a0', 'bbbbbbbb-a0.en' ]);
        });

        it('clearing translation keeps the agent subscription intact', () => {
            conference.setReceiverTranslationLanguage('en');
            conference.setAgentAudioSubscription([ 'agent001-a0' ]);
            conference.clearTranslation();

            expect(lastInclude()).toEqual([ 'agent001-a0' ]);
        });

        it('unsubscribing agents keeps the translation subscription intact', () => {
            conference.setReceiverTranslationLanguage('en');
            conference.setAgentAudioSubscription([ 'agent001-a0' ]);
            conference.setAgentAudioSubscription([]);

            expect(lastInclude()).toEqual([ 'aaaaaaaa-a0.en', 'bbbbbbbb-a0.en' ]);
        });

        it('an active agent subscription forces JVB (no P2P), like translation does', () => {
            // P2P is only ever a 1:1 topology.
            conference.getParticipants = () => [ participant('aaaaaaaa') ];

            expect(conference._shouldBeInP2PMode()).toBe(true);

            conference.setAgentAudioSubscription([ 'agent001-a0' ]);
            expect(conference._shouldBeInP2PMode()).toBe(false);

            conference.setAgentAudioSubscription([]);
            expect(conference._shouldBeInP2PMode()).toBe(true);

            conference.setReceiverTranslationLanguage('en');
            expect(conference._shouldBeInP2PMode()).toBe(false);
        });

        it('an agent advertised in room metadata forces JVB before anyone subscribes', () => {
            conference.getParticipants = () => [ participant('aaaaaaaa') ];

            conference._setVoiceAgents({ 'agent-support': { state: 'provisioning' } });
            expect(conference._shouldBeInP2PMode()).toBe(false);

            conference._setVoiceAgents(undefined);
            expect(conference._shouldBeInP2PMode()).toBe(true);
        });

        it('a failed or ended agent does not count as advertised', () => {
            conference.getParticipants = () => [ participant('aaaaaaaa') ];

            conference._setVoiceAgents({ 'agent-support': { state: 'failed' } });
            expect(conference._shouldBeInP2PMode()).toBe(true);

            conference._setVoiceAgents({ 'agent-support': { state: 'ended' } });
            expect(conference._shouldBeInP2PMode()).toBe(true);
        });

        it('re-evaluates P2P when the first agent appears, but not when the last one leaves', () => {
            const p2pSpy = spyOn(conference, '_maybeStartOrStopP2P');

            conference._setVoiceAgents({ 'agent-support': { state: 'connecting' } });
            conference._setVoiceAgents({ 'agent-support': { state: 'active' } });
            expect(p2pSpy).toHaveBeenCalledTimes(1);

            conference._setVoiceAgents({});
            expect(p2pSpy).toHaveBeenCalledTimes(1);
        });

        it('subscribing agent audio triggers the P2P re-evaluation', () => {
            const p2pSpy = spyOn(conference, '_maybeStartOrStopP2P');

            conference.setAgentAudioSubscription([ 'agent001-a0' ]);

            expect(p2pSpy).toHaveBeenCalled();
        });

        it('does not re-evaluate P2P when the last agent unsubscribes (stays on JVB)', () => {
            conference.setAgentAudioSubscription([ 'agent001-a0' ]);
            const p2pSpy = spyOn(conference, '_maybeStartOrStopP2P');

            conference.setAgentAudioSubscription([]);

            expect(p2pSpy).not.toHaveBeenCalled();
        });

        describe('on bridge channel (re)open', () => {
            let onChannelOpen: () => void;

            beforeEach(() => {
                // The real listener registration over a captured RTC, so a (re)opened channel can be simulated.
                conference.options = { config: {} };
                conference.rtc = {
                    addListener: (event: string, listener: () => void) => {
                        if (event === RTCEvents.DATA_CHANNEL_OPEN) {
                            onChannelOpen = listener;
                        }
                    },
                    localTracks: []
                };
                conference._registerRtcListeners(conference.rtc);
            });

            it('re-sends a voice-agent subscription even without audio translation', () => {
                conference.setAgentAudioSubscription([ 'agent001-a0' ]);
                const sentBefore = sent.length;

                onChannelOpen();

                expect(sent.length).toBe(sentBefore + 1);
                expect(sent[sent.length - 1].all).toBe(true);
                expect(lastInclude()).toEqual([ 'agent001-a0' ]);
            });

            it('re-sends a translation subscription even without the audio-translation config', () => {
                conference.setReceiverTranslationLanguage('en');
                const sentBefore = sent.length;

                onChannelOpen();

                expect(sent.length).toBe(sentBefore + 1);
                expect(lastInclude()).toEqual([ 'aaaaaaaa-a0.en', 'bbbbbbbb-a0.en' ]);
            });

            it('leaves the bridge default untouched when nothing is subscribed', () => {
                onChannelOpen();

                expect(sent.length).toBe(0);
            });

            it('re-sends the default subscription when audio translation is enabled', () => {
                conference.options = { config: { audioTranslation: { enabled: true } } };

                onChannelOpen();

                expect(sent.length).toBe(1);
                expect(sent[0]).toEqual({ all: true, exclude: [], include: [] });
            });
        });
    });

    describe('synthetic source kinds', () => {
        let conference: any;
        let emitted: any[][];
        let onSendingChanged: (change: any) => void;

        const payloadsOf = (event: string) => emitted.filter(([ name ]) => name === event).map(([ , payload ]) => payload);
        const activeTPC = Object.create(TraceablePeerConnection.prototype);
        const remoteTrack = (sourceName: string) => {
            const listeners = new Map<string, EventListener>();

            return {
                addCancellableListener: (event: string, listener: EventListener) => {
                    listeners.set(event, listener);

                    return () => listeners.delete(event);
                },
                fire: (event: string, ...args: Parameters<EventListener>) => listeners.get(event)?.(...args),
                getParticipantId: () => 'abcdef12',
                getSourceName: () => sourceName,
                isAudioTrack: () => true,
                isP2P: false
            };
        };
        const relayedFrom = (track: ReturnType<typeof remoteTrack>) => {
            track.fire(JitsiTrackEvents.TRACK_MUTE_CHANGED, track);
            track.fire(JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED, 0.5, activeTPC);

            return [
                ...payloadsOf(JitsiConferenceEvents.TRACK_MUTE_CHANGED),
                ...payloadsOf(JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED)
            ];
        };

        beforeEach(() => {
            emitted = [];

            // The real prototype over a real signaling layer, with the event manager's RTC listeners captured
            // so bridge-channel events can be simulated.
            conference = Object.create(JitsiConference.prototype);
            conference._remoteTrackRelays = new WeakMap();
            conference._signalingLayer = new SignalingLayerImpl();
            conference.eventEmitter = { emit: (...args: any[]) => emitted.push(args) };
            conference.getParticipantById = () => undefined;
            conference.getActivePeerConnection = () => activeTPC;
            conference.isP2PActive = () => false;
            conference.rtc = {
                addListener: (event: string, listener: (...args: any[]) => void) => {
                    if (event === RTCEvents.TRANSLATED_SOURCE_SENDING_CHANGED) {
                        onSendingChanged = listener;
                    }
                }
            };
            new JitsiConferenceEventManager(conference).setupRTCListeners();
        });

        it('getSyntheticSourceKind exposes the bridge-signaled kind', () => {
            conference._signalingLayer.setSyntheticSourceKind('agent-0dae1739-a0', 'agent');
            conference._signalingLayer.setSyntheticSourceKind('abcdef12-a0.en', 'translation');

            expect(conference.getSyntheticSourceKind('agent-0dae1739-a0')).toBe('agent');
            expect(conference.getSyntheticSourceKind('abcdef12-a0.en')).toBe('translation');
            expect(conference.getSyntheticSourceKind('abcdef12-a0')).toBeUndefined();
        });

        describe('SYNTHETIC_SOURCE_SENDING_CHANGED', () => {
            it('carries the kind from the bridge event', () => {
                onSendingChanged({ kind: 'agent', sending: true, sourceName: 'agent-0dae1739-a0', timestamp: 1 });

                expect(payloadsOf(JitsiConferenceEvents.SYNTHETIC_SOURCE_SENDING_CHANGED)).toEqual([ {
                    kind: 'agent',
                    sending: true,
                    sourceName: 'agent-0dae1739-a0',
                    timestamp: 1
                } ]);
            });

            it('falls back to the kind recorded from the sources map', () => {
                conference._signalingLayer.setSyntheticSourceKind('abcdef12-a0.en', 'translation');

                onSendingChanged({ sending: false, sourceName: 'abcdef12-a0.en', timestamp: 2 });

                expect(payloadsOf(JitsiConferenceEvents.SYNTHETIC_SOURCE_SENDING_CHANGED)).toEqual([ {
                    kind: 'translation',
                    sending: false,
                    sourceName: 'abcdef12-a0.en',
                    timestamp: 2
                } ]);
            });

            it('prefers the kind in the event over the recorded one', () => {
                conference._signalingLayer.setSyntheticSourceKind('abcdef12-a0.en', 'translation');

                onSendingChanged({ kind: 'agent', sending: true, sourceName: 'abcdef12-a0.en', timestamp: 3 });

                expect(payloadsOf(JitsiConferenceEvents.SYNTHETIC_SOURCE_SENDING_CHANGED)[0].kind).toBe('agent');
            });

            it('leaves the kind undefined when neither the event nor the sources map carried one', () => {
                onSendingChanged({ sending: true, sourceName: 'abcdef12-a0.en', timestamp: 4 });

                const [ payload ] = payloadsOf(JitsiConferenceEvents.SYNTHETIC_SOURCE_SENDING_CHANGED);

                expect(payload.kind).toBeUndefined();
                expect(payload.sourceName).toBe('abcdef12-a0.en');
                expect(payload.sending).toBe(true);
            });

            it('sends the same payload on the deprecated alias', () => {
                onSendingChanged({ kind: 'agent', sending: true, sourceName: 'agent-0dae1739-a0', timestamp: 5 });

                expect(payloadsOf(JitsiConferenceEvents.TRANSLATED_SOURCE_SENDING_CHANGED))
                    .toEqual(payloadsOf(JitsiConferenceEvents.SYNTHETIC_SOURCE_SENDING_CHANGED));
            });
        });

        describe('onRemoteTrackAdded', () => {
            it('skips the mute/audio-level relay for a track the bridge marked as translation, whatever its name', () => {
                conference._signalingLayer.setSyntheticSourceKind('abcdef12-a1', 'translation');
                const track = remoteTrack('abcdef12-a1');

                conference.onRemoteTrackAdded(track);

                expect(relayedFrom(track)).toEqual([]);
                expect(payloadsOf(JitsiConferenceEvents.TRACK_ADDED)).toEqual([ track ]);
            });

            it('keeps the relay for a track the bridge marked as agent', () => {
                conference._signalingLayer.setSyntheticSourceKind('agent-0dae1739-a0', 'agent');
                const track = remoteTrack('agent-0dae1739-a0');

                conference.onRemoteTrackAdded(track);

                expect(relayedFrom(track)).toEqual([ track, 'abcdef12' ]);
            });

            it('falls back to the language-suffix heuristic when the bridge sent no kind', () => {
                const translated = remoteTrack('abcdef12-a0.en');

                conference.onRemoteTrackAdded(translated);
                expect(relayedFrom(translated)).toEqual([]);

                const regular = remoteTrack('abcdef12-a0');

                conference.onRemoteTrackAdded(regular);
                expect(relayedFrom(regular)).toEqual([ regular, 'abcdef12' ]);
            });
        });
    });
});
