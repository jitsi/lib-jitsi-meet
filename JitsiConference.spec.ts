import FeatureFlags from './modules/flags/FeatureFlags';
import { nextTick } from './modules/util/TestUtils';

import JitsiConference from './JitsiConference';
import { MockJitsiLocalTrack } from './modules/RTC/MockClasses';
import Listenable from './modules/util/Listenable';
import { MockChatRoom } from './modules/xmpp/MockClasses';
import { MediaType } from './service/RTC/MediaType';
import { VideoType } from './service/RTC/VideoType';
import browser from './modules/browser';

class MockXmpp extends Listenable {
    connection: {
        options: { hosts: {}; videoQuality: {} };
        xmpp: MockXmpp;
        jingle: { newP2PJingleSession: () => undefined }
    };
    constructor() {
        super();
    }

    isRoomCreated() {
        return false;
    }

    createRoom() {
        return new MockChatRoom();
    }

    newP2PJingleSession() {
        return undefined;
    }
}

class MockOffer {
    find() {
        return {
            attr: () => {
                // This is not written in a generic way and is intended for this condition to return true (to make p2p work):
                // https://github.com/jitsi/lib-jitsi-meet/blob/a519f18b9ae33f34968b60be3ab123c81288f602/JitsiConference.js#L2092
                return '0';
            }
        }
    }
}

function createMockConfig() {
    return {
        hosts: {
        },
        videoQuality: {
        }
    };
}

function createMockConnection() {
    const xmpp = new MockXmpp();
    const connection = {
        xmpp,
        options: createMockConfig(),
        jingle: {
            newP2PJingleSession: () => undefined,
        }
    };
    xmpp.connection = connection;

    return connection;
}

class MockJingleSessionPC {
    private isP2P: boolean;
    private peerconnection: {
        getLocalTracks: () => MockJitsiLocalTrack[],
        getStats: () => Promise<[]>,
        getAudioLevels: () => [],

    };
    private _delayMs: number;
    constructor({ isP2P }: { isP2P: boolean }) {
        this.isP2P = isP2P;
        this._delayMs = 0;
        this.peerconnection = {
            getLocalTracks: () => [],
            getStats: () => Promise.resolve([]),
            getAudioLevels: () => [],
        }
    }

    isReady() {
        return true;
    }

    initialize() { }

    acceptOffer(offer, success, failure, localTracks) { }

    invite(localTracks: MockJitsiLocalTrack[]) { }

    _executeWithDelay(workload: () => void) {
        return this._delayMs > 0 ? setTimeout(workload, this._delayMs) : workload();
    }

    async replaceTrack(oldTrack: MockJitsiLocalTrack, newTrack: MockJitsiLocalTrack) {
        return new Promise<void>(resolve => this._executeWithDelay(resolve));
    }

    async addTracks(tracks: MockJitsiLocalTrack[]) {
        return new Promise<void>(resolve => this._executeWithDelay(resolve));
    }

    addDelayToTrackOperations(delayMs) {
        this._delayMs = delayMs;
    }

    close() {

    }
}

function startJvbSession(conference) {
    const jvbSession = new MockJingleSessionPC({ isP2P: false });

    conference.onIncomingCall(jvbSession);

    return jvbSession;
}

function startP2PSession(conference) {
    const p2pJingleSession = new MockJingleSessionPC({ isP2P: true });

    // Need to inject the mock class here:
    spyOn(conference.xmpp.connection.jingle, 'newP2PJingleSession').and.returnValue(p2pJingleSession);

    // This executes the code-path that sends an invite to the 'usr@server.com/conn1' JID
    conference._startP2PSession('user@server.com/conn1');

    return p2pJingleSession;
}

describe('JitsiConference', () => {
    let conference;

    beforeEach(() => {
        conference = new JitsiConference({
            name: 'test-conf-1',
            connection: createMockConnection(),
            config: createMockConfig()
        });
        jasmine.clock().install();
    });

    afterEach(() => {
        jasmine.clock().uninstall();
    });

    describe('addTrack', () => {
        it('should throw an error when a falsy value is passed a the track argument', async () => {
            try {
                conference.addTrack(undefined);
                fail('addTrack should throw');
            } catch (error) {
                expect(error.message).toBe('addTrack - a track is required');
            }
        });
        it('should throw if 2nd video track of the same video kind is added', async () => {
            const cameraTrack1 = new MockJitsiLocalTrack(360, MediaType.VIDEO, VideoType.CAMERA);
            const cameraTrack2 = new MockJitsiLocalTrack(720, MediaType.VIDEO, VideoType.CAMERA);
            const screenTrack1 = new MockJitsiLocalTrack(1080, MediaType.VIDEO, VideoType.DESKTOP);

            await conference.addTrack(cameraTrack1);
            await conference.addTrack(screenTrack1);
            await conference.addTrack(cameraTrack2)
                .then(
                    () => fail('did not throw'),
                    error => expect(error.message).toBe('Cannot add second "camera" video track')
                );
        });
        it('should be a NOOP if the track is in the conference already', async () => {
            const jvbSession = startJvbSession(conference);
            const cameraTrack1 = new MockJitsiLocalTrack(360, MediaType.VIDEO, VideoType.CAMERA);

            // FIXME JingleSessionPC.replaceTrack is used to add primary video track instead of addTrack
            // const addTracksSpy = spyOn(jvbSession, 'addTracks');
            const replaceTracksSpy = spyOn(jvbSession, 'replaceTrack');

            await conference.addTrack(cameraTrack1);
            await conference.addTrack(cameraTrack1);
            await conference.addTrack(cameraTrack1);

            expect(replaceTracksSpy)
                .withContext('add track on the JingleSession should have been called once with the camera track')
                .toHaveBeenCalledOnceWith(null, cameraTrack1);
        });
    });
    describe('JVB JingleSession should pickup the local tracks', () => {
        it('when created while track operation is in-progress on the P2P session', async () => {
            const p2pJingleSession = startP2PSession(conference);

            p2pJingleSession.addDelayToTrackOperations(1000);

            const cameraTrack1 = new MockJitsiLocalTrack(360, MediaType.VIDEO, VideoType.CAMERA);

            conference.addTrack(cameraTrack1);

            await nextTick(500);

            const jvbSession = new MockJingleSessionPC({ isP2P: false });
            // FIXME adjust to addTrack once JitsiConference will start using addTrack instead of replace for the primary tracks
            const replaceTrackSpy = spyOn(jvbSession, 'replaceTrack');

            conference.onIncomingCall(jvbSession);

            await nextTick(1000);
            expect(replaceTrackSpy)
                .withContext('replaceTrack should have been called with a track at the 1500ms mark')
                .toHaveBeenCalledOnceWith(null, cameraTrack1);
        });
    })
    describe('Peer-to-peer JingleSession should pickup the local tracks', () => {
        it('when offer created while track operation is in-progress on the JVB session', async () => {
            const jvbSession = startJvbSession(conference);
            const cameraTrack1 = new MockJitsiLocalTrack(360, MediaType.VIDEO, VideoType.CAMERA);

            // It will take 1000ms to add local track to the conference
            jvbSession.addDelayToTrackOperations(1000);
            conference.addTrack(cameraTrack1);

            // After 500ms start the P2P session
            await nextTick(500);
            const p2pJingleSession = new MockJingleSessionPC({ isP2P: true });
            // FIXME adjust to addTrack once JitsiConference will start using addTrack instead of replace for the primary tracks
            const replaceTrackSpy = spyOn(p2pJingleSession, 'replaceTrack');
            spyOn(conference.xmpp.connection.jingle, 'newP2PJingleSession').and.returnValue(p2pJingleSession);
            conference._startP2PSession('jid');

            await nextTick(1000);
            expect(replaceTrackSpy)
                .withContext('invite should have been called with the camera track by the 1500ms mark')
                .toHaveBeenCalledOnceWith(null, cameraTrack1);
        });
        it('when offer accepted while track operation is in-progress on the JVB session', async () => {
            const jvbSession = startJvbSession(conference);
            const cameraTrack1 = new MockJitsiLocalTrack(360, MediaType.VIDEO, VideoType.CAMERA);

            // It will take 1000ms to add local track to the conference
            jvbSession.addDelayToTrackOperations(1000);
            conference.addTrack(cameraTrack1);

            // After 500ms start the P2P session. Note that addTrack is still in progress and the conference needs to
            // wait with calling 'accept offer', so that the track is included correctly (there's no flow that would
            // pick it up later).
            await nextTick(500);
            // Different mocks to satisfy the P2P flow starting at conference.onIncomingCall:
            spyOn(conference, 'isP2PEnabled').and.returnValue(true);
            spyOn(conference, '_shouldBeInP2PMode').and.returnValue(true);
            const p2pSession = new MockJingleSessionPC({ isP2P: true });
            // FIXME adjust to addTrack once JitsiConference will start using addTrack instead of replace for the primary tracks
            const replaceTrackSpy = spyOn(p2pSession, 'replaceTrack');
            const mockOffer = new MockOffer();
            conference.onIncomingCall(p2pSession, mockOffer);

            await nextTick(1000);
            expect(replaceTrackSpy)
                .withContext('replaceTrack should have been called with a track on the P2P session by the 1500ms mark')
                .toHaveBeenCalledOnceWith(null, cameraTrack1);
        });
    })
    describe('replaceTrack', () => {
        it('replaces tracks correctly when waiting for past promises to resolve', async () => {
            const cameraTrack1 = new MockJitsiLocalTrack(360, MediaType.VIDEO, VideoType.CAMERA);
            const cameraTrack2 = new MockJitsiLocalTrack(361, MediaType.VIDEO, VideoType.CAMERA);
            const cameraTrack3 = new MockJitsiLocalTrack(362, MediaType.VIDEO, VideoType.CAMERA);
            const cameraTrack4 = new MockJitsiLocalTrack(363, MediaType.VIDEO, VideoType.CAMERA);

            const jvbSession = startJvbSession(conference);

            const addTracksSpy = spyOn(jvbSession, 'addTracks');
            const replaceTrackSpy = spyOn(jvbSession, 'replaceTrack');

            await conference.addTrack(cameraTrack1);
            await conference.replaceTrack(cameraTrack1, cameraTrack2);
            await conference.replaceTrack(cameraTrack2, cameraTrack3);
            await conference.replaceTrack(cameraTrack3, cameraTrack4);
            expect(conference.getLocalVideoTracks()[0])
                .withContext('track 3 should have been replaced with track 4')
                .toBe(cameraTrack4);

            // FIXME replaceTrack is used on JingleSessionPC instead of the addTrack method
            // expect(addTracksSpy)
            //     .toHaveBeenCalledOnceWith([cameraTrack1]);
            // FIXME +1 accounts for replace track used to add the first track of same video type
            expect(replaceTrackSpy)
                .toHaveBeenCalledTimes(3 + 1);

            // Verify that the tracks were actually replaced in the expected sequence on the JingleSession level:

            // FIXME addTrack - called as replaceTrack(null, cameraTrack1)
            expect(replaceTrackSpy.calls.all()[0].args[0]).toEqual(null);
            expect(replaceTrackSpy.calls.all()[0].args[1]).toEqual(cameraTrack1);

            // replaceTrack(cameraTrack1, cameraTrack2)
            expect(replaceTrackSpy.calls.all()[1].args[0]).toEqual(cameraTrack1);
            expect(replaceTrackSpy.calls.all()[1].args[1]).toEqual(cameraTrack2);

            // replaceTrack(cameraTrack2, cameraTrack3)
            expect(replaceTrackSpy.calls.all()[2].args[0]).toEqual(cameraTrack2);
            expect(replaceTrackSpy.calls.all()[2].args[1]).toEqual(cameraTrack3);

            // replaceTrack(cameraTrack3, cameraTrack4)
            expect(replaceTrackSpy.calls.all()[3].args[0]).toEqual(cameraTrack3);
            expect(replaceTrackSpy.calls.all()[3].args[1]).toEqual(cameraTrack4);
        });
        it('should not allow to replace tracks of different video types', async () => {
            const cameraTrack = new MockJitsiLocalTrack(360, MediaType.VIDEO, VideoType.CAMERA);
            const screenTrack = new MockJitsiLocalTrack(1080, MediaType.VIDEO, VideoType.DESKTOP);

            await conference.addTrack(cameraTrack);

            try {
                conference.replaceTrack(cameraTrack, screenTrack);
                fail('Should throw an error');
            } catch(error) {
                expect(error.message)
                    .toBe(
                        'Replacing a track of videoType=camera with a track of videoType=desktop'
                            + ' is not supported in this mode.');
            }
        });
    })
});
