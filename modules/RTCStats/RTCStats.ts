import { getLogger } from '@jitsi/logger';

import rtcstatsInit from '@jitsi/rtcstats/rtcstats';
import traceInit from '@jitsi/rtcstats/trace-ws';

import {
    CONFERENCE_CREATED_TIMESTAMP,
    CONFERENCE_JOINED,
    CONFERENCE_LEFT,
    CONFERENCE_UNIQUE_ID_SET
} from '../../JitsiConferenceEvents';
import JitsiConference from '../../JitsiConference';
import { IRTCStatsConfiguration } from './interfaces';
import { RTC_STATS_PC_EVENT, RTC_STATS_WC_DISCONNECTED } from './RTCStatsEvents';
import EventEmitter from '../util/EventEmitter';
import Settings from '../settings/Settings';

const logger = getLogger(__filename);

/**
 * RTCStats Singleton that is initialized only once for the lifetime of the app, subsequent calls to init will be ignored.
 * Config and conference changes are handled by the start method.
 */
class RTCStats {
    private _initialized: boolean = false;
    private _trace: any = null;
    public events: EventEmitter = new EventEmitter();

    /**
     * RTCStats "proxies" WebRTC functions such as GUM and RTCPeerConnection by rewriting the global objects.
     * The proxies will then send data to the rtcstats server via the trace object.
     * The initialization procedure must be called once when lib-jitsi-meet is loaded.
     *
     * @param {IRTCStatsConfiguration} initConfig initial config for rtcstats.
     * @returns {void}
     */
    init(initConfig: IRTCStatsConfiguration) {
        const {
            analytics: {
                rtcstatsUseLegacy: useLegacy = false,
                rtcstatsPollInterval: pollInterval= 10000,
                rtcstatsSendSdp: sendSdp = false,
                rtcstatsEnabled = false
            } = {}
        } = initConfig;

        // If rtcstats is not enabled or already initialized, do nothing.
        // Calling rtcsatsInit multiple times will cause the global objects to be rewritten multiple times,
        // with unforeseen consequences.
        if (!rtcstatsEnabled || this._initialized) return;

        rtcstatsInit(
            { statsEntry: this.sendStatsEntry.bind(this) },
            { pollInterval,
              useLegacy,
              sendSdp,
              eventCallback: (event) => this.events.emit(RTC_STATS_PC_EVENT, event)}
        );

        this._initialized = true;
    }

    /**
     * When a conference is about to start, we need to reset the trace module, and initialize it with the
     * new conference's config. On a normal conference flow this wouldn't be necessary, as the whole page is
     * reloaded, but in the case of breakout rooms or react native the js context doesn't reload, hence the
     * RTCStats singleton and its config persists between conferences.
     *
     * @param conference - JitsiConference instance that's about to start.
     * @returns {void}
     */
    start(conference: JitsiConference) {
        const {
            options: {
                config : confConfig = {},
                name: confName = ''
            } = {},
            _statsCurrentId : displayName = ''
        } = conference;

        const {
            analytics: {
                rtcstatsEnabled = false,
                rtcstatsEndpoint: endpoint = '',
                rtcstatsUseLegacy: useLegacy = false
            } = {}
        } = confConfig;

        // The statisticsId, statisticsDisplayName and _statsCurrentId (renamed to displayName) fields 
        // that are sent through options might be a bit confusing. Depending on the context, they could 
        // be intermixed inside ljm, for instance _statsCurrentId might refer to the email field which is stored
        // in statisticsId or it could have the same value as callStatsUserName.
        // The following is the mapping between the fields, and a short explanation of each:
        // statisticsId -> email, this is only send by jitsi-meet if enableEmailInStats option is set.
        // statisticsDisplayName -> nick, this is only send by jitsi-meet if enableDisplayNameInStats option is set.
        // localId, this is the unique id that is used to track users throughout stats.
        const localId = Settings?.callStatsUserName ?? '';

        // Reset the trace module in case it wasn't during the previous conference.
        // Closing the underlying websocket connection and deleting the trace obj.
        this.reset();

        // The new conference config might have rtcstats disabled, so we need to check again.
        if (!rtcstatsEnabled) return;

        // If rtcstats proxy module is not initialized, do nothing.
        if (!this._initialized) {
            logger.error('Calling start before RTCStats proxy module is initialized.');

            return;
        }

        // When the conference is joined, we need to initialize the trace module with the new conference's config.
        // The trace module will then connect to the rtcstats server and send the identity data.
        conference.once(CONFERENCE_JOINED, () => {
            const traceOptions = {
                endpoint,
                meetingFqn: confName,
                onCloseCallback: (event) => this.events.emit(RTC_STATS_WC_DISCONNECTED, event),
                useLegacy
            };

            const isBreakoutRoom = Boolean(conference.getBreakoutRooms()?.isBreakoutRoom());
            const endpointId = conference.myUserId();
            const meetingUniqueId = conference.getMeetingUniqueId();

            this._trace = traceInit(traceOptions);

            // Connect to the rtcstats server instance. Stats (data obtained from getstats) won't be send until the
            // connect successfully initializes, however calls to GUM are recorded in an internal buffer even if not
            // connected and sent once it is established.
            this._trace.connect(isBreakoutRoom);

            const identityData = {
                ...confConfig,
                endpointId,
                confName,
                displayName,
                meetingUniqueId,
                isBreakoutRoom,
                localId
            }

            this.sendIdentity(identityData);
        });

        // Note, this will only be called for normal rooms, not breakout rooms.
        conference.once(CONFERENCE_UNIQUE_ID_SET, (meetingUniqueId) => {
            this.sendIdentity({meetingUniqueId});
        });

        conference.once(CONFERENCE_LEFT, () => {
            this.reset();
        });

        conference.once(CONFERENCE_CREATED_TIMESTAMP, (timestamp: number) => {
            this.sendStatsEntry('conferenceStartTimestamp', null, timestamp);
        })
    }

    /**
     * Sends the identity data to the rtcstats server.
     *
     * @param identityData - Identity data to send.
     * @returns {void}
     */
    sendIdentity(identityData) {
        this._trace?.identity('identity', null, identityData);
    }

    /**
     * Resets the trace module by closing the websocket and deleting the object.
     * After reset, the rtcstats proxy module that tries to send data via `sendStatsEntry`, will no longer
     * send any data, until the trace module is initialized again. This comes in handy on react-native
     * where ljm doesn't get reloaded, so we need to switch the trace module between conferences.
     *
     * @returns {void}
     */
    reset() {
        this._trace?.close();
        this._trace = null;
    }

    /**
     * Sends a stats entry to the rtcstats server. This is called by the rtcstats proxy module,
     * or any other app that wants to send custom stats.
     *
     * @param entry - Stats entry to send.
     * @returns {void}
     */
    sendStatsEntry(statsType, pcId, data) {
        this._trace?.statsEntry(statsType, pcId, data);
    }
}

export default new RTCStats();
