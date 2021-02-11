
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';

/**
 * This class manages the receive video contraints for a given {@link JitsiConference}. These constraints are
 * determined by the application based on how the remote video streams need to be displayed. This class is responsible
 * for communicating these constraints to the bridge over the bridge channel.
 */
export class ReceiveVideoController {
    /**
     * Creates a new instance for a given conference.
     *
     * @param {JitsiConference} conference the conference instance for which the new instance will be managing
     * the receive video quality constraints.
     * @param {RTC} rtc the rtc instance which is responsible for initializing the bridge channel.
     */
    constructor(conference, rtc) {
        this._conference = conference;
        this._rtc = rtc;

        // The number of videos requested from the bridge, -1 represents unlimited or all available videos.
        this._lastN = -1;

        // The number representing the maximum video height the local client should receive from the bridge.
        this._maxFrameHeight = 2160;

        // The endpoint IDs of the participants that are currently selected.
        this._selectedEndpoints = [];

        this._conference.on(
            JitsiConferenceEvents._MEDIA_SESSION_STARTED,
            session => this._onMediaSessionStarted(session));
    }

    /**
     * Handles the {@link JitsiConferenceEvents.MEDIA_SESSION_STARTED}, that is when the conference creates new media
     * session. The preferred receive frameHeight is applied on the media session.
     *
     * @param {JingleSessionPC} mediaSession - the started media session.
     * @returns {void}
     * @private
     */
    _onMediaSessionStarted(mediaSession) {
        this._maxFrameHeight && mediaSession.setReceiverVideoConstraint(this._maxFrameHeight);
    }

    /**
     * Elects the participants with the given ids to be the selected participants in order to always receive video
     * for this participant (even when last n is enabled).
     *
     * @param {Array<string>} ids - The user ids.
     * @returns {void}
     */
    selectEndpoints(ids) {
        this._selectedEndpoints = ids;
        this._rtc.selectEndpoints(ids);
    }

    /**
     * Selects a new value for "lastN". The requested amount of videos are going to be delivered after the value is
     * in effect. Set to -1 for unlimited or all available videos.
     *
     * @param {number} value the new value for lastN.
     * @returns {void}
     */
    setLastN(value) {
        if (this._lastN !== value) {
            this._lastN = value;
            this._rtc.setLastN(value);
        }
    }

    /**
     * Sets the maximum video resolution the local participant should receive from remote participants.
     *
     * @param {number|undefined} maxFrameHeight - the new value.
     * @returns {void}
     */
    setPreferredReceiveMaxFrameHeight(maxFrameHeight) {
        this._maxFrameHeight = maxFrameHeight;

        for (const session of this._conference._getMediaSessions()) {
            maxFrameHeight && session.setReceiverVideoConstraint(maxFrameHeight);
        }
    }
}
