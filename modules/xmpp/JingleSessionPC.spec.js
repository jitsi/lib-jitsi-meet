/* global $, jQuery */
import { MockRTC } from '../RTC/MockClasses';

import JingleSessionPC from './JingleSessionPC';
import * as JingleSessionState from './JingleSessionState';
import MediaSessionEvents from './MediaSessionEvents';
import { MockChatRoom, MockStropheConnection } from './MockClasses';

/**
 * Creates 'content-modify' Jingle IQ.
 * @param {string} senders - 'both' or 'none'.
 * @param {number|undefined} maxFrameHeight - the receive max video frame height.
 * @returns {jQuery}
 */
function createContentModify(senders = 'both', maxFrameHeight) {
    const modifyContentsIq = jQuery.parseXML(
        '<jingle action="content-modify" initiator="peer2" sid="sid12345" xmlns="urn:xmpp:jingle:1">'
        + `<content name="video" senders="${senders}">`
        + `<max-frame-height xmlns="http://jitsi.org/jitmeet/video">${maxFrameHeight}</max-frame-height>`
        + '</content>'
        + '</jingle>');

    return $(modifyContentsIq).find('>jingle');
}

describe('JingleSessionPC', () => {
    let jingleSession;
    let connection;
    let rtc;
    const offerIQ = {
        find: () => {
            return {
                // eslint-disable-next-line no-empty-function
                each: () => { }
            };
        }
    };

    const SID = 'sid12345';

    beforeEach(() => {
        connection = new MockStropheConnection();
        jingleSession = new JingleSessionPC(
            SID,
            'peer1',
            'peer2',
            connection,
            { },
            { },
            true,
            false);

        rtc = new MockRTC();

        jingleSession.initialize(
            /* ChatRoom */ new MockChatRoom(),
            /* RTC */ rtc,
            /* Signaling layer */ { },
            /* options */ { });

        // eslint-disable-next-line no-empty-function
        // connection.connect('jid', undefined, () => { }); */
    });

    describe('send/receive video constraints', () => {
        it('sends content-modify with recv frame size', () => {
            const sendIQSpy = spyOn(connection, 'sendIQ').and.callThrough();

            jingleSession.setReceiverVideoConstraint(180);

            expect(jingleSession.getState()).toBe(JingleSessionState.PENDING);

            return new Promise((resolve, reject) => {
                jingleSession.acceptOffer(
                    offerIQ,
                    resolve,
                    reject,
                    /* local tracks */ []);
            }).then(() => {
                expect(jingleSession.getState()).toBe(JingleSessionState.ACTIVE);

                // FIXME content-modify is sent before session-accept
                expect(sendIQSpy.calls.count()).toBe(2);

                expect(sendIQSpy.calls.first().args[0].toString()).toBe(
                    '<iq to="peer2" type="set" xmlns="jabber:client">'
                    + '<jingle action="content-modify" initiator="peer2" sid="sid12345" xmlns="urn:xmpp:jingle:1">'
                    + '<content name="video" senders="both">'
                    + '<max-frame-height xmlns="http://jitsi.org/jitmeet/video">180</max-frame-height>'
                    + '</content>'
                    + '</jingle>'
                    + '</iq>');
            });
        });
        it('fires an event when remote peer sends content-modify', () => {
            let remoteRecvMaxFrameHeight;
            const remoteVideoConstraintsListener = session => {
                remoteRecvMaxFrameHeight = session.getRemoteRecvMaxFrameHeight();
            };

            jingleSession.addListener(
                MediaSessionEvents.REMOTE_VIDEO_CONSTRAINTS_CHANGED,
                remoteVideoConstraintsListener);

            return new Promise((resolve, reject) => {
                jingleSession.acceptOffer(
                    offerIQ,
                    resolve,
                    reject,
                    /* local tracks */ []);
            }).then(() => {
                jingleSession.modifyContents(createContentModify('both', 180));
                expect(remoteRecvMaxFrameHeight).toBe(180);

                jingleSession.modifyContents(createContentModify('both', 360));
                expect(remoteRecvMaxFrameHeight).toBe(360);

                jingleSession.modifyContents(createContentModify('both', 180));
                expect(remoteRecvMaxFrameHeight).toBe(180);
            });
        });
    });
});
