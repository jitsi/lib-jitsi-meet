import { $pres } from 'strophe.js';

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import ChatRoom, { parser } from './ChatRoom';
import Moderator from './moderator';
import XMPP from './xmpp';
import XmppConnection from './XmppConnection';
import { IPresenceNode } from './SignalingLayerImpl';

// Mock connection interface for tests
interface IMockConnection {
    send: () => void;
}

// Mock XMPP interface for tests  
interface IMockXMPP {
    moderator: Moderator;
    options: Record<string, any>;
    addListener: () => void;
}

// Jasmine types for spies
declare let spyOn: (object: any, method: string) => jasmine.Spy;
declare let jasmine: any;

// This rule makes creating the xml elements take up way more
// space than necessary.
/* eslint-disable newline-per-chained-call */
// These rules makes the xml strings harder to read
/* eslint-disable operator-linebreak, max-len */

describe('ChatRoom', () => {
    describe('packet2JSON', () => {
        let nodes: IPresenceNode[] = [];

        beforeEach(() => {
            nodes = [];
        });

        it('translates attributes correctly', () => {
            const p = $pres({
                to: 'tojid',
                from: 'fromjid'
            })
            .c('fake-with-attr', {
                fakeAttr1: 'attrValue1',
                fakeAttr2: 'attrValue2'
            }).up();

            parser.packet2JSON(p.tree(), nodes);
            expect(nodes.length).toBe(1);

            const fakeWithAttr = nodes
                .find((n) => n.tagName === 'fake-with-attr');

            expect(fakeWithAttr).toBeTruthy();
            expect(Object.keys(fakeWithAttr!.attributes).length).toEqual(2);
            expect(fakeWithAttr!.attributes.fakeAttr1).toBeTruthy();
            expect(fakeWithAttr!.attributes.fakeAttr1).toEqual('attrValue1');
            expect(fakeWithAttr!.attributes.fakeAttr2).toBeTruthy();
            expect(fakeWithAttr!.attributes.fakeAttr2).toEqual('attrValue2');
            expect(fakeWithAttr!.children.length).toEqual(0);
            expect(fakeWithAttr!.value).toBeFalsy();
        });

        it('translates element text correctly', () => {
            const p = $pres({
                to: 'tojid',
                from: 'fromjid'
            })
            .c('element-name').t('element-name-text').up();

            parser.packet2JSON(p.tree(), nodes);

            expect(nodes.length).toBe(1);
            const elem = nodes.find((n: IPresenceNode) => n.tagName === 'element-name');

            expect(elem).toBeTruthy();
            expect(Object.keys(elem!.attributes).length).toEqual(0);
            expect(elem!.children.length).toEqual(0);
            expect(elem!.value).toEqual('element-name-text');
        });

        it('translates elements with children correctly', () => {
            const p = $pres({
                to: 'tojid',
                from: 'fromjid'
            })
            .c('identity')
                .c('user')
                    .c('id').t('id-text').up()
                    .c('name').t('name-text').up()
                    .c('avatar').t('avatar-text').up()
                .up()
                .c('group').t('group-text').up()
            .up();

            parser.packet2JSON(p.tree(), nodes);

            const identity = nodes.find((n: IPresenceNode) => n.tagName === 'identity');

            expect(identity).toBeTruthy();
            expect(Object.keys(identity!.attributes).length).toEqual(0);
            expect(identity!.children.length).toEqual(2);
            {
                const user = identity!.children
                    .find((n: IPresenceNode) => n.tagName === 'user');

                expect(user).toBeTruthy();
                expect(Object.keys(user!.attributes).length).toEqual(0);
                expect(user!.children.length).toEqual(3);
                {
                    const id = user!.children
                        .find((n: IPresenceNode) => n.tagName === 'id');

                    expect(id).toBeTruthy();
                    expect(Object.keys(id!.attributes).length).toEqual(0);
                    expect(id!.children.length).toEqual(0);
                    expect(id!.value).toEqual('id-text');
                }
                {
                    const name = user!.children
                        .find((n: IPresenceNode) => n.tagName === 'name');

                    expect(name).toBeTruthy();
                    expect(Object.keys(name!.attributes).length).toEqual(0);
                    expect(name!.children.length).toEqual(0);
                    expect(name!.value).toEqual('name-text');
                }
                {
                    const avatar = user!.children
                        .find((n: IPresenceNode) => n.tagName === 'avatar');

                    expect(avatar).toBeTruthy();
                    expect(Object.keys(avatar!.attributes).length).toEqual(0);
                    expect(avatar!.children.length).toEqual(0);
                    expect(avatar!.value).toEqual('avatar-text');
                }
                expect(user!.value).toBeFalsy();
            }
            {
                const group = identity!.children
                    .find((n: IPresenceNode) => n.tagName === 'group');

                expect(group).toBeTruthy();
                expect(Object.keys(group!.attributes).length).toEqual(0);
                expect(group!.children.length).toEqual(0);
                expect(group!.value).toEqual('group-text');
            }
            expect(identity!.value).toBeFalsy();
        });
    });

    describe('onPresence', () => {
        let room: ChatRoom;
        let emitterSpy: jasmine.Spy;

        beforeEach(() => {
            const xmpp: IMockXMPP = {
                moderator: new Moderator({
                    options: {}
                } as any),
                options: {},
                addListener: () => {} // eslint-disable-line no-empty-function
            };

            room = new ChatRoom(
                {} as XmppConnection /* connection */,
                'jid',
                'password',
                xmpp as any,
                {} /* options */);
            emitterSpy = spyOn(room.eventEmitter, 'emit');
        });
        it('parses status correctly', () => {
            const presStr = '' +
                '<presence to="tojid" from="fromjid">' +
                    '<x xmlns=\'http://jabber.org/protocol/muc#user\'>' +
                        '<item jid=\'fulljid\'/>' +
                    '</x>' +
                    '<status>status-text</status>' +
                '</presence>';
            const pres = new DOMParser().parseFromString(presStr, 'text/xml').documentElement;

            room.onPresence(pres);
            expect(emitterSpy.calls.count()).toEqual(3);
            expect(emitterSpy.calls.argsFor(0)).toEqual([
                XMPPEvents.PRESENCE_RECEIVED,
                jasmine.any(Object)
            ]);
            expect(emitterSpy.calls.argsFor(1)).toEqual([
                XMPPEvents.MUC_JOIN_IN_PROGRESS
            ]);
            expect(emitterSpy.calls.argsFor(2)).toEqual([
                XMPPEvents.MUC_MEMBER_JOINED,
                'fromjid',
                undefined, // nick
                null, // role
                false, // isHiddenDomain
                undefined, // statsID
                'status-text',
                undefined,
                undefined,
                'fulljid',
                undefined, // features
                0, // isReplaceParticipant
                undefined // isSilent
            ]);
        });

        it('parses muc user item correctly', () => {
            const presStr = '' +
                '<presence to="tojid" from="fromjid">' +
                    '<x xmlns="http://jabber.org/protocol/muc#user">' +
                        '<item jid="jid=attr" affiliation="affiliation-attr" role="role-attr"/>' +
                    '</x>' +
                '</presence>';
            const pres = new DOMParser().parseFromString(presStr, 'text/xml').documentElement;

            room.onPresence(pres);
            expect(emitterSpy.calls.count()).toEqual(3);
            expect(emitterSpy.calls.argsFor(0)).toEqual([
                XMPPEvents.PRESENCE_RECEIVED,
                jasmine.any(Object)
            ]);
            expect(emitterSpy.calls.argsFor(1)).toEqual([
                XMPPEvents.MUC_JOIN_IN_PROGRESS
            ]);

            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.MUC_MEMBER_JOINED,
                'fromjid',
                undefined, // nick
                'role-attr', // role
                jasmine.any(Boolean), // isHiddenDomain
                undefined, // statsID
                undefined,
                undefined,
                undefined,
                'jid=attr',
                undefined, // features
                0, // isReplaceParticipant
                undefined); // isSilent
        });

        it('parses muc user replacing other user correctly', () => {
            const presStr = '' +
              '<presence to="tojid" from="fromjid">' +
                  '<x xmlns="http://jabber.org/protocol/muc#user">' +
                      '<item jid="jid=attr" affiliation="affiliation-attr" role="role-attr"/>' +
                  '</x>' +
                  '<flip_device />' +
              '</presence>';
            const pres = new DOMParser().parseFromString(presStr, 'text/xml').documentElement;

            room.onPresence(pres);
            expect(emitterSpy.calls.count()).toEqual(3);
            expect(emitterSpy.calls.argsFor(0)).toEqual([
                XMPPEvents.PRESENCE_RECEIVED,
                jasmine.any(Object)
            ]);
            expect(emitterSpy.calls.argsFor(1)).toEqual([
                XMPPEvents.MUC_JOIN_IN_PROGRESS
            ]);
            expect(emitterSpy).toHaveBeenCalledWith(
              XMPPEvents.MUC_MEMBER_JOINED,
              'fromjid',
              undefined, // nick
              'role-attr', // role
              jasmine.any(Boolean), // isHiddenDomain
              undefined, // statsID
              undefined,
              undefined,
              undefined,
              'jid=attr',
              undefined, // features
              1, // isReplaceParticipant
              undefined); // isSilent
        });

        it('parses identity correctly', () => {
            const presStr = '' +
                '<presence to="tojid" from="fromjid">' +
                    '<x xmlns=\'http://jabber.org/protocol/muc#user\'>' +
                        '<item jid=\'fulljid\'/>' +
                    '</x>' +
                    '<status>status-text</status>' +
                    '<identity>' +
                        '<user>' +
                            '<id>id-text</id>' +
                            '<name>name-text</name>' +
                            '<avatar>avatar-text</avatar>' +
                        '</user>' +
                        '<group>group-text</group>' +
                    '</identity>' +
                '</presence>';
            const pres = new DOMParser().parseFromString(presStr, 'text/xml').documentElement;

            const expectedIdentity = {
                user: {
                    id: 'id-text',
                    name: 'name-text',
                    avatar: 'avatar-text'
                },
                group: 'group-text'
            };

            room.onPresence(pres);
            expect(emitterSpy.calls.count()).toEqual(3);
            expect(emitterSpy.calls.argsFor(0)).toEqual([
                XMPPEvents.PRESENCE_RECEIVED,
                jasmine.any(Object)
            ]);
            expect(emitterSpy.calls.argsFor(1)).toEqual([
                XMPPEvents.MUC_JOIN_IN_PROGRESS
            ]);
            expect(emitterSpy.calls.argsFor(2)).toEqual([
                XMPPEvents.MUC_MEMBER_JOINED,
                'fromjid',
                undefined, // nick
                null, // role
                false, // isHiddenDomain
                undefined, // statsID
                'status-text',
                expectedIdentity,
                undefined,
                'fulljid',
                undefined, // features
                0, // isReplaceParticipant
                undefined // isSilent
            ]);
        });

        it('parses bot correctly', () => {
            const expectedBotType = 'some_bot_type';
            const presStr = '' +
                '<presence to="tojid" from="fromjid">' +
                    '<x xmlns=\'http://jabber.org/protocol/muc#user\'>' +
                        '<item jid=\'fulljid\'/>' +
                    '</x>' +
                    '<status>status-text</status>' +
                    `<bot type="${expectedBotType}"/>` +
                '</presence>';
            const pres = new DOMParser().parseFromString(presStr, 'text/xml').documentElement;

            room.onPresence(pres);
            expect(emitterSpy.calls.count()).toEqual(3);
            expect(emitterSpy.calls.argsFor(0)).toEqual([
                XMPPEvents.PRESENCE_RECEIVED,
                jasmine.any(Object)
            ]);
            expect(emitterSpy.calls.argsFor(1)).toEqual([
                XMPPEvents.MUC_JOIN_IN_PROGRESS
            ]);
            expect(emitterSpy.calls.argsFor(2)).toEqual([
                XMPPEvents.MUC_MEMBER_JOINED,
                'fromjid',
                undefined, // nick
                null, // role
                false, // isHiddenDomain
                undefined, // statsID
                'status-text',
                undefined,
                expectedBotType,
                'fulljid',
                undefined, // features
                0, // isReplaceParticipant
                undefined // isSilent
            ]);
        });

    });

    describe('sendMessage', () => {
        let room: ChatRoom;
        let connectionSpy: jasmine.Spy;

        beforeEach(() => {
            const xmpp: IMockXMPP = {
                moderator: new Moderator({
                    options: {}
                } as any),
                options: {},
                addListener: () => {} // eslint-disable-line no-empty-function
            };

            room = new ChatRoom(
                // eslint-disable-next-line no-empty-function
                { send: () => {} } as any as XmppConnection /* connection */,
                'jid',
                'password',
                xmpp as any as XMPP,
                {} /* options */);
            connectionSpy = spyOn(room.connection, 'send');
        });
        it('sends a string msg with elementName body correctly', () => {
            room.sendMessage('string message', 'body');
            expect(connectionSpy.calls.argsFor(0).toString()).toBe(
                '<message to="jid" type="groupchat" xmlns="jabber:client">' +
                '<body>string message</body>' +
                '</message>');
        });
        it('sends a object msg with elementName body correctly', () => {
            room.sendMessage({ object: 'message' } as any, 'body');
            expect(connectionSpy.calls.argsFor(0).toString()).toBe(
                '<message to="jid" type="groupchat" xmlns="jabber:client">' +
                '<body object="message"/>' +
                '</message>');
        });
        it('sends a string msg with elementName json-message correctly', () => {
            room.sendMessage('string message', 'json-message');
            expect(connectionSpy.calls.argsFor(0).toString()).toBe(
                '<message to="jid" type="groupchat" xmlns="jabber:client">' +
                '<json-message xmlns="http://jitsi.org/jitmeet">string message</json-message>' +
                '</message>');
        });
        it('sends a object msg with elementName json-message correctly', () => {
            room.sendMessage({ object: 'message' } as any, 'json-message');
            expect(connectionSpy.calls.argsFor(0).toString()).toBe(
                '<message to="jid" type="groupchat" xmlns="jabber:client">' +
                '<json-message object="message" xmlns="http://jitsi.org/jitmeet"/>' +
                '</message>');
        });
    });

    describe('onMessage - reaction', () => {
        let room: ChatRoom;
        let emitterSpy: jasmine.Spy;

        beforeEach(() => {
            const xmpp: IMockXMPP = {
                moderator: new Moderator({
                    options: {}
                } as any),
                options: {},
                addListener: () => {} // eslint-disable-line no-empty-function
            };

            room = new ChatRoom(
                {} as XmppConnection /* connection */,
                'jid',
                'password',
                xmpp as any,
                {} /* options */);
            emitterSpy = spyOn(room.eventEmitter, 'emit');
        });

        it('parses reactions correctly', () => {
            const msgStr = '' +
                '<message to="jid" type="groupchat" xmlns="jabber:client">' +
                    '<reactions id="mdgId123" xmlns="urn:xmpp:reactions:0">' +
                        '<reaction>👍</reaction>' +
                    '</reactions>' +
                    '<store xmlns="urn:xmpp:hints"/>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.REACTION_RECEIVED,
                'fromjid',
                ['👍'],
                'mdgId123');
        });
        it('parses multiple reactions correctly', () => {
            const msgStr = '' +
                '<message to="jid" type="groupchat" xmlns="jabber:client">' +
                    '<reactions id="mdgId123" xmlns="urn:xmpp:reactions:0">' +
                        '<reaction>👍</reaction>' +
                        '<reaction>👎</reaction>' +
                    '</reactions>' +
                    '<store xmlns="urn:xmpp:hints"/>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.REACTION_RECEIVED,
                'fromjid',
                ['👍', '👎'],
                'mdgId123');
        });
        it('parses partially bogus reactions correctly', () => {
            const msgStr = '' +
                '<message to="jid" type="groupchat" xmlns="jabber:client">' +
                    '<reactions id="mdgId123" xmlns="urn:xmpp:reactions:0">' +
                        '<reaction>👍 foo bar baz</reaction>' +
                    '</reactions>' +
                    '<store xmlns="urn:xmpp:hints"/>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.REACTION_RECEIVED,
                'fromjid',
                ['👍'],
                'mdgId123');
        });
        it('parses bogus reactions correctly', () => {
            const msgStr = '' +
                '<message to="jid" type="groupchat" xmlns="jabber:client">' +
                    '<reactions id="mdgId123" xmlns="urn:xmpp:reactions:0">' +
                        '<reaction>foo bar baz</reaction>' +
                    '</reactions>' +
                    '<store xmlns="urn:xmpp:hints"/>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(0);
        });
    });

    describe('sendReaction', () => {
        let room: ChatRoom;
        let connectionSpy: jasmine.Spy;

        beforeEach(() => {
            const xmpp: IMockXMPP = {
                moderator: new Moderator({
                    options: {}
                } as any),
                options: {},
                addListener: () => {} // eslint-disable-line no-empty-function
            };

            room = new ChatRoom(
                // eslint-disable-next-line no-empty-function
                { send: () => {} } as any as XmppConnection /* connection */,
                'jid',
                'password',
                xmpp as any as XMPP,
                {} /* options */);
            connectionSpy = spyOn(room.connection, 'send');
        });
        it('sends a valid emoji reaction message', () => {
            room.sendReaction('👍', 'mdgId123', 'participant1');
            expect(connectionSpy.calls.argsFor(0).toString()).toBe(
                '<message to="jid/participant1" type="chat" xmlns="jabber:client">' +
                '<reactions id="mdgId123" xmlns="urn:xmpp:reactions:0"><reaction>👍</reaction></reactions>' +
                '<store xmlns="urn:xmpp:hints"/></message>');
        });
        it('sends only valid emoji reaction message', () => {
            room.sendReaction('I like this 👍', 'mdgId123', 'participant1');
            expect(connectionSpy.calls.argsFor(0).toString()).toBe(
                '<message to="jid/participant1" type="chat" xmlns="jabber:client">' +
                '<reactions id="mdgId123" xmlns="urn:xmpp:reactions:0"><reaction>👍</reaction></reactions>' +
                '<store xmlns="urn:xmpp:hints"/></message>');
        });
        it('sends only the first valid emoji reaction message', () => {
            room.sendReaction('👍👎', 'mdgId123', 'participant1');
            expect(connectionSpy.calls.argsFor(0).toString()).toBe(
                '<message to="jid/participant1" type="chat" xmlns="jabber:client">' +
                '<reactions id="mdgId123" xmlns="urn:xmpp:reactions:0"><reaction>👍</reaction></reactions>' +
                '<store xmlns="urn:xmpp:hints"/></message>');
        });
        it('throws in case of invalid or no emoji', () => {
            expect(() => room.sendReaction('foo bar baz', 'mdgId123', 'participant1')).toThrowError(/Invalid reaction/);
        });
    });

    describe('onMessage - private messages with display-name extension', () => {
        let room;
        let emitterSpy;

        beforeEach(() => {
            const xmpp = {
                moderator: new Moderator({
                    options: {}
                }),
                options: {},
                addListener: () => {} // eslint-disable-line no-empty-function
            };

            room = new ChatRoom(
                {} /* connection */,
                'jid',
                'password',
                xmpp,
                {} /* options */);
            emitterSpy = spyOn(room.eventEmitter, 'emit');
        });

        it('parses private message with display-name extension correctly', () => {
            const msgStr = '' +
                '<message to="jid" from="fromjid" type="chat" id="msg123" xmlns="jabber:client">' +
                    '<body>Hello from visitor</body>' +
                    '<display-name xmlns="http://jitsi.org/protocol/display-name" source="visitor">Visitor Name</display-name>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.PRIVATE_MESSAGE_RECEIVED,
                'fromjid',
                'Hello from visitor',
                room.myroomjid,
                undefined, // stamp
                'msg123', // messageId
                'Visitor Name', // displayName
                true, // isVisitorMessage
                undefined); // originalFrom
        });

        it('parses private message with display-name extension and addresses correctly', () => {
            const msgStr = '' +
                '<message to="jid" from="fromjid" type="chat" id="msg124" xmlns="jabber:client">' +
                    '<body>Hello with address</body>' +
                    '<display-name xmlns="http://jitsi.org/protocol/display-name" source="visitor">Visitor Name</display-name>' +
                    '<addresses xmlns="http://jabber.org/protocol/address">' +
                        '<address type="ofrom" jid="original@visitor.com"/>' +
                    '</addresses>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.PRIVATE_MESSAGE_RECEIVED,
                'fromjid',
                'Hello with address',
                room.myroomjid,
                undefined, // stamp
                'msg124', // messageId
                'Visitor Name', // displayName
                true, // isVisitorMessage
                'original@visitor.com'); // originalFrom
        });

        it('parses private message without display-name extension correctly', () => {
            const msgStr = '' +
                '<message to="jid" from="fromjid" type="chat" id="msg125" xmlns="jabber:client">' +
                    '<body>Hello without display name</body>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.PRIVATE_MESSAGE_RECEIVED,
                'fromjid',
                'Hello without display name',
                room.myroomjid,
                undefined, // stamp
                'msg125', // messageId
                undefined, // displayName
                false, // isVisitorMessage
                undefined); // originalFrom
        });
    });

    describe('onMessage - group messages with display-name extension', () => {
        let room;
        let emitterSpy;

        beforeEach(() => {
            const xmpp = {
                moderator: new Moderator({
                    options: {}
                }),
                options: {},
                addListener: () => {} // eslint-disable-line no-empty-function
            };

            room = new ChatRoom(
                {} /* connection */,
                'jid',
                'password',
                xmpp,
                {} /* options */);
            emitterSpy = spyOn(room.eventEmitter, 'emit');
        });

        it('parses group message with display-name extension correctly', () => {
            const msgStr = '' +
                '<message to="jid" from="fromjid" type="groupchat" id="msg126" xmlns="jabber:client">' +
                    '<body>Hello from visitor to group</body>' +
                    '<display-name xmlns="http://jitsi.org/protocol/display-name" source="visitor">Group Visitor</display-name>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.MESSAGE_RECEIVED,
                'fromjid',
                'Hello from visitor to group',
                room.myroomjid,
                undefined, // stamp
                'Group Visitor', // displayName from visitor
                true, // isVisitorMessage
                'msg126', // messageId
                undefined); // source (null for visitor messages)
        });

        it('parses group message with display-name extension source=token correctly', () => {
            const msgStr = '' +
                '<message to="jid" from="fromjid" type="groupchat" id="msg127" xmlns="jabber:client">' +
                    '<body>Hello from token user</body>' +
                    '<display-name xmlns="http://jitsi.org/protocol/display-name" source="token">Token User</display-name>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.MESSAGE_RECEIVED,
                'fromjid',
                'Hello from token user',
                room.myroomjid,
                undefined, // stamp
                'Token User', // displayName
                false, // isVisitorMessage
                'msg127', // messageId
                'token'); // source
        });

        it('parses group message with display-name extension source=guest correctly', () => {
            const msgStr = '' +
                '<message to="jid" from="fromjid" type="groupchat" id="msg127b" xmlns="jabber:client">' +
                    '<body>Hello from guest user</body>' +
                    '<display-name xmlns="http://jitsi.org/protocol/display-name" source="guest">Guest User</display-name>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.MESSAGE_RECEIVED,
                'fromjid',
                'Hello from guest user',
                room.myroomjid,
                undefined, // stamp
                'Guest User', // displayName
                false, // isVisitorMessage
                'msg127b', // messageId
                'guest'); // source
        });

        it('parses group message with display-name extension from non-visitor correctly', () => {
            const msgStr = '' +
                '<message to="jid" from="fromjid" type="groupchat" id="msg127c" xmlns="jabber:client">' +
                    '<body>Hello from regular user</body>' +
                    '<display-name xmlns="http://jitsi.org/protocol/display-name" source="jitsi-meet">Regular User</display-name>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.MESSAGE_RECEIVED,
                'fromjid',
                'Hello from regular user',
                room.myroomjid,
                undefined, // stamp
                'Regular User', // displayName
                false, // isVisitorMessage
                'msg127c', // messageId
                'jitsi-meet'); // source
        });

        it('parses group message without display-name extension correctly', () => {
            const msgStr = '' +
                '<message to="jid" from="fromjid" type="groupchat" id="msg128" xmlns="jabber:client">' +
                    '<body>Hello without display name extension</body>' +
                '</message>';
            const msg = new DOMParser().parseFromString(msgStr, 'text/xml').documentElement;

            room.onMessage(msg, 'fromjid');
            expect(emitterSpy.calls.count()).toEqual(1);
            expect(emitterSpy).toHaveBeenCalledWith(
                XMPPEvents.MESSAGE_RECEIVED,
                'fromjid',
                'Hello without display name extension',
                room.myroomjid,
                undefined, // stamp
                undefined, // displayName
                false, // isVisitorMessage
                'msg128', // messageId
                undefined); // source (undefined when no display-name element)
        });
    });
});
