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
});
