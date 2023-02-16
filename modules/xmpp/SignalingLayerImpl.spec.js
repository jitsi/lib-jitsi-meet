import { MediaType } from '../../service/RTC/MediaType';
import * as SignalingEvents from '../../service/RTC/SignalingEvents';
import { getSourceNameForJitsiTrack } from '../../service/RTC/SignalingLayer';
import { VideoType } from '../../service/RTC/VideoType';
import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import FeatureFlags from '../flags/FeatureFlags';
import Listenable from '../util/Listenable';

import SignalingLayerImpl, { SOURCE_INFO_PRESENCE_ELEMENT } from './SignalingLayerImpl';

const INITIAL_SOURCE_INFO = { value: JSON.stringify({}) };

// eslint-disable-next-line require-jsdoc
function createMockChatRoom() {
    const chatRoom = {
        ...new Listenable(),
        ...jasmine.createSpyObj('', [
            'addOrReplaceInPresence',
            'setAudioMute',
            'setVideoMute'
        ])
    };

    const listeners = {};

    // Stores presence listeners
    chatRoom.addPresenceListener = (tagName, l) => {
        listeners[tagName] || (listeners[tagName] = []);
        listeners[tagName].push(l);
    };

    // Notify presence listeners
    chatRoom.emitPresenceListener = (node, mucNick) => {
        const nodeListeners = listeners[node.tagName];

        if (nodeListeners) {
            for (const l of nodeListeners) {
                l(node, mucNick);
            }
        }
    };

    // Fakes 'SourceInfo' in the presence by adjusting getLastPresence return value and emitting a presence event.
    chatRoom.mockSourceInfoPresence = (endpointId, sourceInfo) => {
        chatRoom.getLastPresence = () => [ {
            tagName: SOURCE_INFO_PRESENCE_ELEMENT,
            value: JSON.stringify(sourceInfo)
        } ];
        chatRoom.emitPresenceListener({
            tagName: SOURCE_INFO_PRESENCE_ELEMENT,
            value: JSON.stringify(sourceInfo)
        }, endpointId);
    };

    chatRoom.emitParticipantLeft = endpointId => {
        // Only the resource part (MUC nick) is relevant
        chatRoom.eventEmitter.emit(XMPPEvents.MUC_MEMBER_LEFT, `room@server.com/${endpointId}`);
    };

    return chatRoom;
}

describe('SignalingLayerImpl', () => {
    describe('setTrackMuteStatus advertises the track muted status in the chat room', () => {
        describe('with source name signaling enabled', () => {
            const endpointId = 'abcdef12';
            let signalingLayer;
            let chatRoom;

            beforeEach(() => {
                FeatureFlags.init({ });
                signalingLayer = new SignalingLayerImpl();
                chatRoom = createMockChatRoom();
                signalingLayer.setChatRoom(chatRoom);

                // No tracks yet
                expect(chatRoom.addOrReplaceInPresence)
                    .toHaveBeenCalledWith(
                        SOURCE_INFO_PRESENCE_ELEMENT,
                        INITIAL_SOURCE_INFO);
            });
            it('for audio track', () => {
                const audioSourceName = getSourceNameForJitsiTrack(endpointId, MediaType.AUDIO, 0);

                // Audio track: muted
                signalingLayer.setTrackMuteStatus(audioSourceName, true);
                expect(chatRoom.addOrReplaceInPresence)
                    .toHaveBeenCalledWith(
                        SOURCE_INFO_PRESENCE_ELEMENT,
                        { value: `{"${audioSourceName}":{"muted":true}}` });

                // Audio track: unmuted
                signalingLayer.setTrackMuteStatus(audioSourceName, false);
                expect(chatRoom.addOrReplaceInPresence)
                    .toHaveBeenCalledWith(
                        SOURCE_INFO_PRESENCE_ELEMENT,
                        { value: `{"${audioSourceName}":{"muted":false}}` });
            });
            it('for video track', () => {
                const videoSourceName = getSourceNameForJitsiTrack(endpointId, MediaType.VIDEO, 0);

                // Video track: muted
                signalingLayer.setTrackMuteStatus(videoSourceName, true);
                expect(chatRoom.addOrReplaceInPresence)
                    .toHaveBeenCalledWith(
                        SOURCE_INFO_PRESENCE_ELEMENT,
                        { value: `{"${videoSourceName}":{"muted":true}}` });

                // Video track: unmuted
                signalingLayer.setTrackMuteStatus(videoSourceName, false);
                expect(chatRoom.addOrReplaceInPresence)
                    .toHaveBeenCalledWith(
                        SOURCE_INFO_PRESENCE_ELEMENT,
                        { value: `{"${videoSourceName}":{"muted":false}}` });
            });
        });
    });
    describe('setTrackVideoType', () => {
        const endpointId = 'abcdef12';
        let signalingLayer;
        let chatRoom = createMockChatRoom();

        beforeEach(() => {
            signalingLayer = new SignalingLayerImpl();
            chatRoom = createMockChatRoom();
            signalingLayer.setChatRoom(chatRoom);

            // Initial value is set in signalingLayer.setChatRoom
            expect(chatRoom.addOrReplaceInPresence)
                .toHaveBeenCalledWith(
                    SOURCE_INFO_PRESENCE_ELEMENT,
                    INITIAL_SOURCE_INFO);
        });
        it('sends video type in chat room presence', () => {
            const videoSourceName = getSourceNameForJitsiTrack(endpointId, MediaType.VIDEO, 0);

            signalingLayer.setTrackVideoType(videoSourceName, VideoType.CAMERA);
            expect(chatRoom.addOrReplaceInPresence)
                .toHaveBeenCalledWith(
                    SOURCE_INFO_PRESENCE_ELEMENT,
                    { value: '{"abcdef12-v0":{}}' });

            signalingLayer.setTrackVideoType(videoSourceName, VideoType.DESKTOP);
            expect(chatRoom.addOrReplaceInPresence)
                .toHaveBeenCalledWith(
                    SOURCE_INFO_PRESENCE_ELEMENT,
                    { value: '{"abcdef12-v0":{"videoType":"desktop"}}' });

            signalingLayer.setTrackVideoType(videoSourceName, VideoType.CAMERA);
            expect(chatRoom.addOrReplaceInPresence)
                .toHaveBeenCalledWith(
                    SOURCE_INFO_PRESENCE_ELEMENT,
                    { value: '{"abcdef12-v0":{}}' });
        });
    });
    describe('should emit muted/video type events based on presence', () => {
        describe('with:  sourceNameSignaling: true', () => {
            let signalingLayer;
            let chatRoom = createMockChatRoom();

            beforeEach(() => {
                signalingLayer = new SignalingLayerImpl();
                chatRoom = createMockChatRoom();
                signalingLayer.setChatRoom(chatRoom);
            });
            it('from a legacy user (no SourceInfo)', () => {
                const emitterSpy = spyOn(signalingLayer.eventEmitter, 'emit');

                chatRoom.getLastPresence = () => [];
                chatRoom.emitPresenceListener({
                    tagName: 'audiomuted',
                    value: 'true'
                }, 'endpoint1');

                expect(emitterSpy).toHaveBeenCalledWith(
                    SignalingEvents.PEER_MUTED_CHANGED,
                    'endpoint1',
                    'audio',
                    true
                );
            });
            it('from a user with SourceInfo and ssrc-rewriting disabled', () => {
                FeatureFlags.init({ });
                const emitterSpy = spyOn(signalingLayer.eventEmitter, 'emit');
                const sourceInfo = {
                    '12345678-a0': {
                        muted: true
                    }
                };

                chatRoom.mockSourceInfoPresence('endpoint1', sourceInfo);

                // <audiomuted/> still included for backwards compat and ChatRoom will emit the presence event
                chatRoom.emitPresenceListener({
                    tagName: 'audiomuted',
                    value: 'true'
                }, 'endpoint1');

                // Just once event though the legacy presence is there as well
                expect(emitterSpy).toHaveBeenCalledTimes(1);
                expect(emitterSpy).toHaveBeenCalledWith(
                    SignalingEvents.SOURCE_MUTED_CHANGED,
                    '12345678-a0',
                    true
                );
            });

            it('from a user with sourceInfo and ssrc-rewriting enabled', () => {
                FeatureFlags.init({ ssrcRewritingEnabled: true });
                const emitterSpy = spyOn(signalingLayer.eventEmitter, 'emit');
                const sourceInfo = {
                    '12345678-a0': {
                        muted: true
                    }
                };

                chatRoom.mockSourceInfoPresence('endpoint1', sourceInfo);

                // <audiomuted/> still included for backwards compat and ChatRoom will emit the presence event
                chatRoom.emitPresenceListener({
                    tagName: 'audiomuted',
                    value: 'true'
                }, 'endpoint1');

                expect(emitterSpy).toHaveBeenCalledTimes(2);
                expect(emitterSpy.calls.argsFor(1)).toEqual([
                    SignalingEvents.SOURCE_UPDATED,
                    '12345678-a0',
                    'endpoint1',
                    true,
                    undefined
                ]);
            });
        });
    });
    describe('getPeerMediaInfo', () => {
        describe('with:  sourceNameSignaling: true', () => {
            let signalingLayer;
            let chatRoom;

            beforeEach(() => {
                signalingLayer = new SignalingLayerImpl();
                chatRoom = createMockChatRoom();
                signalingLayer.setChatRoom(chatRoom);
            });
            it('will provide default value if only empty source info was sent so far', () => {
                const endpointId = '12345678';

                chatRoom.mockSourceInfoPresence(endpointId, { });

                const audioPeerMediaInfo = signalingLayer.getPeerMediaInfo(endpointId, MediaType.AUDIO);

                expect(audioPeerMediaInfo).toEqual({ muted: true });

                const videoPeerMediaInfo = signalingLayer.getPeerMediaInfo(endpointId, MediaType.VIDEO);

                expect(videoPeerMediaInfo).toEqual({
                    muted: true,
                    videoType: undefined
                });
            });
            describe('will read from SourceInfo if available', () => {
                it('for audio', () => {
                    const endpointId = '12345678';
                    const sourceInfo = {
                        '12345678-a0': {
                            muted: true
                        }
                    };

                    chatRoom.mockSourceInfoPresence(endpointId, sourceInfo);

                    const peerMediaInfo = signalingLayer.getPeerMediaInfo(endpointId, MediaType.AUDIO, '12345678-a0');

                    expect(peerMediaInfo).toEqual({
                        muted: true,
                        sourceName: '12345678-a0'
                    });
                });
                it('for video', () => {
                    const endointId = '12345678';
                    const sourceInfo = {
                        '12345678-v0': {
                            muted: true,
                            videoType: 'desktop'
                        }
                    };

                    chatRoom.mockSourceInfoPresence(endointId, sourceInfo);

                    const peerMediaInfo = signalingLayer.getPeerMediaInfo(endointId, MediaType.VIDEO, '12345678-v0');

                    expect(peerMediaInfo).toEqual({
                        muted: true,
                        sourceName: '12345678-v0',
                        videoType: 'desktop'
                    });
                });
            });
        });
    });
    describe('will remove source info(cleanup corner cases)', () => {
        let signalingLayer;
        let chatRoom;
        const endpointId = '12345678';

        beforeEach(() => {
            signalingLayer = new SignalingLayerImpl();
            chatRoom = createMockChatRoom();

            signalingLayer.setChatRoom(chatRoom);
        });
        it('when participant leaves', () => {
            const sourceInfo = {
                '12345678-v0': {
                    muted: false,
                    videoType: 'desktop'
                }
            };

            chatRoom.mockSourceInfoPresence(endpointId, sourceInfo);

            expect(signalingLayer.getPeerSourceInfo(endpointId, '12345678-v0')).toBeDefined();

            chatRoom.emitParticipantLeft(endpointId);

            expect(signalingLayer.getPeerSourceInfo(endpointId, '12345678-v0')).toBeUndefined();
        });
    });
});
