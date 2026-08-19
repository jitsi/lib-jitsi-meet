import { MockRTC } from '../RTC/MockClasses';
import SDP from '../sdp/SDP';
import Statistics from '../statistics/statistics';
import { parseXML, findAll, findFirst } from '../util/XMLUtils';
import { IceRestartReason } from '../../service/RTC/IceRestartReason';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import JingleSessionPC from './JingleSessionPC';
import {JingleSessionState} from './JingleSessionState';
import { MediaSessionEvents } from './MediaSessionEvents';
import { MockChatRoom, MockStropheConnection } from './MockClasses';

/**
 * Creates 'content-modify' Jingle IQ.
 * @returns {Object}
 */
function createContentModifyForSourceNames() {
    return parseXML(
        '<jingle action="content-modify" initiator="peer2" sid="sid12345" xmlns="urn:xmpp:jingle:1">'
        + '<content name="video" senders="both">'
        + '<source-frame-height maxHeight="180" sourceName="8d519815-v0" xmlns="http://jitsi.org/jitmeet/video"/>'
        + '<source-frame-height maxHeight="2160" sourceName="8d519815-v1" xmlns="http://jitsi.org/jitmeet/video"/>'
        + '</content>'
        + '</jingle>');
}

describe('JingleSessionPC', () => {
    let jingleSession: JingleSessionPC;
    let connection: MockStropheConnection;
    let rtc;
    const offerIQ = {
        querySelector: () => null,
        querySelectorAll: () => []
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

                expect((sendIQSpy.calls.first().args[0] as any).toString()).toBe(
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
                console.error('asdasdasd', jingleSession.getRemoteSourcesRecvMaxFrameHeight());
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

                console.error('BBBBBB ', remoteSourcesRecvMaxFrameHeight);
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
            const jingle = parseXML(
                    `<jingle xmlns='urn:xmpp:jingle:1'>
                        <content name='audio'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/>
                        </content>
                        <content name='video'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='video'/>
                        </content>
                    </jingle>`
            );
            const sourceAddElem = findAll(jingle.documentElement, ':scope>jingle>content');

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, true);

            expect(sourceInfo.size).toBe(0);
            expect(setSsrcOwnerSpy).not.toHaveBeenCalled();
            expect(removeSsrcOwnersSpy).not.toHaveBeenCalled();
            expect(updateRemoteSourcesSpy).not.toHaveBeenCalled();
        });

        it('should handle a single source', () => {
            const jingle = parseXML(
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

            expect(jingle).not.toBe(null);

            if (!jingle) {
                return;
            }

            const sourceAddElem = findAll(jingle.documentElement, ':scope>content');

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

        it('should parse the mid parameter when present', () => {
            const jingle = parseXML(
                    `<jingle xmlns='urn:xmpp:jingle:1'>
                        <content name='audio'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='1234' name='source1' owner='peer'>
                                    <parameter name='msid' value='stream1'/>
                                    <parameter name='mid' value='a0'/>
                                </source>
                            </description>
                        </content>
                    </jingle>`
            );

            expect(jingle).not.toBe(null);

            if (!jingle) {
                return;
            }

            const sourceAddElem = findAll(jingle.documentElement, ':scope>content');

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, true);
            expect(sourceInfo.size).toBe(1);
            expect(sourceInfo.get('source1').mid).toBe('a0');
        });

        it('leaves mid null when no mid parameter is present', () => {
            const jingle = parseXML(
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

            expect(jingle).not.toBe(null);

            if (!jingle) {
                return;
            }

            const sourceAddElem = findAll(jingle.documentElement, ':scope>content');

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, true);
            expect(sourceInfo.get('source1').mid).toBeNull();
        });

        it('should handle multiple ssrcs belonging to the same source', () => {
            const jingle = parseXML(
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

            expect(jingle).not.toBe(null);

            if (!jingle) {
                return;
            }

            const sourceAddElem = findAll(jingle.documentElement, ':scope>content');

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
            const jingle = parseXML(
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

            expect(jingle).not.toBe(null);

            if (!jingle) {
                return;
            }

            const sourceAddElem = findAll(jingle.documentElement, ':scope>content');

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

        it('ignores a source whose ssrc is not a valid 32-bit decimal integer', () => {
            const jingle = parseXML(
                    `<jingle xmlns='urn:xmpp:jingle:1'>
                        <content name='video'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='video'>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='(.+)+$' name='evil' owner='peer'>
                                    <parameter name='msid' value='stream1'/>
                                </source>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='99999999999999999999' name='big' owner='peer'>
                                    <parameter name='msid' value='stream2'/>
                                </source>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='1234' name='ok' owner='peer'>
                                    <parameter name='msid' value='stream3'/>
                                </source>
                            </description>
                        </content>
                    </jingle>`
            );

            const sourceAddElem = findAll(jingle.documentElement, ':scope>content');

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, true);

            expect(sourceInfo.has('evil')).toBe(false);
            expect(sourceInfo.has('big')).toBe(false);
            expect(sourceInfo.get('ok').ssrcList).toEqual([ '1234' ]);
            expect(setSsrcOwnerSpy).toHaveBeenCalledWith(1234, null, 'ok');
            expect(setSsrcOwnerSpy).not.toHaveBeenCalledWith(NaN, jasmine.anything(), 'evil');
        });

        it('ignores an ssrc-group whose semantics is not a known value', () => {
            const jingle = parseXML(
                    `<jingle xmlns='urn:xmpp:jingle:1'>
                        <content name='video'>
                            <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='video'>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='1234' name='source1' owner='peer'>
                                    <parameter name='msid' value='stream1'/>
                                </source>
                                <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='5678' name='source1' owner='peer'>
                                    <parameter name='msid' value='stream1'/>
                                </source>
                                <ssrc-group xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' semantics='(.+)+$'>
                                    <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='1234'/>
                                    <source xmlns='urn:xmpp:jingle:apps:rtp:ssma:0' ssrc='5678'/>
                                </ssrc-group>
                            </description>
                        </content>
                    </jingle>`
            );

            const sourceAddElem = findAll(jingle.documentElement, ':scope>content');

            sourceInfo = jingleSession._processSourceMapFromJingle(sourceAddElem, true);

            expect(sourceInfo.get('source1').groups).toEqual([]);
        });
    });

    describe('_recoverWedgedAudioSource', () => {
        let addOrRemoveSpy, peerconnection, pushSpy;

        /**
         * Builds a minimal mock of a remote audio track.
         *
         * @param {number} ssrc - The track SSRC.
         * @param {string} source - The source name.
         * @param {string} owner - The owner endpoint id.
         * @returns {object}
         */
        function mockTrack(ssrc: number, source: string, owner = 'owner-A'): any {
            return {
                getParticipantId: () => owner,
                getSourceName: () => source,
                getSsrc: () => ssrc
            };
        }

        /**
         * Runs the recovery task that was queued on the modification queue.
         *
         * @returns {void}
         */
        function runQueuedTask(): void {
            const workFunction = pushSpy.calls.mostRecent().args[0];

            workFunction(() => { }); // eslint-disable-line no-empty-function
        }

        beforeEach(() => {
            peerconnection = jingleSession.peerconnection;
            addOrRemoveSpy = spyOn(jingleSession as any, '_addOrRemoveRemoteStream');
            spyOn(Statistics, 'sendAnalytics');

            // Capture (do not run) the queued recovery task so it can be invoked deterministically.
            pushSpy = spyOn(jingleSession.modificationQueue, 'push');
        });

        it('recycles the source via source-remove then source-add when the slot is unchanged', () => {
            spyOn(peerconnection, 'getTrackBySSRC').and.returnValue(mockTrack(111, 'source-A'));

            (jingleSession as any)._recoverWedgedAudioSource(mockTrack(111, 'source-A'));
            runQueuedTask();

            expect(addOrRemoveSpy).toHaveBeenCalledTimes(2);
            expect(addOrRemoveSpy.calls.argsFor(0)[0]).toBe(false); // source-remove first
            expect(addOrRemoveSpy.calls.argsFor(1)[0]).toBe(true); // source-add second
            expect(Statistics.sendAnalytics).toHaveBeenCalled();
        });

        it('skips recovery when the slot was remapped to a different source', () => {
            // The SSRC now belongs to a different source (a remap landed between detection and execution).
            spyOn(peerconnection, 'getTrackBySSRC').and.returnValue(mockTrack(111, 'source-B'));

            (jingleSession as any)._recoverWedgedAudioSource(mockTrack(111, 'source-A'));
            runQueuedTask();

            expect(addOrRemoveSpy).not.toHaveBeenCalled();
            expect(Statistics.sendAnalytics).not.toHaveBeenCalled();
        });

        it('skips recovery when the slot was removed', () => {
            spyOn(peerconnection, 'getTrackBySSRC').and.returnValue(null);

            (jingleSession as any)._recoverWedgedAudioSource(mockTrack(111, 'source-A'));
            runQueuedTask();

            expect(addOrRemoveSpy).not.toHaveBeenCalled();
            expect(Statistics.sendAnalytics).not.toHaveBeenCalled();
        });
    });
});

describe('notifyMySSRCUpdate - P2P source-remove triggers termination', () => {
    const SID = 'sid12345';

    // Minimal SDP helpers.
    const SESSION = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
    const AUDIO = 'm=audio 9 RTP/SAVPF 111\r\nc=IN IP4 0.0.0.0\r\na=mid:0\r\na=sendrecv\r\na=ssrc:11 cname:c\r\n';

    function buildVideoSdp(ssrc: number, sourceName: string): SDP {
        return new SDP(
            SESSION + AUDIO
            + 'm=video 9 RTP/SAVPF 100\r\nc=IN IP4 0.0.0.0\r\na=mid:1\r\na=sendrecv\r\n'
            + `a=ssrc:${ssrc} cname:c\r\n`
            + `a=ssrc:${ssrc} msid:stream track\r\n`
            + `a=ssrc:${ssrc} name:${sourceName}\r\n`
        );
    }

    function buildRecvOnlySdp(): SDP {
        return new SDP(
            SESSION + AUDIO
            + 'm=video 9 RTP/SAVPF 100\r\nc=IN IP4 0.0.0.0\r\na=mid:1\r\na=recvonly\r\n'
        );
    }

    function createSession(isP2P: boolean): {
        session: JingleSessionPC; connection: MockStropheConnection; chatRoom: MockChatRoom;
    } {
        const connection = new MockStropheConnection();

        (connection as any).connected = true;

        const session = new JingleSessionPC(SID, 'peer1', 'peer2', connection, { }, { }, isP2P, false);
        const chatRoom = new MockChatRoom();

        session.initialize(
            chatRoom,
            new MockRTC(),
            { setSSRCOwner: () => { }, removeSSRCOwners: () => { } }, // eslint-disable-line no-empty-function
            { });
        (session as any).state = JingleSessionState.ACTIVE;

        return { session,
            connection,
            chatRoom };
    }

    it('should emit P2P_TERMINATION_REQUIRED and skip source-remove IQ when SSRCs change on P2P', () => {
        const { session, connection, chatRoom } = createSession(/* isP2P */ true);
        const emitSpy = spyOn(chatRoom.eventEmitter, 'emit').and.callThrough();
        const sendIQSpy = spyOn(connection, 'sendIQ');

        // Simulate browser regenerating SSRCs for the same source during renegotiation.
        const oldSDP = buildVideoSdp(100, 'endpointA-v0');
        const newSDP = buildVideoSdp(200, 'endpointA-v0');

        (session as any).notifyMySSRCUpdate(oldSDP, newSDP);

        expect(emitSpy).toHaveBeenCalledWith(XMPPEvents.P2P_TERMINATION_REQUIRED, session);
        expect(sendIQSpy).not.toHaveBeenCalled();
    });

    it('should send source-remove IQ and not emit P2P_TERMINATION_REQUIRED on JVB when SSRCs change', () => {
        const { session, connection, chatRoom } = createSession(/* isP2P */ false);
        const emitSpy = spyOn(chatRoom.eventEmitter, 'emit').and.callThrough();
        const sendIQSpy = spyOn(connection, 'sendIQ');

        const oldSDP = buildVideoSdp(100, 'endpointA-v0');
        const newSDP = buildVideoSdp(200, 'endpointA-v0');

        (session as any).notifyMySSRCUpdate(oldSDP, newSDP);

        expect(sendIQSpy).toHaveBeenCalled();
        expect(emitSpy).not.toHaveBeenCalledWith(XMPPEvents.P2P_TERMINATION_REQUIRED, jasmine.anything());
    });

    it('should not emit P2P_TERMINATION_REQUIRED when only a source-add occurs on P2P', () => {
        const { session, connection, chatRoom } = createSession(/* isP2P */ true);
        const emitSpy = spyOn(chatRoom.eventEmitter, 'emit').and.callThrough();
        const sendIQSpy = spyOn(connection, 'sendIQ');

        // Old SDP has no video SSRCs (recvonly); new SDP adds a source - pure source-add, no source-remove.
        const oldSDP = buildRecvOnlySdp();
        const newSDP = buildVideoSdp(100, 'endpointA-v0');

        (session as any).notifyMySSRCUpdate(oldSDP, newSDP);

        expect(emitSpy).not.toHaveBeenCalledWith(XMPPEvents.P2P_TERMINATION_REQUIRED, jasmine.anything());
        expect(sendIQSpy).toHaveBeenCalled();
    });
});

describe('JingleSessionPC in-place ICE restart', () => {
    const SID = 'sid12345';
    const BRIDGE_SESSION_ID = 'bridge-session-1';

    // The remote (bridge) offer, as it would be found in pc.currentRemoteDescription.
    const REMOTE_OFFER = [
        'v=0',
        'o=- 1 2 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'm=audio 10000 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 10.0.0.1',
        'a=mid:0',
        'a=ice-ufrag:oldfrag',
        'a=ice-pwd:oldpwdoldpwdoldpwdoldpwd',
        'a=candidate:1 1 udp 2130706431 10.0.0.1 10000 typ host generation 0',
        'a=setup:actpass',
        'a=sendonly',
        ''
    ].join('\r\n');

    // The local answer, as it would be found in pc.localDescription after the restart.
    const LOCAL_ANSWER = [
        'v=0',
        'o=- 1 2 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'c=IN IP4 0.0.0.0',
        'a=mid:0',
        'a=ice-ufrag:mynewfrag',
        'a=ice-pwd:mynewpwdmynewpwdmynewpwd',
        'a=fingerprint:sha-256 AA:BB',
        'a=setup:active',
        'a=recvonly',
        ''
    ].join('\r\n');

    /**
     * Builds the <transport> element of an in-place ICE restart 'transport-info'.
     *
     * @param {Object} options - Overrides for the transport attributes.
     * @returns {Element}
     */
    function buildBridgeTransport({
        generation = 1,
        ufrag = 'brnewfrag',
        pwd = 'brnewpwd',
        numCandidates = 2
    }: {
        generation?: unknown; numCandidates?: number; pwd?: Nullable<string>; ufrag?: Nullable<string>;
    } = {}): Element {
        const candidates = [];

        for (let i = 0; i < numCandidates; i++) {
            candidates.push(`<candidate component="1" foundation="${i + 1}" generation="0" id="cand${i}" `
                + `ip="10.0.0.${i + 1}" network="0" port="${10000 + i}" priority="2130706431" protocol="udp" `
                + 'type="host"/>');
        }

        const attributes = [ `ice-generation="${generation}"` ];

        ufrag !== null && attributes.push(`ufrag="${ufrag}"`);
        pwd !== null && attributes.push(`pwd="${pwd}"`);

        const iq = parseXML(
            '<jingle action="transport-info" initiator="focus" sid="sid12345" xmlns="urn:xmpp:jingle:1">'
            + '<content name="audio">'
            + `<transport xmlns="urn:xmpp:jingle:transports:ice-udp:1" ${attributes.join(' ')}>`
            + candidates.join('')
            + '</transport>'
            + '</content>'
            + '</jingle>');

        return findFirst(iq, 'content>transport');
    }

    /**
     * Creates a JVB session with a peer connection mocked up for an ICE restart.
     *
     * @returns {Object}
     */
    function createJvbSession() {
        const connection = new MockStropheConnection();

        (connection as any).connected = true;

        const session = new JingleSessionPC(SID, 'peer1', 'focus', connection, { }, { }, false, false);

        session.initialize(
            new MockChatRoom(),
            new MockRTC(),
            { setSSRCOwner: () => { }, removeSSRCOwners: () => { } }, // eslint-disable-line no-empty-function
            { });
        (session as any).state = JingleSessionState.ACTIVE;
        (session as any)._bridgeSessionId = BRIDGE_SESSION_ID;

        // The modification queue starts paused; it is normally resumed when the offer is accepted.
        (session as any).modificationQueue.resume();

        const tpc = session.peerconnection as any;
        const nativePc = {
            currentRemoteDescription: { sdp: REMOTE_OFFER },
            iceConnectionState: 'connected',
            signalingState: 'stable'
        };

        tpc.peerconnection = nativePc;
        tpc.addIceCandidate = jasmine.createSpy('addIceCandidate').and.returnValue(Promise.resolve());
        Object.defineProperty(tpc, 'localDescription', { get: () => ({ sdp: LOCAL_ANSWER }) });
        Object.defineProperty(tpc, 'remoteDescription', { get: () => ({ sdp: REMOTE_OFFER }) });
        spyOn(tpc, 'setRemoteDescription').and.returnValue(Promise.resolve());
        spyOn(tpc, 'createAnswer').and.returnValue(Promise.resolve({ sdp: LOCAL_ANSWER,
            type: 'answer' }));
        spyOn(tpc, 'setLocalDescription').and.returnValue(Promise.resolve());

        // The restart goes through _renegotiate(), which signals any SSRCs the browser regenerates. That is not
        // what these tests are about, and it would try to send a source-update.
        spyOn(session as any, 'notifyMySSRCUpdate');

        return { connection,
            nativePc,
            session,
            tpc };
    }

    /**
     * Resolves once every task queued on the session's modification queue has run.
     *
     * @param {JingleSessionPC} session - The session.
     * @returns {Promise<void>}
     */
    function drainQueue(session: JingleSessionPC): Promise<void> {
        return new Promise<void>(resolve => {
            (session as any).modificationQueue.push(
                finished => finished(),
                () => resolve());
        });
    }

    describe('restartIce', () => {
        it('sends a session-info with a bridge-session requesting an ICE restart', async () => {
            const { connection, session } = createJvbSession();

            await session.restartIce(IceRestartReason.API);

            expect(connection.sentIQs.length).toBe(1);

            const iq = connection.sentIQs[0].tree();

            expect(findFirst(iq, 'jingle').getAttribute('action')).toBe('session-info');
            expect(findFirst(iq, 'jingle').getAttribute('sid')).toBe(SID);

            const bridgeSession = findFirst(iq, 'jingle>bridge-session');

            expect(bridgeSession.getAttribute('xmlns')).toBe('http://jitsi.org/protocol/focus');
            expect(bridgeSession.getAttribute('id')).toBe(BRIDGE_SESSION_ID);
            expect(bridgeSession.getAttribute('ice-restart')).toBe('true');
        });

        it('rejects without sending anything when no bridge session is known', async () => {
            const { connection, session } = createJvbSession();

            (session as any)._bridgeSessionId = null;

            await expectAsync(session.restartIce(IceRestartReason.API)).toBeRejected();
            expect(connection.sentIQs.length).toBe(0);
        });

        it('rejects for a P2P session', async () => {
            const { session } = createJvbSession();

            (session as any).isP2P = true;

            await expectAsync(session.restartIce(IceRestartReason.API)).toBeRejected();
        });
    });

    describe('onBridgeIceRestartTransport', () => {
        it('applies the patched offer, answers it and only then adds the candidates', async () => {
            const { nativePc, session, tpc } = createJvbSession();

            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 1 }));
            await drainQueue(session);

            expect(tpc.setRemoteDescription).toHaveBeenCalledTimes(1);

            const applied = tpc.setRemoteDescription.calls.mostRecent().args[0];

            expect(applied.type).toBe('offer');
            expect(applied.sdp).toContain('a=ice-ufrag:brnewfrag');
            expect(applied.sdp).toContain('a=ice-pwd:brnewpwd');
            expect(applied.sdp).not.toContain('a=candidate:');

            expect(tpc.createAnswer).toHaveBeenCalledTimes(1);
            expect(tpc.setLocalDescription).toHaveBeenCalledTimes(1);
            expect(tpc.addIceCandidate).toHaveBeenCalledTimes(2);

            // The candidates must be added after the offer/answer, not as part of it.
            expect(tpc.addIceCandidate.calls.first().invocationOrder)
                .toBeGreaterThan(tpc.setLocalDescription.calls.first().invocationOrder);
        });

        it('signals the new local ICE credentials back tagged with the same generation', async () => {
            const { connection, session } = createJvbSession();

            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 7 }));
            await drainQueue(session);

            expect(connection.sentIQs.length).toBe(1);

            const iq = connection.sentIQs[0].tree();

            expect(findFirst(iq, 'jingle').getAttribute('action')).toBe('transport-info');

            const transport = findFirst(iq, 'jingle>content>transport');

            expect(transport.getAttribute('ice-generation')).toBe('7');
            expect(transport.getAttribute('ufrag')).toBe('mynewfrag');
            expect(transport.getAttribute('pwd')).toBe('mynewpwdmynewpwdmynewpwd');
        });

        it('ignores a generation that is not newer than the last one applied', async () => {
            const { connection, session, tpc } = createJvbSession();

            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 3 }));
            await drainQueue(session);
            expect(tpc.setRemoteDescription).toHaveBeenCalledTimes(1);

            // A duplicate and an out-of-order (older) push must both be dropped.
            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 3 }));
            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 2 }));
            await drainQueue(session);

            expect(tpc.setRemoteDescription).toHaveBeenCalledTimes(1);
            expect(connection.sentIQs.length).toBe(1);

            // A newer one is applied.
            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 4 }));
            await drainQueue(session);

            expect(tpc.setRemoteDescription).toHaveBeenCalledTimes(2);
            expect(connection.sentIQs.length).toBe(2);
        });

        it('ignores a transport with an invalid generation', async () => {
            const { session, tpc } = createJvbSession();

            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 'not-a-number' }));
            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 0 }));
            await drainQueue(session);

            expect(tpc.setRemoteDescription).not.toHaveBeenCalled();
        });

        it('ignores a transport with incomplete ICE credentials', async () => {
            const { session, tpc } = createJvbSession();

            session.onBridgeIceRestartTransport(buildBridgeTransport({ pwd: null }));
            session.onBridgeIceRestartTransport(buildBridgeTransport({ ufrag: null }));
            await drainQueue(session);

            expect(tpc.setRemoteDescription).not.toHaveBeenCalled();
        });

        it('still applies a newer generation after one failed to apply', async () => {
            const { session, tpc } = createJvbSession();

            tpc.setRemoteDescription.and.returnValue(Promise.reject(new Error('nope')));
            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 1 }));
            await drainQueue(session);

            expect(tpc.setRemoteDescription).toHaveBeenCalledTimes(1);

            // The same generation is not retried, but a newer one still is.
            tpc.setRemoteDescription.and.returnValue(Promise.resolve());
            session.onBridgeIceRestartTransport(buildBridgeTransport({ generation: 2 }));
            await drainQueue(session);

            expect(tpc.setRemoteDescription).toHaveBeenCalledTimes(2);
        });
    });
});
