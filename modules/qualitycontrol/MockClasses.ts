import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import { VideoType } from '../../service/RTC/VideoType';
import { MockRTC, MockSignalingLayerImpl } from '../RTC/MockClasses';
import Listenable from '../util/Listenable';
import JingleSessionPC from '../xmpp/JingleSessionPC';

/**
 * MockParticipant
 */
export class MockParticipant {
    id: string;

    /**
     * A constructor...
     */
    constructor(id: string) {
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
export class MockLocalTrack {
    maxEnabledResolution: number;
    rtcId: string;
    videoType: VideoType;
    captureResolution: number;

    /**
     * Constructor
     * @param {number} resolution
     * @param {VideoType} videoType
     */
    constructor(id: string, resolution: number, videoType: VideoType) {
        this.rtcId = id;
        this.captureResolution = resolution;
        this.maxEnabledResolution = resolution;
        this.videoType = videoType;
    }

    getCaptureResolution(): number {
        return this.captureResolution;
    }
    /**
     * Returns the video type of the mock local track.
     * @returns {VideoType}
     */
    getVideoType(): VideoType {
        return this.videoType;
    }
}

/**
 * MockConference
 */
export class MockConference extends Listenable {
    options: { config: {}; };
    activeMediaSession: JingleSessionPC;
    jvbJingleSession: JingleSessionPC;
    mediaSessions: JingleSessionPC[];
    participants: MockParticipant[];
    rtc: MockRTC;
    _signalingLayer: MockSignalingLayerImpl;

    /**
     * A constructor...
     */
    constructor(rtc: MockRTC) {
        super();
        this.options = {
            config: {}
        };

        this.activeMediaSession = undefined;
        this.jvbJingleSession = null;
        this.mediaSessions = [];
        this.participants = [];
        this.rtc = rtc;
        this._signalingLayer = new MockSignalingLayerImpl();
    }

    /**
     * Add a mock participant to the conference
     * @param {MockParticipant} participant
     * @param {Array<string>} codecList
     * @param {String} codecType
     */
    addParticipant(participant: MockParticipant, codecList: Array<string>, codecType: string): void {
        this.participants.push(participant);
        this._signalingLayer.setPeerMediaInfo(true, participant.getId(), codecList, codecType);
        this.eventEmitter.emit(JitsiConferenceEvents.USER_JOINED);
    }

    /**
     * Returns the active media session.
     * @returns {JingleSessionPC}
     */
    getActiveMediaSession(): JingleSessionPC {
        return this.jvbJingleSession;
    }

    /**
     * Returns a list of forwarded sources.
     * @returns {Array<string>}
     */
    getForwardedSources(): string[] {
        return this.rtc.getForwardedSources();
    }

    /**
     * Returns the list of participants.
     * @returns Array<MockParticipant>
     */
    getParticipants(): Array<MockParticipant>  {
        return this.participants;
    }

    /**
     * Checks if E2EE is enabled.
     * @returns {boolean}
     */
    isE2EEEnabled(): boolean {
        return false;
    }

    /**
     * Removes the participant from the conference.
     * @param {MockParticipant} endpoint
     */
    removeParticipant(endpoint: MockParticipant): void {
        this.participants = this.participants.filter(p => p !== endpoint);
        this._signalingLayer.setPeerMediaInfo(false, endpoint.getId(), undefined, undefined);
        this.eventEmitter.emit(JitsiConferenceEvents.USER_LEFT);
    }
}
