import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import RTCEvents from '../../service/RTC/RTCEvents';
import Listenable from '../util/Listenable';
import MediaSessionEvents from '../xmpp/MediaSessionEvents';

import { SendVideoController } from './SendVideoController';

// JSDocs disabled for Mock classes to avoid duplication - check on the original classes for info.
/* eslint-disable require-jsdoc */
/**
 * A mock JingleSessionPC impl that fit the needs of the SendVideoController module.
 * Should a generic, shared one exist in the future this test file should switch to use it too.
 */
class MockJingleSessionPC extends Listenable {
    constructor(rtc, isP2P) {
        super();
        this.rtc = rtc;
        this.isP2P = isP2P;
        this._remoteRecvMaxFrameHeight = undefined;
        this.senderVideoConstraint = undefined;
    }

    getRemoteRecvMaxFrameHeight() {
        return this._remoteRecvMaxFrameHeight;
    }

    setSenderVideoConstraint(senderVideoConstraint) {
        this.senderVideoConstraint = senderVideoConstraint;
    }

    setRemoteRecvMaxFrameHeight(remoteRecvMaxFrameHeight) {
        this._remoteRecvMaxFrameHeight = remoteRecvMaxFrameHeight;
        if (this.isP2P) {
            this.eventEmitter.emit(
                MediaSessionEvents.REMOTE_VIDEO_CONSTRAINTS_CHANGED,
                this);
        } else {
            this.rtc.eventEmitter.emit(
                RTCEvents.SENDER_VIDEO_CONSTRAINTS_CHANGED,
                { idealHeight: remoteRecvMaxFrameHeight });
        }
    }
}

/**
 * Mock conference for the purpose of this test file.
 */
class MockConference extends Listenable {
    /**
     * A constructor...
     */
    constructor() {
        super();
        this.options = {
            config: { enableLayerSuspension: true }
        };
        this.activeMediaSession = undefined;
        this.mediaSessions = [];
    }

    addMediaSession(mediaSession) {
        this.mediaSessions.push(mediaSession);

        this.eventEmitter.emit(JitsiConferenceEvents._MEDIA_SESSION_STARTED, mediaSession);
    }

    setActiveMediaSession(mediaSession) {
        if (this.mediaSessions.indexOf(mediaSession) === -1) {
            throw new Error('Given session is not part of this conference');
        }

        this.activeMediaSession = mediaSession;

        this.eventEmitter.emit(JitsiConferenceEvents._MEDIA_SESSION_ACTIVE_CHANGED, this.activeMediaSession);
    }

    _getActiveMediaSession() {
        return this.activeMediaSession;
    }

    _getMediaSessions() {
        return this.mediaSessions;
    }
}

/**
 * Mock {@link RTC} - add things as needed, but only things useful for all tests.
 */
export class MockRTC extends Listenable {
    /**
     * constructor
     */
    /* eslint-disable no-useless-constructor */
    constructor() {
        super();
    }
}

/* eslint-enable require-jsdoc */

describe('SendVideoController', () => {
    let conference;
    let rtc;
    let sendVideoController;
    let jvbConnection;
    let p2pConnection;

    beforeEach(() => {
        conference = new MockConference();
        rtc = new MockRTC();
        sendVideoController = new SendVideoController(conference, rtc);
        jvbConnection = new MockJingleSessionPC(rtc, false /* isP2P */);
        p2pConnection = new MockJingleSessionPC(rtc, true /* isP2P */);

        conference.addMediaSession(jvbConnection);
        conference.addMediaSession(p2pConnection);
    });
    describe('handles 0 as receiver/sender video constraint', () => {
        it('0 if it\'s the active sessions\'s remote recv constraint', () => {
            jvbConnection.setRemoteRecvMaxFrameHeight(0);
            p2pConnection.setRemoteRecvMaxFrameHeight(720);

            conference.setActiveMediaSession(jvbConnection);

            expect(jvbConnection.senderVideoConstraint).toBe(0);
            expect(p2pConnection.senderVideoConstraint).toBe(0);
        });
        it('720 if 0 is set on the non-active session', () => {
            jvbConnection.setRemoteRecvMaxFrameHeight(0);
            p2pConnection.setRemoteRecvMaxFrameHeight(720);

            conference.setActiveMediaSession(p2pConnection);

            expect(jvbConnection.senderVideoConstraint).toBe(720);
            expect(p2pConnection.senderVideoConstraint).toBe(720);
        });
        it('0 if it\'s the local send preference while remote are 720', () => {
            conference.setActiveMediaSession(p2pConnection);

            jvbConnection.setRemoteRecvMaxFrameHeight(720);
            p2pConnection.setRemoteRecvMaxFrameHeight(720);

            sendVideoController.setPreferredSendMaxFrameHeight(0);

            expect(jvbConnection.senderVideoConstraint).toBe(0);
            expect(p2pConnection.senderVideoConstraint).toBe(0);
        });
    });
});
