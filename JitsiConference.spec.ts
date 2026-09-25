import { XMPPEvents } from './service/xmpp/XMPPEvents';
import JitsiConference from './JitsiConference';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import JitsiConferenceEventManager from './JitsiConferenceEventManager';
import { P2PFallbackReason } from './modules/qualitycontrol/QualityController';
import { ReceiverAudioController } from './modules/qualitycontrol/ReceiveAudioController';
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
    });
});
