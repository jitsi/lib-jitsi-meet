import RTCUtils from './RTCUtils';
import browser from '../browser';
import screenObtainer from './ScreenObtainer';

// TODO move webrtc mocks/polyfills into a easily accessible file when needed
/**
 * A constructor to create a mock for the native MediaStreamTrack.
 */
function MediaStreamTrackMock(kind, options = {}) {
    this.kind = kind;
    this._settings = {};

    if (options.resolution) {
        this._settings.height = options.resolution;
    }
}

MediaStreamTrackMock.prototype.getSettings = function() {
    return this._settings;
};

MediaStreamTrackMock.prototype.stop
    = function() { /** intentionally blank **/ };

/**
 * A constructor to create a mock for the native MediaStream.
 */
function MediaStreamMock() {
    this.id = Date.now();
    this._audioTracks = [];
    this._videoTracks = [];
}

MediaStreamMock.prototype.addTrack = function(track) {
    if (track.kind === 'audio') {
        this._audioTracks.push(track);
    } else if (track.kind === 'video') {
        this._videoTracks.push(track);
    }
};

MediaStreamMock.prototype.getAudioTracks = function() {
    return this._audioTracks;
};

MediaStreamMock.prototype.getTracks = function() {
    return [
        ...this._audioTracks,
        ...this._videoTracks
    ];
};

MediaStreamMock.prototype.getVideoTracks = function() {
    return this._videoTracks;
};

/* eslint-disable max-params */
/**
 * A mock function to be used for stubbing out the wrapper around getUserMedia.
 *
 * @param {String[]} devices - The media devices to obtain. Valid devices are
 * 'audio', 'video', and 'desktop'.
 * @param {Function} onSuccess - An optional success callback to trigger.
 * @param {Function} onError - An optional error callback to trigger. This is
 * not used in this function.
 * @param {Object} options - An object describing the constraints to pass to
 * gum.
 * @private
 * @returns {Promise} A resolved promise with a MediaStreamMock.
 */
function successfulGum(devices, options) {
    /* eslint-enable max-params */

    const mediaStreamMock = new MediaStreamMock();

    if (devices.includes('audio')) {
        mediaStreamMock.addTrack(new MediaStreamTrackMock('audio', options));
    }

    if (devices.includes('video')) {
        mediaStreamMock.addTrack(new MediaStreamTrackMock('video', options));
    }

    if (devices.includes('desktop')) {
        mediaStreamMock.addTrack(new MediaStreamTrackMock('video', options));
    }

    return Promise.resolve(mediaStreamMock);
}

/**
 * General error handling for a promise chain that threw an unexpected error.
 *
 * @param {Error} error - The error object describing what error occurred.
 * @param {function} done - Jasmine's done function to trigger a failed test.
 * @private
 * @returns {void}
 */
function unexpectedErrorHandler(error = {}, done) {
    done.fail(`unexpected error occurred: ${error.message}`);
}

describe('RTCUtils', () => {
    describe('obtainAudioAndVideoPermissions', () => {
        let getUserMediaSpy, isScreenSupportedSpy, oldMediaStream,
            oldMediaStreamTrack, oldWebkitMediaStream;

        beforeEach(() => {
            // FIXME: To get some kind of initial testing working assume a
            // chrome environment so RTCUtils can actually initialize properly.
            spyOn(browser, 'isChrome').and.returnValue(true);
            spyOn(screenObtainer, '_createObtainStreamMethod')
                .and.returnValue(() => { /** intentional no op */ });
            isScreenSupportedSpy = spyOn(screenObtainer, 'isSupported')
                .and.returnValue(true);

            oldMediaStreamTrack = window.MediaStreamTrack;
            window.MediaStreamTrack = MediaStreamTrackMock;

            oldMediaStream = window.MediaStream;
            window.MediaStream = MediaStreamMock;

            oldWebkitMediaStream = window.webkitMediaStream;
            window.webkitMediaStream = MediaStreamMock;
            RTCUtils.init();

            getUserMediaSpy = spyOn(RTCUtils, 'getUserMediaWithConstraints');
        });

        afterEach(() => {
            window.MediaStreamTrack = oldMediaStreamTrack;
            window.MediaStream = oldMediaStream;
            window.webkitMediaStream = oldWebkitMediaStream;
        });

        it('gets audio and video by default', done => {
            getUserMediaSpy.and.callFake(successfulGum);

            RTCUtils.obtainAudioAndVideoPermissions()
                .then(streams => {
                    expect(streams.length).toBe(2);

                    const audioStream = streams.find(stream =>
                        stream.mediaType === 'audio');

                    expect(audioStream).toBeTruthy();
                    expect(audioStream.stream instanceof MediaStreamMock)
                        .toBe(true);
                    expect(audioStream.stream.getAudioTracks().length).toBe(1);

                    const videoStream = streams.find(stream =>
                        stream.mediaType === 'video');

                    expect(videoStream).toBeTruthy();
                    expect(videoStream.stream instanceof MediaStreamMock)
                        .toBe(true);
                    expect(videoStream.stream.getVideoTracks().length).toBe(1);

                    done();
                })
                .catch(error => unexpectedErrorHandler(error, done));
        });

        it('can get an audio track', done => {
            getUserMediaSpy.and.callFake(successfulGum);

            RTCUtils.obtainAudioAndVideoPermissions({ devices: [ 'audio' ] })
                .then(streams => {
                    expect(streams.length).toBe(1);

                    expect(streams[0].stream instanceof MediaStreamMock)
                        .toBe(true);
                    expect(streams[0].stream.getAudioTracks().length).toBe(1);

                    done();
                })
                .catch(error => unexpectedErrorHandler(error, done));

        });

        it('can get a video track', done => {
            getUserMediaSpy.and.callFake(successfulGum);

            RTCUtils.obtainAudioAndVideoPermissions({ devices: [ 'video' ] })
                .then(streams => {
                    expect(streams.length).toBe(1);

                    expect(streams[0].stream instanceof MediaStreamMock)
                        .toBe(true);
                    expect(streams[0].stream.getVideoTracks().length).toBe(1);

                    done();
                })
                .catch(error => unexpectedErrorHandler(error, done));
        });

        it('gets 720 videor resolution by default', done => {
            getUserMediaSpy.and.callFake(successfulGum);

            RTCUtils.obtainAudioAndVideoPermissions({ devices: [ 'video' ] })
                .then(streams => {
                    const videoTrack = streams[0].stream.getVideoTracks()[0];
                    const { height } = videoTrack.getSettings();

                    expect(height).toBe(720);

                    done();
                })
                .catch(error => unexpectedErrorHandler(error, done));
        });

        describe('requesting desktop', () => {
            it('errors if desktop is not supported', done => {
                isScreenSupportedSpy.and.returnValue(false);

                RTCUtils.obtainAudioAndVideoPermissions({
                    devices: [ 'desktop' ] })
                    .then(() => done.fail(
                        'obtainAudioAndVideoPermissions should not succeed'))
                    .catch(error => {
                        expect(error.message)
                            .toBe('Desktop sharing is not supported!');

                        done();
                    });
            });

            it('can obtain a desktop stream', done => {
                spyOn(screenObtainer, 'obtainStream')
                    .and.callFake((options, success) => {
                        const mediaStreamMock = new MediaStreamMock();

                        mediaStreamMock.addTrack(
                            new MediaStreamTrackMock('video', options));

                        success({ stream: mediaStreamMock });
                    });

                RTCUtils.obtainAudioAndVideoPermissions({
                    devices: [ 'desktop' ] })
                    .then(streams => {
                        expect(streams.length).toBe(1);
                        expect(streams[0].videoType).toBe('desktop');

                        done();
                    })
                    .catch(error => unexpectedErrorHandler(error, done));
            });
        });
    });
});
