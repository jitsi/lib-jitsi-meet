import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import { MockRTC, MockSignalingLayerImpl } from '../RTC/MockClasses';
import Listenable from '../util/Listenable';
import { nextTick } from '../util/TestUtils';
import JingleSessionPC from '../xmpp/JingleSessionPC';
import { MockChatRoom, MockStropheConnection } from '../xmpp/MockClasses';

import QualityController from './QualityController';

/**
 * MockParticipant
 */
class MockParticipant {
    /**
     * A constructor...
     */
    constructor(id) {
        this.id = id;
    }

    /**
     * Returns the endpoint id of the participant.
     * @returns <string>
     */
    getId() {
        return this.id;
    }
}

/**
 * MockLocalTrack
 */
class MockLocalTrack {
    /**
     * Constructor
     * @param {number} resolution
     * @param {string} videoType
     */
    constructor(resolution, videoType) {
        this.maxEnabledResolution = resolution;
        this.videoType = videoType;
    }

    /**
     * Returns the video type of the mock local track.
     * @returns {string}
     */
    getVideoType() {
        return this.videoType;
    }
}

/**
 * MockConference
 */
class MockConference extends Listenable {
    /**
     * A constructor...
     */
    constructor() {
        super();
        this.options = {
            config: {}
        };

        this.activeMediaSession = undefined;
        this.mediaSessions = [];
        this.participants = [];
        this._signalingLayer = new MockSignalingLayerImpl();
    }

    /**
     * Add a mock participant to the conference
     * @param {MockParticipant} participant
     * @param {Array<string>} codecList
     * @param {String} codecType
     */
    addParticipant(participant, codecList, codecType) {
        this.participants.push(participant);
        this._signalingLayer.setPeerMediaInfo(true, participant.getId(), codecList, codecType);
        this.eventEmitter.emit(JitsiConferenceEvents.USER_JOINED);
    }

    /**
     * Returns the active media session.
     * @returns {JingleSessionPC}
     */
    getActiveMediaSession() {
        return this.jvbJingleSession;
    }

    /**
     * Returns the list of participants.
     * @returns Array<MockParticipant>
     */
    getParticipants() {
        return this.participants;
    }

    /**
     * Checks if E2EE is enabled.
     * @returns {boolean}
     */
    isE2EEEnabled() {
        return false;
    }

    /**
     * Removes the participant from the conference.
     * @param {MockParticipant} endpoint
     */
    removeParticipant(endpoint) {
        this.participants = this.participants.filter(p => p !== endpoint);
        this._signalingLayer.setPeerMediaInfo(false, endpoint.getId());
        this.eventEmitter.emit(JitsiConferenceEvents.USER_LEFT);
    }
}

describe('Codec Selection', () => {
    /* eslint-disable-next-line no-unused-vars */
    let qualityController;
    let conference;
    let connection;
    let jingleSession;
    let options;
    let participant1, participant2, participant3;
    let rtc;
    const SID = 'sid12345';

    beforeEach(() => {
        conference = new MockConference();
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

        rtc = new MockRTC();

        jingleSession.initialize(
            /* ChatRoom */ new MockChatRoom(),
            /* RTC */ rtc,
            /* Signaling layer */ conference._signalingLayer,
            /* options */ { });
        conference.jvbJingleSession = jingleSession;
        conference.rtc = rtc;
    });

    describe('when codec preference list is used in config.js', () => {
        beforeEach(() => {
            options = {
                jvb: {
                    preferenceOrder: [ 'VP9', 'VP8', 'H264' ],
                    screenshareCodec: 'VP9'
                }
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
                }
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
                }
            };
            jasmine.clock().install();
            qualityController = new QualityController(conference, options);
            spyOn(jingleSession, 'setVideoCodecs');
        });

        afterEach(() => {
            jasmine.clock().uninstall();
        });

        it('and encode resolution is limited by cpu for camera tracks', () => {
            const localTrack = new MockLocalTrack(720, 'camera');

            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'av1', 'vp9', 'vp8' ], undefined);

            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'av1', 'vp9', 'vp8' ], undefined);

            qualityController.codecController.changeCodecPreferenceOrder(localTrack, 'av1');

            return nextTick(121000).then(() => {
                expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp9', 'av1', 'vp8' ], undefined);
            })
            .then(() => {
                participant3 = new MockParticipant('remote-3');
                conference.addParticipant(participant3, [ 'av1', 'vp9', 'vp8' ]);

                // Expect the local endpoint to continue sending VP9.
                expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp9', 'av1', 'vp8' ], undefined);
            });
        });

        it('and does not change codec if the current codec is already the lowest complexity codec', () => {
            const localTrack = new MockLocalTrack(720, 'camera');

            qualityController.codecController.codecPreferenceOrder.jvb = [ 'vp8', 'vp9', 'av1' ];

            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8', 'vp9', 'av1' ], undefined);

            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'av1', 'vp9', 'vp8' ]);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8', 'vp9', 'av1' ], undefined);

            qualityController.codecController.changeCodecPreferenceOrder(localTrack, 'vp8');

            return nextTick(121000).then(() => {
                expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8', 'vp9', 'av1' ], undefined);
            })
            .then(() => {
                participant3 = new MockParticipant('remote-3');
                conference.addParticipant(participant3, [ 'av1', 'vp9', 'vp8' ]);

                // Expect the local endpoint to continue sending VP9.
                expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8', 'vp9', 'av1' ], undefined);
            });
        });
    });
});
