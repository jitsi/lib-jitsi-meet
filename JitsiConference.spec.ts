import { XMPPEvents } from './service/xmpp/XMPPEvents';
import JitsiConference from './JitsiConference';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import JitsiConferenceEventManager from './JitsiConferenceEventManager';
import { P2PFallbackReason } from './modules/qualitycontrol/QualityController';
import { TransportCost } from './service/RTC/TransportCost';

describe('JitsiConference', () => {
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
                } ]
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

                    proto._checkP2PTransportCost.call(conference, tpc);

                    if (fallsBack) {
                        expect(emitSpy).toHaveBeenCalledOnceWith(
                            JitsiConferenceEvents._P2P_FALLBACK_NEEDED, P2PFallbackReason.TCP_RELAY);
                    } else {
                        expect(emitSpy).not.toHaveBeenCalled();
                    }
                });
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
});
