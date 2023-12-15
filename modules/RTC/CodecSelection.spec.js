import * as JitsiConferenceEvents from '../../JitsiConferenceEvents.ts';
import Listenable from '../util/Listenable.js';
import JingleSessionPC from '../xmpp/JingleSessionPC.js';
import { MockChatRoom, MockStropheConnection } from '../xmpp/MockClasses.js';

import { CodecSelection } from './CodecSelection.js';
import { MockRTC, MockSignalingLayerImpl } from './MockClasses.js';

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
    let codecSelection;
    let conference;
    let connection;
    let jingleSession;
    let options;
    let participant1, participant2;
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
    });

    describe('when codec preference list is used in config.js', () => {
        beforeEach(() => {
            options = {
                jvb: {
                    preferenceOrder: [ 'VP9', 'VP8', 'H264' ]
                }
            };

            codecSelection = new CodecSelection(conference, options);
            spyOn(jingleSession, 'setVideoCodecs');
        });

        it('and remote endpoints use the new codec selection logic', () => {
            // Add a second user joining the call.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'vp9', 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(0);

            // Add a third user joining the call with a subset of codecs.
            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ]);

            // Make p2 leave the call
            conference.removeParticipant(participant2);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(1);
        });

        it('and remote endpoints use the old codec selection logic (RN)', () => {
            // Add a second user joining the call.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, null, 'vp8');

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ]);

            // Add a third user (newer) to the call.
            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'vp9', 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ]);

            // Make p1 leave the call
            conference.removeParticipant(participant1);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(2);
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

            codecSelection = new CodecSelection(conference, options);
            spyOn(jingleSession, 'setVideoCodecs');
        });

        it('and remote endpoints use the new codec selection logic', () => {
            // Add a second user joining the call.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'vp9', 'vp8', 'h264' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(0);

            // Add a third user joining the call with a subset of codecs.
            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ]);

            // Make p2 leave the call
            conference.removeParticipant(participant2);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(1);
        });

        it('and remote endpoint prefers a codec that is locally disabled', () => {
            // Add a second user joining the call the prefers H.264 and VP8.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, [ 'h264', 'vp8' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ]);
        });

        it('and remote endpoints use the old codec selection logic (RN)', () => {
            // Add a second user joining the call.
            participant1 = new MockParticipant('remote-1');
            conference.addParticipant(participant1, null, 'vp8');

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ]);

            // Add a third user (newer) to the call.
            participant2 = new MockParticipant('remote-2');
            conference.addParticipant(participant2, [ 'vp9', 'vp8', 'h264' ]);

            expect(jingleSession.setVideoCodecs).toHaveBeenCalledWith([ 'vp8' ]);

            // Make p1 leave the call
            conference.removeParticipant(participant1);
            expect(jingleSession.setVideoCodecs).toHaveBeenCalledTimes(2);
        });
    });
});
