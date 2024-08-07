import { MockPeerConnection, MockRTC } from '../RTC/MockClasses';
import { nextTick } from '../util/TestUtils';
import JingleSessionPC from '../xmpp/JingleSessionPC';
import { MockChatRoom, MockStropheConnection } from '../xmpp/MockClasses';

import { MockConference, MockLocalTrack, MockParticipant } from './MockClasses';
import { FixedSizeArray, QualityController } from './QualityController';

describe('Codec Selection', () => {
    let qualityController;
    let conference;
    let connection;
    let jingleSession;
    let options;
    let participant1, participant2, participant3;
    let rtc;
    const SID = 'sid12345';
    let tpc;

    beforeEach(() => {
        rtc = new MockRTC();
        conference = new MockConference(rtc);
        connection = new MockStropheConnection();
        jingleSession = new JingleSessionPC(
            SID,
            'peer1',
            'peer2',
            connection,
            { },
            { },
            false,
            false);

        jingleSession.initialize(
            /* ChatRoom */ new MockChatRoom(),
            /* RTC */ rtc,
            /* Signaling layer */ conference._signalingLayer,
            /* options */ { });
        conference.jvbJingleSession = jingleSession;
    });

    describe('when codec preference list is used in config.js', () => {
        beforeEach(() => {
            options = {
                jvb: {
                    preferenceOrder: [ 'VP9', 'VP8', 'H264' ],
                    screenshareCodec: 'VP9'
                },
                p2p: {}
            };

            qualityController = new QualityController(conference, options);
            spyOn(jingleSession, 'setVideoCodecs');
        });

        it('and remote endpoints use the new codec selection logic', () => {
            // Add a second user joining the call.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'vp9', 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(1);

            // Add a third user joining the call with a subset of codecs.
            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ], 'vp9');

            // Make p2 leave the call
            conference.removeParticipant(participant2);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(3);
        });

        it('and remote endpoints use the old codec selection logic (RN)', () => {
            // Add a second user joining the call.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, null, 'vp8');

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ], 'vp9');

            // Add a third user (newer) to the call.
            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'vp9', 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ], 'vp9');

            // Make p1 leave the call
            conference.removeParticipant(participant1);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(3);
        });
    });

    describe('when deprecated configs are used in config.js', () => {
        beforeEach(() => {
            options = {
                jvb: {
                    preferredCodec: 'VP9',
                    disabledCodec: 'H264'
                },
                p2p: {}
            };

            qualityController = new QualityController(conference, options);
            spyOn(jingleSession, 'setVideoCodecs');
        });

        it('and remote endpoints use the new codec selection logic', () => {
            // Add a second user joining the call.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'vp9', 'vp8', 'h264' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(1);

            // Add a third user joining the call with a subset of codecs.
            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ], undefined);

            // Make p2 leave the call
            conference.removeParticipant(participant2);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(3);
        });

        it('and remote endpoint prefers a codec that is locally disabled', () => {
            // Add a second user joining the call the prefers H.264 and VP8.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'h264', 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ], undefined);
        });

        it('and remote endpoints use the old codec selection logic (RN)', () => {
            // Add a second user joining the call.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, null, 'vp8');

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ], undefined);

            // Add a third user (newer) to the call.
            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'vp9', 'vp8', 'h264' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ], undefined);

            // Make p1 leave the call
            conference.removeParticipant(participant1);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(3);
        });
    });

    describe('when codec switching is triggered based on outbound-rtp stats', () => {
        beforeEach(() => {
            options = {
                jvb: {
                    preferenceOrder: [ 'AV1', 'VP9', 'VP8' ]
                },
                p2p: {}
            };
            jasmine.clock().install();
            qualityController = new QualityController(conference, options);
            spyOn(jingleSession, 'setVideoCodecs');
        });

        afterEach(() => {
            jasmine.clock().uninstall();
        });

        it('and encode resolution is limited by cpu for camera tracks', async () => {
            const localTrack = new MockLocalTrack('1', 720, 'camera');

            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'av1', 'vp9', 'vp8' ], undefined);

            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'av1', 'vp9', 'vp8' ], undefined);

            qualityController.codecController.changeCodecPreferenceOrder(localTrack, 'av1');

            await nextTick(121000);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp9', 'av1', 'vp8' ], undefined);

            participant3 = new MockParticipant('remote-3');
            conference.addParticipant(participant3, [ 'av1', 'vp9', 'vp8' ]);

            // Expect the local endpoint to continue sending VP9.
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp9', 'av1', 'vp8' ], undefined);
        });

        it('and does not change codec if the current codec is already the lowest complexity codec', async () => {
            const localTrack = new MockLocalTrack('1', 720, 'camera');

            qualityController.codecController.codecPreferenceOrder.jvb = [ 'vp8', 'vp9', 'av1' ];

            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8', 'vp9', 'av1' ], undefined);

            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8', 'vp9', 'av1' ], undefined);

            qualityController.codecController.changeCodecPreferenceOrder(localTrack, 'vp8');

            await nextTick(121000);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8', 'vp9', 'av1' ], undefined);

            participant3 = new MockParticipant('remote-3');
            conference.addParticipant(participant3, [ 'av1', 'vp9', 'vp8' ]);

            // Expect the local endpoint to continue sending VP9.
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8', 'vp9', 'av1' ], undefined);
        });
    });

    describe('when codec switching should be triggered based on outbound-rtp stats', () => {
        beforeEach(() => {
            options = {
                enableAdaptiveMode: true,
                jvb: {
                    preferenceOrder: [ 'AV1', 'VP9', 'VP8' ]
                },
                p2p: {}
            };
            jasmine.clock().install();
            tpc = new MockPeerConnection();
            qualityController = new QualityController(conference, options);
            spyOn(jingleSession, 'setVideoCodecs');
        });

        afterEach(() => {
            jasmine.clock().uninstall();
        });

        it('and encode resolution is limited by cpu for camera tracks', async () => {
            const localTrack = new MockLocalTrack('1', 720, 'camera');

            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'av1', 'vp9', 'vp8' ], undefined);

            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'av1', 'vp9', 'vp8' ], undefined);

            const sourceStats = {
                avgEncodeTime: 12,
                codec: 'AV1',
                encodeResolution: 360,
                qualityLimitationReason: 'cpu',
                localTrack,
                timestamp: 1,
                tpc
            };

            qualityController._encodeTimeStats = new Map();
            const data = new FixedSizeArray(10);

            data.add(sourceStats);
            qualityController._encodeTimeStats.set(localTrack.rtcId, data);

            qualityController._performQualityOptimizations(sourceStats);
            await nextTick(60000);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp9', 'av1', 'vp8' ], undefined);

            participant3 = new MockParticipant('remote-3');
            conference.addParticipant(participant3, [ 'av1', 'vp9', 'vp8' ]);

            // Expect the local endpoint to continue sending VP9.
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp9', 'av1', 'vp8' ], undefined);

            // If the cpu limitation continues to exist, client should switch to vp8.
            const updatedStats = {
                avgEncodeTime: 12,
                codec: 'VP9',
                encodeResolution: 360,
                qualityLimitationReason: 'cpu',
                localTrack,
                timestamp: 1,
                tpc
            };

            data.add(updatedStats);
            qualityController._performQualityOptimizations(updatedStats);
            await nextTick(60000);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8', 'vp9', 'av1' ], undefined);
        });
    });

    describe('When codec switching should not be triggered based on outbound-rtp stats', () => {
        beforeEach(() => {
            options = {
                enableAdaptiveMode: false,
                jvb: {
                    preferenceOrder: [ 'AV1', 'VP9', 'VP8' ]
                },
                p2p: {}
            };
            jasmine.clock().install();
            tpc = new MockPeerConnection();
            qualityController = new QualityController(conference, options);
            spyOn(jingleSession, 'setVideoCodecs');
        });

        afterEach(() => {
            jasmine.clock().uninstall();
        });

        it('and the client encounters cpu limitation with high complexity codec', async () => {
            const localTrack = new MockLocalTrack('1', 720, 'camera');
            const sourceStats = {
                avgEncodeTime: 12,
                codec: 'AV1',
                encodeResolution: 360,
                qualityLimitationReason: 'cpu',
                localTrack,
                timestamp: 1,
                tpc
            };

            qualityController._performQualityOptimizations(sourceStats);
            await nextTick(60000);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(0);
        });
    });
});
