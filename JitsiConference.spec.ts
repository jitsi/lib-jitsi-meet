import { XMPPEvents } from './service/xmpp/XMPPEvents';
import JitsiConference from './JitsiConference';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import JitsiConferenceEventManager from './JitsiConferenceEventManager';
import { ReceiverAudioController } from './modules/qualitycontrol/ReceiveAudioController';

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
    });
});