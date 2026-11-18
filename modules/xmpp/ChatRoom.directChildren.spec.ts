import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import ChatRoom from './ChatRoom';
import Moderator from './moderator';
import XmppConnection from './XmppConnection';

declare let spyOn: (object: any, method: string) => jasmine.Spy;

/* eslint-disable max-len */

/**
 * Parses an XML string into the root element.
 *
 * @param {string} xml - The XML.
 * @returns {Element}
 */
function parse(xml: string): Element {
    return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('ChatRoom - elements that are read as direct children', () => {
    let room: ChatRoom;
    let emitterSpy: jasmine.Spy;

    /**
     * Creates the room with the given options.
     *
     * @param {Object} options - The options of the room.
     * @returns {void}
     */
    function createRoom(options: Record<string, any> = {}): void {
        const xmpp = {
            moderator: new Moderator({ options: {} } as any),
            options: {},
            addListener: () => {} // eslint-disable-line no-empty-function
        };

        room = new ChatRoom({} as XmppConnection, 'jid', 'password', xmpp as any, options);
        emitterSpy = spyOn(room.eventEmitter, 'emit');
    }

    describe('onPresence with a transcription-status node', () => {
        beforeEach(() => createRoom({ hiddenDomain: 'recorder.example.org' }));

        it('does not throw when the presence has no features node', () => {
            const pres = parse('' +
                '<presence to="tojid" from="fromjid">' +
                    '<x xmlns="http://jabber.org/protocol/muc#user">' +
                        '<item jid="rec@recorder.example.org/res" affiliation="member" role="participant"/>' +
                    '</x>' +
                    '<transcription-status status="on"/>' +
                '</presence>');

            expect(() => room.onPresence(pres)).not.toThrow();
            expect(emitterSpy).not.toHaveBeenCalledWith(
                XMPPEvents.TRANSCRIPTION_STATUS_CHANGED, jasmine.anything(), jasmine.anything());
        });

        it('does not throw when a member without a features node leaves', () => {
            const joined = parse('' +
                '<presence to="tojid" from="fromjid">' +
                    '<x xmlns="http://jabber.org/protocol/muc#user">' +
                        '<item jid="rec@recorder.example.org/res" affiliation="member" role="participant"/>' +
                    '</x>' +
                '</presence>');

            room.onPresence(joined);

            const left = parse('<presence to="tojid" from="fromjid" type="unavailable"/>');

            expect(() => room.onPresenceUnavailable(left, 'fromjid')).not.toThrow();
        });
    });

    describe('onPresenceUnavailable', () => {
        beforeEach(() => createRoom());

        it('reads flip_device only as a direct child of the presence', () => {
            const pres = parse('' +
                '<presence to="tojid" from="fromjid" type="unavailable">' +
                    '<extension xmlns="urn:example:extension"><flip_device/></extension>' +
                    '<x xmlns="http://jabber.org/protocol/muc#user">' +
                        '<item affiliation="none" role="none"/>' +
                        '<status code="307"/>' +
                    '</x>' +
                '</presence>');

            room.onPresenceUnavailable(pres, 'fromjid');

            expect(emitterSpy.calls.allArgs().find(args => args[0] === XMPPEvents.KICKED)[5]).toBe(false);
        });

        it('reads flip_device as a direct child of the presence', () => {
            const pres = parse('' +
                '<presence to="tojid" from="fromjid" type="unavailable">' +
                    '<flip_device/>' +
                    '<x xmlns="http://jabber.org/protocol/muc#user">' +
                        '<item affiliation="none" role="none"/>' +
                        '<status code="307"/>' +
                    '</x>' +
                '</presence>');

            room.onPresenceUnavailable(pres, 'fromjid');

            expect(emitterSpy.calls.allArgs().find(args => args[0] === XMPPEvents.KICKED)[5]).toBe(true);
        });
    });

    describe('onMessage', () => {
        beforeEach(() => createRoom());

        it('takes the reply address of a visitor message from the last addresses element', () => {
            // The relay appends its own addresses element after the content that the visitor sent.
            const msg = parse('' +
                '<message to="jid" from="fromjid" type="chat" id="m1" xmlns="jabber:client">' +
                    '<body>Hello</body>' +
                    '<display-name xmlns="http://jitsi.org/protocol/display-name" source="visitor">Visitor</display-name>' +
                    '<addresses xmlns="http://jabber.org/protocol/address">' +
                        '<address type="ofrom" jid="sent-by-the-visitor@example.org"/>' +
                    '</addresses>' +
                    '<addresses xmlns="http://jabber.org/protocol/address">' +
                        '<address type="ofrom" jid="added-by-the-relay@example.org"/>' +
                    '</addresses>' +
                '</message>');

            room.onMessage(msg, room.roomjid);

            expect(emitterSpy.calls.mostRecent().args[8]).toBe('added-by-the-relay@example.org');
        });

        it('ignores an address that is not a direct child of the addresses element', () => {
            const msg = parse('' +
                '<message to="jid" from="fromjid" type="chat" id="m2" xmlns="jabber:client">' +
                    '<body>Hello</body>' +
                    '<display-name xmlns="http://jitsi.org/protocol/display-name" source="visitor">Visitor</display-name>' +
                    '<addresses xmlns="http://jabber.org/protocol/address">' +
                        '<extension xmlns="urn:example:extension">' +
                            '<address type="ofrom" jid="nested@example.org"/>' +
                        '</extension>' +
                        '<address type="ofrom" jid="direct@example.org"/>' +
                    '</addresses>' +
                '</message>');

            room.onMessage(msg, room.roomjid);

            expect(emitterSpy.calls.mostRecent().args[8]).toBe('direct@example.org');
        });

        it('takes the moderation reason from a direct child of the moderated element', () => {
            const msg = parse('' +
                '<message from="room@conference.example.org" type="groupchat" xmlns="jabber:client">' +
                    '<apply-to xmlns="urn:xmpp:fasten:0" id="msg-1">' +
                        '<moderated xmlns="urn:xmpp:message-moderate:1">' +
                            '<retract xmlns="urn:xmpp:message-retract:1"><reason>nested</reason></retract>' +
                            '<reason>direct</reason>' +
                        '</moderated>' +
                    '</apply-to>' +
                '</message>');

            room.onMessage(msg, 'room@conference.example.org');

            expect(emitterSpy).toHaveBeenCalledWith(XMPPEvents.MESSAGE_MODERATED, 'msg-1', 'direct');
        });
    });

    describe('onPresence', () => {
        beforeEach(() => createRoom());

        it('takes the status from a direct child of the presence', () => {
            const pres = parse('' +
                '<presence to="tojid" from="fromjid">' +
                    '<extension xmlns="urn:example:extension"><status>nested</status></extension>' +
                    '<x xmlns="http://jabber.org/protocol/muc#user">' +
                        '<item jid="jid=attr" affiliation="member" role="participant"/>' +
                        '<status code="100"/>' +
                    '</x>' +
                '</presence>');

            room.onPresence(pres);

            const joined = emitterSpy.calls.allArgs().find(args => args[0] === XMPPEvents.MUC_MEMBER_JOINED);

            expect(joined[6]).toBeUndefined();
        });

        it('takes the status from the direct status child when there are several', () => {
            const pres = parse('' +
                '<presence to="tojid" from="fromjid">' +
                    '<extension xmlns="urn:example:extension"><status>nested</status></extension>' +
                    '<status>direct</status>' +
                    '<x xmlns="http://jabber.org/protocol/muc#user">' +
                        '<item jid="jid=attr" affiliation="member" role="participant"/>' +
                    '</x>' +
                '</presence>');

            room.onPresence(pres);

            const joined = emitterSpy.calls.allArgs().find(args => args[0] === XMPPEvents.MUC_MEMBER_JOINED);

            expect(joined[6]).toBe('direct');
        });

        it('reads the permission entries as direct children of the permissions element', () => {
            const pres = parse('' +
                `<presence to="tojid" from="${room.myroomjid}">` +
                    '<x xmlns="http://jabber.org/protocol/muc#user">' +
                        '<item jid="me@example.org/res" affiliation="owner" role="moderator"/>' +
                        '<status code="110"/>' +
                    '</x>' +
                    '<permissions xmlns="http://jitsi.org/jitmeet">' +
                        '<p name="direct" val="1"/>' +
                        '<wrapper><p name="nested" val="2"/></wrapper>' +
                    '</permissions>' +
                '</presence>');

            (room as any).options.disableDiscoInfo = true;
            room.onPresence(pres);

            expect(emitterSpy).toHaveBeenCalledWith(XMPPEvents.PERMISSIONS_RECEIVED, { direct: '1' });
        });
    });

    describe('onPresence with a configured focus jid', () => {
        let handler: jasmine.Spy;

        beforeEach(() => {
            const xmpp = {
                moderator: new Moderator({ options: { focusUserJid: 'focus@auth.example.org' } } as any),
                options: {},
                addListener: () => {} // eslint-disable-line no-empty-function
            };

            room = new ChatRoom({} as XmppConnection, 'jid', 'password', xmpp as any, {});
            emitterSpy = spyOn(room.eventEmitter, 'emit');
            handler = jasmine.createSpy('handler');
            room.addPresenceListener('jibri-sip-call-state', handler);
        });

        /**
         * Builds the presence of a member that has a jibri-sip-call-state node.
         *
         * @param {string} jid - The real JID of the member.
         * @returns {Element}
         */
        function sipStatePresence(jid: string): Element {
            return parse('' +
                '<presence to="tojid" from="room@conference.example.org/member">' +
                    '<x xmlns="http://jabber.org/protocol/muc#user">' +
                        `<item jid="${jid}" affiliation="member" role="participant"/>` +
                    '</x>' +
                    '<jibri-sip-call-state state="on" sipaddress="sip@example.org"/>' +
                '</presence>');
        }

        it('passes the SIP call state of the focus to the listeners', () => {
            room.onPresence(sipStatePresence('focus@auth.example.org/focus'));

            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('does not pass the SIP call state of another participant to the listeners', () => {
            room.onPresence(sipStatePresence('user@example.org/res'));

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('mute requests from the focus', () => {
        beforeEach(() => {
            createRoom();
            (room as any).focusMucJid = 'room@conference.example.org/focus';
        });

        for (const [ handlerName, kind, event ] of [
            [ 'onMute', 'audio', XMPPEvents.AUDIO_MUTED_BY_FOCUS ],
            [ 'onMuteVideo', 'video', XMPPEvents.VIDEO_MUTED_BY_FOCUS ],
            [ 'onMuteDesktop', 'desktop', XMPPEvents.DESKTOP_MUTED_BY_FOCUS ]
        ]) {
            it(`reads the ${kind} mute element that is a direct child of the iq`, () => {
                const iq = parse('' +
                    '<iq type="set" from="room@conference.example.org/focus" xmlns="jabber:client">' +
                        `<wrapper xmlns="http://jitsi.org/jitmeet/${kind}"><mute actor="nested">false</mute></wrapper>` +
                        `<mute xmlns="http://jitsi.org/jitmeet/${kind}" actor="direct">true</mute>` +
                    '</iq>');

                (room as any)[handlerName](iq);

                expect(emitterSpy).toHaveBeenCalledWith(event, 'direct');
            });

            it(`ignores a mute element of another namespace in the ${kind} request`, () => {
                const iq = parse('' +
                    '<iq type="set" from="room@conference.example.org/focus" xmlns="jabber:client">' +
                        '<mute xmlns="urn:example:other" actor="other">true</mute>' +
                        `<mute xmlns="http://jitsi.org/jitmeet/${kind}" actor="direct">true</mute>` +
                    '</iq>');

                (room as any)[handlerName](iq);

                expect(emitterSpy).toHaveBeenCalledWith(event, 'direct');
            });
        }
    });
});
