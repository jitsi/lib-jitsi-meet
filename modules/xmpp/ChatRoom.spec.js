import ChatRoom, { parser } from './ChatRoom';
import { $pres } from 'strophe.js';
import XMPPEvents from '../../service/xmpp/XMPPEvents';

// This rule makes creating the xml elements take up way more
// space than necessary.
/* eslint-disable newline-per-chained-call */
// These rules makes the xml strings harder to read
/* eslint-disable operator-linebreak, max-len */

describe('ChatRoom', () => {
    describe('packet2JSON', () => {
        let nodes = [];

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
                .find(n => n.tagName === 'fake-with-attr');

            expect(fakeWithAttr).toBeTruthy();
            expect(Object.keys(fakeWithAttr.attributes).length).toEqual(2);
            expect(fakeWithAttr.attributes.fakeAttr1).toBeTruthy();
            expect(fakeWithAttr.attributes.fakeAttr1).toEqual('attrValue1');
            expect(fakeWithAttr.attributes.fakeAttr2).toBeTruthy();
            expect(fakeWithAttr.attributes.fakeAttr2).toEqual('attrValue2');
            expect(fakeWithAttr.children.length).toEqual(0);
            expect(fakeWithAttr.value).toBeFalsy();
        });

        it('translates element text correctly', () => {
            const p = $pres({
                to: 'tojid',
                from: 'fromjid'
            })
            .c('element-name').t('element-name-text').up();

            parser.packet2JSON(p.tree(), nodes);

            expect(nodes.length).toBe(1);
            const elem = nodes.find(n => n.tagName === 'element-name');

            expect(elem).toBeTruthy();
            expect(Object.keys(elem.attributes).length).toEqual(0);
            expect(elem.children.length).toEqual(0);
            expect(elem.value).toEqual('element-name-text');
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

            const identity = nodes.find(n => n.tagName === 'identity');

            expect(identity).toBeTruthy();
            expect(Object.keys(identity.attributes).length).toEqual(0);
            expect(identity.children.length).toEqual(2);
            {
                const user = identity.children
                    .find(n => n.tagName === 'user');

                expect(user).toBeTruthy();
                expect(Object.keys(user.attributes).length).toEqual(0);
                expect(user.children.length).toEqual(3);
                {
                    const id = user.children
                        .find(n => n.tagName === 'id');

                    expect(id).toBeTruthy();
                    expect(Object.keys(id.attributes).length).toEqual(0);
                    expect(id.children.length).toEqual(0);
                    expect(id.value).toEqual('id-text');
                }
                {
                    const name = user.children
                        .find(n => n.tagName === 'name');

                    expect(name).toBeTruthy();
                    expect(Object.keys(name.attributes).length).toEqual(0);
                    expect(name.children.length).toEqual(0);
                    expect(name.value).toEqual('name-text');
                }
                {
                    const avatar = user.children
                        .find(n => n.tagName === 'avatar');

                    expect(avatar).toBeTruthy();
                    expect(Object.keys(avatar.attributes).length).toEqual(0);
                    expect(avatar.children.length).toEqual(0);
                    expect(avatar.value).toEqual('avatar-text');
                }
                expect(user.value).toBeFalsy();
            }
            {
                const group = identity.children
                    .find(n => n.tagName === 'group');

                expect(group).toBeTruthy();
                expect(Object.keys(group.attributes).length).toEqual(0);
                expect(group.children.length).toEqual(0);
                expect(group.value).toEqual('group-text');
            }
            expect(identity.value).toBeFalsy();
        });
    });

    describe('onPresence', () => {
        let room;
        let emitterSpy;

        beforeEach(() => {
            const xmpp = {
                options: {}
            };

            room = new ChatRoom(
                {} /* connection */,
                'jid',
                'password',
                xmpp,
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
            expect(emitterSpy.calls.count()).toEqual(2);
            expect(emitterSpy.calls.argsFor(0)).toEqual([
                XMPPEvents.PRESENCE_RECEIVED,
                jasmine.any(Object)
            ]);
            expect(emitterSpy.calls.argsFor(1)).toEqual([
                XMPPEvents.MUC_MEMBER_JOINED,
                'fromjid',
                undefined, // nick
                null, // role
                false, // isHiddenDomain
                undefined, // statsID
                'status-text',
                undefined,
                undefined,
                'fulljid'
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
            expect(emitterSpy.calls.count()).toEqual(2);
            expect(emitterSpy.calls.argsFor(0)).toEqual([
                XMPPEvents.PRESENCE_RECEIVED,
                jasmine.any(Object)
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
                'jid=attr');
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
            expect(emitterSpy.calls.count()).toEqual(2);
            expect(emitterSpy.calls.argsFor(0)).toEqual([
                XMPPEvents.PRESENCE_RECEIVED,
                jasmine.any(Object)
            ]);
            expect(emitterSpy.calls.argsFor(1)).toEqual([
                XMPPEvents.MUC_MEMBER_JOINED,
                'fromjid',
                undefined, // nick
                null, // role
                false, // isHiddenDomain
                undefined, // statsID
                'status-text',
                expectedIdentity,
                undefined,
                'fulljid'
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
            expect(emitterSpy.calls.count()).toEqual(2);
            expect(emitterSpy.calls.argsFor(0)).toEqual([
                XMPPEvents.PRESENCE_RECEIVED,
                jasmine.any(Object)
            ]);
            expect(emitterSpy.calls.argsFor(1)).toEqual([
                XMPPEvents.MUC_MEMBER_JOINED,
                'fromjid',
                undefined, // nick
                null, // role
                false, // isHiddenDomain
                undefined, // statsID
                'status-text',
                undefined,
                expectedBotType,
                'fulljid'
            ]);
        });

    });
});

