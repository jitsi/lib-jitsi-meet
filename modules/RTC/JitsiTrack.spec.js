
import * as JitsiTrackEvents from '../../JitsiTrackEvents';
import { maybeInitRTC } from '../util/TestUtils';

import JitsiLocalTrack from './JitsiLocalTrack';

/* eslint-disable require-jsdoc */

class MockMediaStream {
    constructor(tracks) {
        this._tracks = tracks;
    }
    getTracks() {
        return this._tracks;
    }
}

class MockMediaStreamTrack {
    getConstraints() {
        return { };
    }
    getSettings() {
        return { };
    }
}

/* eslint-enable require-jsdoc */

describe('JitsiTrack', () => {
    beforeAll(() => {
        maybeInitRTC();
    });
    describe('attachTrack', () => {
        let localTrack;

        beforeEach(() => {
            const track = new MockMediaStreamTrack();
            const stream = new MockMediaStream([ track ]);
            const options = {
                stream,
                track
            };

            localTrack = new JitsiLocalTrack(options);
        });
        it('fires TRACK_ATTACHED event', () => {
            const listener = {
                // eslint-disable-next-line no-empty-function
                onTrackAttached: () => { }
            };
            const listenerSpy = spyOn(listener, 'onTrackAttached');

            localTrack.on(
                JitsiTrackEvents._TRACK_ATTACHED,
                listener.onTrackAttached.bind(listener));
            const container = { };

            localTrack.attach(container);
            expect(listenerSpy).toHaveBeenCalled();
        });
        it('fires TRACK_DETACHED event', () => {
            const listener = {
                // eslint-disable-next-line no-empty-function
                onTrackDetached: () => { }
            };
            const listenerSpy = spyOn(listener, 'onTrackDetached');
            const container = { };

            localTrack.on(
                JitsiTrackEvents._TRACK_DETACHED,
                listener.onTrackDetached.bind(listener));

            localTrack.detach(container);
            expect(listenerSpy).toHaveBeenCalled();
        });
    });
});
