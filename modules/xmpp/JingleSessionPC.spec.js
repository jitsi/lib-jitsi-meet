import $ from 'jquery';

import { MockRTC } from '../RTC/MockClasses';

import JingleSessionPC from './JingleSessionPC';
import * as JingleSessionState from './JingleSessionState';
import MediaSessionEvents from './MediaSessionEvents';
import { MockChatRoom, MockStropheConnection } from './MockClasses';

/**
 * Creates 'content-modify' Jingle IQ.
 * @returns {jQuery}
 */
function createContentModifyForSourceNames() {
    const modifyContentsIq = $.parseXML(
        '<jingle action="content-modify" initiator="peer2" sid="sid12345" xmlns="urn:xmpp:jingle:1">'
        + '<content name="video" senders="both">'
        + '<source-frame-height maxHeight="180" sourceName="8d519815-v0" xmlns="http://jitsi.org/jitmeet/video"/>'
        + '<source-frame-height maxHeight="2160" sourceName="8d519815-v1" xmlns="http://jitsi.org/jitmeet/video"/>'
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
            /* Signaling layer */ {
                setSSRCOwner: () => { }, // eslint-disable-line no-empty-function,
                removeSSRCOwners: () => { } // eslint-disable-line no-empty-function
            },
            /* options */ { });

        // eslint-disable-next-line no-empty-function
        // connection.connect('jid', undefined, () => { }); */
    });

    describe('send/receive video constraints w/ source-name', () => {
        it('sends content-modify with recv frame size', () => {
            const sendIQSpy = spyOn(connection, 'sendIQ').and.callThrough();
            const sourceConstraints = new Map();

            sourceConstraints.set('8d519815-v0', 180);
            sourceConstraints.set('8d519815-v1', 2160);

            jingleSession.setReceiverVideoConstraint(sourceConstraints);

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
                    + '<source-frame-height maxHeight="180" sourceName="8d519815-v0"'
                    + ' xmlns="http://jitsi.org/jitmeet/video"/>'
                    + '<source-frame-height maxHeight="2160" sourceName="8d519815-v1"'
                    + ' xmlns="http://jitsi.org/jitmeet/video"/>'
                    + '</content>'
                    + '</jingle>'
                    + '</iq>');
            });
        });
        it('fires an event when remote peer sends content-modify', () => {
            let remoteSourcesRecvMaxFrameHeight;
            const remoteVideoConstraintsListener = () => {
                remoteSourcesRecvMaxFrameHeight = jingleSession.getRemoteSourcesRecvMaxFrameHeight();
            };

            jingleSession.addListener(
                MediaSessionEvents.REMOTE_SOURCE_CONSTRAINTS_CHANGED,
                remoteVideoConstraintsListener);

            return new Promise((resolve, reject) => {
                jingleSession.acceptOffer(
                    offerIQ,
                    resolve,
                    reject,
                    /* local tracks */ []);
            }).then(() => {
                jingleSession.modifyContents(createContentModifyForSourceNames());
                const v0Height = remoteSourcesRecvMaxFrameHeight[0].maxHeight;
                const v1Height = remoteSourcesRecvMaxFrameHeight[1].maxHeight;

                expect(v0Height).toBe('180');
                expect(v1Height).toBe('2160');
            });
        });
    });

    describe('_processSourceAddOrRemove', () => {
        let peerconnection, removeSsrcOwnersSpy, setSsrcOwnerSpy, sourceInfo, updateRemoteSourcesSpy;

        beforeEach(() => {
            peerconnection = jingleSession.peerconnection;
            setSsrcOwnerSpy = spyOn(jingleSession._signalingLayer, 'setSSRCOwner');
            removeSsrcOwnersSpy = spyOn(jingleSession._signalingLayer, 'removeSSRCOwners');
            updateRemoteSourcesSpy = spyOn(peerconnection, 'updateRemoteSources');
        });
        it('should handle no sources', () => {
            const jingle = $.parseXML(
                    `<jingle xmlns='urn:xmpp:jingle:1'>
                        <content name='audio'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/>
                        </content>
                        <content name='video'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='video'/>
                        </content>
                    </jingle>`
            );
            const sourceAddElem = $(jingle).find('>jingle>content');

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, true);

            expect(sourceInfo.size).toBe(0);
            expect(setSsrcOwnerSpy).not.toHaveBeenCalled();
            expect(removeSsrcOwnersSpy).not.toHaveBeenCalled();
            expect(updateRemoteSourcesSpy).not.toHaveBeenCalled();
        });

        it('should handle a single source', () => {
            const jingle = $.parseXML(
                    `<jingle xmlns='urn:xmpp:jingle:1'>
                        <content name='audio'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='1234' name='source1' owner='peer'>
                                    <parameter name='msid' value='stream1'/>
                                </source>
                            </description>
                        </content>
                    </jingle>`
            );
            const sourceAddElem = $(jingle).find('>jingle>content');

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, true);
            expect(sourceInfo.size).toBe(1);
            expect(sourceInfo.get('source1').ssrcList).toEqual([ '1234' ]);
            expect(sourceInfo.get('source1').msid).toBe('stream1');
            expect(setSsrcOwnerSpy).toHaveBeenCalledWith(1234, null, 'source1');
            expect(updateRemoteSourcesSpy).toHaveBeenCalledWith(sourceInfo, true);

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, false);

            expect(removeSsrcOwnersSpy).toHaveBeenCalledWith([ 1234 ]);
            expect(updateRemoteSourcesSpy).toHaveBeenCalledWith(sourceInfo, false);
        });

        it('should handle multiple ssrcs belonging to the same source', () => {
            const jingle = $.parseXML(
                    `<jingle xmlns='urn:xmpp:jingle:1'>
                        <content name='audio'>
                                <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/>
                        </content>
                        <content name='video'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='video'>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='1234' name='source1' owner='peer'>
                                    <parameter name='msid' value='stream1'/>
                                </source>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='5678' name='source1' owner='peer'>
                                    <parameter name='msid' value='stream1'/>
                                </source>
                                <ssrc-group xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' semantics='FID'>
                                    <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='1234'/>
                                    <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='5678'/>
                                </ssrc-group>
                            </description>
                        </content>
                    </jingle>`
            );
            const sourceAddElem = $(jingle).find('>jingle>content');

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, true);

            expect(sourceInfo.size).toBe(1);
            expect(sourceInfo.get('source1').ssrcList).toEqual([ '1234', '5678' ]);
            expect(sourceInfo.get('source1').msid).toBe('stream1');
            expect(sourceInfo.get('source1').mediaType).toBe('video');
            expect(sourceInfo.get('source1').groups).toEqual([ {
                semantics: 'FID',
                ssrcs: [ '1234', '5678' ] } ]);
            expect(setSsrcOwnerSpy).toHaveBeenCalledWith(1234, null, 'source1');
            expect(setSsrcOwnerSpy).toHaveBeenCalledWith(5678, null, 'source1');
            expect(updateRemoteSourcesSpy).toHaveBeenCalledWith(sourceInfo, true);

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, false);

            expect(removeSsrcOwnersSpy).toHaveBeenCalledWith([ 1234, 5678 ]);
            expect(updateRemoteSourcesSpy).toHaveBeenCalledWith(sourceInfo, false);
        });

        it('should handle multiple ssrcs belonging to different sources', () => {
            const jingle = $.parseXML(
                    `<jingle xmlns='urn:xmpp:jingle:1'>
                        <content name='audio'>
                                <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/>
                        </content>
                        <content name='video'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='video'>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='1234' name='source1' owner='peer'>
                                    <parameter name='msid' value='stream1'/>
                                </source>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='5678' name='source1' owner='peer'>
                                    <parameter name='msid' value='stream1'/>
                                </source>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='4321' name='source2' owner='peer'>
                                    <parameter name='msid' value='stream2'/>
                                </source>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='8765' name='source2' owner='peer'>
                                    <parameter name='msid' value='stream2'/>
                                </source>
                                <ssrc-group xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' semantics='FID'>
                                    <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='1234'/>
                                    <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='5678'/>
                                </ssrc-group>
                                <ssrc-group xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' semantics='FID'>
                                    <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='4321'/>
                                    <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='8765'/>
                                </ssrc-group>
                            </description>
                        </content>
                    </jingle>`
            );
            const sourceAddElem = $(jingle).find('>jingle>content');

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, true);

            expect(sourceInfo.size).toBe(2);
            expect(sourceInfo.get('source1').ssrcList).toEqual([ '1234', '5678' ]);
            expect(sourceInfo.get('source1').msid).toBe('stream1');
            expect(sourceInfo.get('source1').groups).toEqual([ {
                semantics: 'FID',
                ssrcs: [ '1234', '5678' ] } ]);
            expect(sourceInfo.get('source1').mediaType).toBe('video');
            expect(sourceInfo.get('source2').ssrcList).toEqual([ '4321', '8765' ]);
            expect(sourceInfo.get('source2').msid).toBe('stream2');
            expect(sourceInfo.get('source2').groups).toEqual([ {
                semantics: 'FID',
                ssrcs: [ '4321', '8765' ] } ]);
            expect(sourceInfo.get('source2').mediaType).toBe('video');
            expect(setSsrcOwnerSpy).toHaveBeenCalledWith(1234, null, 'source1');
            expect(setSsrcOwnerSpy).toHaveBeenCalledWith(5678, null, 'source1');
            expect(setSsrcOwnerSpy).toHaveBeenCalledWith(4321, null, 'source2');
            expect(setSsrcOwnerSpy).toHaveBeenCalledWith(8765, null, 'source2');
            expect(updateRemoteSourcesSpy).toHaveBeenCalledWith(sourceInfo, true);

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, false);

            expect(removeSsrcOwnersSpy).toHaveBeenCalledWith([ 1234, 5678, 4321, 8765 ]);
            expect(updateRemoteSourcesSpy).toHaveBeenCalledWith(sourceInfo, false);
        });
    });
});
