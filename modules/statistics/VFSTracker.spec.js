
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import * as MediaType from '../../service/RTC/MediaType';
import RTCEvents from '../../service/RTC/RTCEvents';
import * as VideoType from '../../service/RTC/VideoType';
import JitsiLocalTrack from '../RTC/JitsiLocalTrack';
import JitsiRemoteTrack from '../RTC/JitsiRemoteTrack';
import { MockRTC } from '../RTC/MockClasses';
import Listenable from '../util/Listenable';
import { maybeInitRTC } from '../util/TestUtils';

import { VFS_KEY, VFSTracker } from './VFSTracker';

/* eslint-disable require-jsdoc */

class MockConference extends Listenable {
    constructor(rtc) {
        super();
        this.options = {
            config: { }
        };
        this.rtc = rtc;
        this.statistics = {
            rtpStatsMap: new Map(),
            addConnectionStatsListener: () => {

            }
        };
    }

    addTrack(localTrack) {
        this.eventEmitter.emit(JitsiConferenceEvents.TRACK_ADDED, localTrack);
    }

    getActivePeerConnection() {
        return undefined;
    }

    onRemoteTrackAdded(remoteTrack) {
        this.eventEmitter.emit(JitsiConferenceEvents.TRACK_ADDED, remoteTrack);
    }

    _onTrackAttach() { // eslint-disable-line no-empty-function

    }
}

class MockMediaStream {
    constructor(tracks) {
        this._tracks = tracks;
    }
    getTracks() {
        return this._tracks;
    }
}

class MockMediaStreamTrack extends Listenable {
    getConstraints() {
        return { };
    }
    getSettings() {
        return { };
    }
}

class MockRemoteTrack extends JitsiRemoteTrack {
    // eslint-disable-next-line max-params
    constructor({ rtc, conference, participantId, stream, track, ssrc, mediaType, videoType }) {
        super({
            conference,
            mediaType,
            ownerEndpointId: participantId,
            rtc,
            ssrc,
            stream,
            track,
            videoType,
            isP2P: false,
            muted: false
        });
    }
}

class MockContainer extends Listenable {
    constructor(name) {
        super();
        this._name = name;
    }

    requestVideoFrameCallback(callback) {
        this.videoFrameCb = callback;
    }

    execVideoFrameCallback() {
        // The callback must renew the registration when called, so clear it here
        const callback = this.videoFrameCb;

        this.videoFrameCb = undefined;

        callback && callback();

        return callback;
    }

    toString() {
        return `MockContainer[${this._name}]`;
    }
}

function createMockTrack({ conference, participantId, ssrc, mediaType }) {
    const track = new MockMediaStreamTrack();
    const stream = new MockMediaStream([ track ]);

    return new MockRemoteTrack({
        conference,
        participantId,
        rtc: conference.rtc,
        ssrc,
        stream,
        track,
        mediaType: mediaType ? mediaType : MediaType.VIDEO,
        videoType: mediaType === MediaType.VIDEO ? VideoType.CAMERA : undefined
    });
}

function createMockVideoTrack(conference, participantId, ssrc) {
    return createMockTrack({
        conference,
        participantId,
        ssrc
    });
}

function createMockLocalTrack() {
    const track = new MockMediaStreamTrack();
    const stream = new MockMediaStream([ track ]);

    return new JitsiLocalTrack({
        stream,
        track
    });
}

/* eslint-enable require-jsdoc */

describe('VFSTracker', () => {
    const PEER_1_ID = 'remote-peer-1';
    let conference;
    let rtc;
    let vfsTracker;

    beforeAll(() => {
        maybeInitRTC();
    });
    beforeEach(() => {
        rtc = new MockRTC();
        conference = new MockConference(rtc);
        vfsTracker = new VFSTracker(conference);
    });

    it('does not crash if dominant speaker event arrives, before any remote track is added', () => {
        conference.lastDominantSpeaker = PEER_1_ID;
        rtc.eventEmitter.emit(RTCEvents.DOMINANT_SPEAKER_CHANGED, PEER_1_ID);
    });

    describe('watchedTrack', () => {
        it('should never be a local track', () => {
            const localTrack = createMockLocalTrack();
            const container1 = new MockContainer('container1');

            conference.addTrack(localTrack);
            localTrack.attach(container1);
            expect(vfsTracker.watchedTrack).toBe(null);
        });
        it('should never be an audio track', () => {
            const track2 = createMockTrack({
                conference,
                mediaType: MediaType.AUDIO,
                ssrc: 1
            });
            const container1 = new MockContainer('container1');

            conference.addTrack(track2);
            track2.attach(container1);
            expect(vfsTracker.watchedTrack).toBe(null);
        });
    });

    // FIXME local user active speaker
    describe('with remoteTrack', () => {
        let remoteTrack;

        beforeEach(() => {
            remoteTrack = createMockVideoTrack(conference, PEER_1_ID, 1);
            conference.onRemoteTrackAdded(remoteTrack);
        });
        describe('the video frame callback should', () => {
            it('be set on the selected container', () => {
                const container1 = new MockContainer('container1');

                remoteTrack.attach(container1);
                expect(container1.videoFrameCb).toBeTruthy();
            });
            it('be set again if the selected track remains unchanged', () => {
                // The way the video frame callback works it requires the observer to register for the callback again
                // each time it's fired.
                const container1 = new MockContainer('container1');

                remoteTrack.attach(container1);

                container1.execVideoFrameCallback();

                expect(vfsTracker.watchedContainer).toBe(container1);
                expect(container1.videoFrameCb).toBeTruthy();
            });
            it('be cleared if the container is detached', () => {
                const container1 = new MockContainer('container1');

                remoteTrack.attach(container1);
                expect(container1.videoFrameCb).toBeTruthy();

                // The way the VFSTracker tracks if a callback is still valid is by storing a reference in
                // the container instance under the VFS_KEY symbol.
                remoteTrack.detach(container1);
                expect(container1[VFS_KEY]).toBe(undefined);
            });
            it('be a new callback and a new VFS instance on reattach', () => {
                const container1 = new MockContainer('container1');

                remoteTrack.attach(container1);

                const vfsContainer1 = container1[VFS_KEY];
                const onFrameRenderedSpy = spyOn(vfsContainer1, 'onFrameRendered');

                remoteTrack.detach(container1);
                remoteTrack.attach(container1);

                container1.execVideoFrameCallback();
                expect(onFrameRenderedSpy).not.toHaveBeenCalled();
                expect(vfsContainer1).not.toBe(container1[VFS_KEY]);
            });
        });
        it('picks the latest track if there\'s no dominant speaker', () => {
            const container1 = new MockContainer('container1');
            const container2 = new MockContainer('container2');
            const remoteTrack2 = createMockVideoTrack(conference, PEER_1_ID, 2);

            remoteTrack.attach(container1);
            expect(vfsTracker.watchedTrack).toBe(remoteTrack);
            expect(vfsTracker.watchedContainer).toBe(container1);

            conference.onRemoteTrackAdded(remoteTrack2);
            remoteTrack2.attach(container2);
            expect(vfsTracker.watchedTrack).toBe(remoteTrack2);
            expect(vfsTracker.watchedContainer).toBe(container2);
            expect(vfsTracker.watchedContainer).not.toBe(container1);
        });
        it('picks the dominant speaker\'s track if there are multiple tracks', () => {
            const remoteTrack2 = createMockVideoTrack(conference, 'remote-peer-2', 2);

            conference.onRemoteTrackAdded(remoteTrack2);

            const container1 = new MockContainer('container1');
            const container2 = new MockContainer('container2');

            remoteTrack.attach(container1);
            remoteTrack2.attach(container2);

            conference.lastDominantSpeaker = PEER_1_ID;
            rtc.eventEmitter.emit(RTCEvents.DOMINANT_SPEAKER_CHANGED, PEER_1_ID);

            expect(vfsTracker.watchedTrack).toBe(remoteTrack);
            expect(vfsTracker.watchedContainer).toBe(container1);

            // Check if the callback was cleared on the old container
            expect(container2[VFS_KEY]).toBe(undefined);
        });
        it('picks the latest if the dominant speaker is the local participant or not found', () => {
            const container1 = new MockContainer('container1');

            remoteTrack.attach(container1);

            // There's no constant for local participant, it's just a randomly chosen value that will not match any
            // of the remote participants.
            conference.lastDominantSpeaker = 'local-participant';
            rtc.eventEmitter.emit(RTCEvents.DOMINANT_SPEAKER_CHANGED, PEER_1_ID);

            expect(vfsTracker.watchedTrack).toBe(remoteTrack);
            expect(vfsTracker.watchedContainer).toBe(container1);
        });
    });
});
