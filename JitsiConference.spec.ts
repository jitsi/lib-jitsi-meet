import { XMPPEvents } from './service/xmpp/XMPPEvents';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import JitsiConferenceEventManager from './JitsiConferenceEventManager';

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
                undefined                           // source (undefined for visitor)
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                'resource',              // participantId (resource from jid)
                'Hello from visitor',    // txt
                1234567890,             // ts
                'Visitor Name',         // displayName
                true,                   // isVisitor
                'msg123',              // messageId
                undefined              // source (undefined for visitor)
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
                'token'                             // source
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                'resource',              // participantId (resource from jid)
                'Hello from token user', // txt
                1234567890,             // ts
                'Token User',           // displayName
                false,                  // isVisitor
                'msg124',              // messageId
                'token'                // source
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
                'guest'                             // source
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                'resource',              // participantId (resource from jid)
                'Hello from guest user', // txt
                1234567891,             // ts
                'Guest User',           // displayName
                false,                  // isVisitor
                'msg125',              // messageId
                'guest'                // source
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
                undefined                           // source
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                'resource',              // participantId
                'Hello regular message', // txt
                1234567892,             // ts
                undefined,              // displayName
                false,                  // isVisitor
                'msg126',              // messageId
                undefined              // source
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
                'original@visitor.com'              // ofrom (originalFrom)
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.PRIVATE_MESSAGE_RECEIVED,
                'original@visitor.com',         // participantId (ofrom for visitor)
                'Private message from visitor', // txt
                1234567893,                    // ts
                'msg127',                     // messageId
                'Visitor Name',               // displayName
                true                          // isVisitor
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
                undefined                           // ofrom
            );

            expect(emitterSpy).toHaveBeenCalledWith(
                JitsiConferenceEvents.PRIVATE_MESSAGE_RECEIVED,
                'resource',                     // participantId (resource from jid)
                'Private message from regular', // txt
                1234567894,                    // ts
                'msg128',                     // messageId
                undefined,                    // displayName
                false                         // isVisitor
            );
        });
    });
});