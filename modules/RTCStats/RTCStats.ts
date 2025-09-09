import Logger, { getLogger } from '@jitsi/logger';
import rtcstatsInit from '@jitsi/rtcstats/rtcstats';
import traceInit from '@jitsi/rtcstats/trace-ws';

import JitsiConference from '../../JitsiConference';
import { JitsiConferenceEvents } from '../../JitsiConferenceEvents';
import JitsiConnection from '../../JitsiConnection';
import Settings from '../settings/Settings';
import EventEmitter from '../util/EventEmitter';

import DefaultLogStorage from './DefaulLogStorage';
import { RTCStatsEvents } from './RTCStatsEvents';
import { ITraceOptions } from './interfaces';

const logger = getLogger('analytics:RTCStats');

/**
 * RTCStats Singleton that is initialized only once for the lifetime of the app, subsequent calls to init will be
 * ignored. Config and conference changes are handled by the start method.
 * RTCStats "proxies" WebRTC functions such as GUM and RTCPeerConnection by rewriting the global objects.
 * The proxies will then send data to the rtcstats server via the trace object.
 * The initialization procedure must be called once after lib-jitsi-meet is loaded.
 */
class RTCStats {
    private _defaultLogCollector: any = null;
    private _initialized: boolean = false;
    private _startedWithNewConnection: boolean = true;
    private _trace: any = null;
    public events: EventEmitter = new EventEmitter();

    isTraceAvailable() {
        return this._trace !== null;
    }

    /**
     * A JitsiConnection instance is created before the conference is joined, so even though
     * we don't have any conference specific data yet, we can initialize the trace module and
     * send any logs that might of otherwise be missed in case an error occurs between the connection
     * and conference initialization.
     *
     * @param connection - The JitsiConnection instance.
     * @returns {void}
     */
    startWithConnection(connection: JitsiConnection) {
        const { options } = connection;
        const name = options?.name ?? '';
        const {
            analytics: {
                rtcstatsEndpoint: endpoint = '',
                rtcstatsEnabled = false,
                rtcstatsPollInterval: pollInterval = 10000,
                rtcstatsSendSdp: sendSdp = false
            } = {},
        } = options;

        // Even though we have options being passed to init we need to recheck it as some client (react-native)
        // don't always re-initialize the module and could create multiple connections with different options.
        if (!rtcstatsEnabled) return;

        // If rtcstats already initialized, do nothing.
        // Calling rtcsatsInit multiple times will cause the global objects to be rewritten multiple times,
        // with unforeseen consequences.
        if (!this._initialized) {
            rtcstatsInit(
                { statsEntry: this.sendStatsEntry.bind(this) },
                { eventCallback: event => this.events.emit(RTCStatsEvents.RTC_STATS_PC_EVENT, event),
                    pollInterval,
                    sendSdp,
                    useLegacy: false }
            );
            this._initialized = true;
        }

        const traceOptions: ITraceOptions = {
            endpoint,
            isBreakoutRoom: false,
            meetingFqn: name
        };

        // Can't be a breakout room.
        this._connectTrace(traceOptions);

        this._defaultLogCollector?.flush();

        this.sendIdentity({
            confName: name,
            ...options
        });

        // This module is tightly tied with the ljm JitsiConnection and JitsiConference flows, technically
        // the connection isn't associated with a conference, but we still need to have some association for
        // data that is logged before the conference is joined.
        // In short the flow is as follows:
        // 1. Connection is created.
        // 2. The trace module is initialized and connected to the rtcstats server, so data starts being sent.
        // 3. Conference is created.
        // 4. If the trace wasn't already initialized from the connection creation, it will be initialized again.
        // this will take care of the cases where the connection is created and then multiple conferences are
        // sequentially joined and left, such as breakout rooms.
        this._startedWithNewConnection = true;
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
    attachToConference(conference: JitsiConference) {
        const {
            options: {
                config: confConfig = {},
                name: confName = ''
            } = {},
            _statsCurrentId: displayName = ''
        } = conference;

        const {
            analytics: {
                rtcstatsEnabled = false,
                rtcstatsEndpoint: endpoint = ''
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

        // The new conference config might have rtcstats disabled, so we need to check again.
        if (!rtcstatsEnabled) {
            return;
        }

        // If rtcstats proxy module is not initialized, do nothing.
        if (!this._initialized) {
            logger.error('Calling attachToConference before RTCStats proxy module is initialized.');

            return;
        }

        // When the conference is joined, we need to initialize the trace module with the new conference's config.
        // The trace module will then connect to the rtcstats server and send the identity data.
        conference.once(JitsiConferenceEvents.CONFERENCE_JOINED, () => {
            const isBreakoutRoom = Boolean(conference.getBreakoutRooms()?.isBreakoutRoom());
            const endpointId = conference.myUserId();
            const meetingUniqueId = conference.getMeetingUniqueId();

            // Connect to the rtcstats server instance. Stats (data obtained from getstats) won't be send until the
            // connect successfully initializes, however calls to GUM are recorded in an internal buffer even if not
            // connected and sent once it is established.
            if (!this._startedWithNewConnection) {
                const traceOptions = {
                    endpoint,
                    isBreakoutRoom,
                    meetingFqn: confName
                };

                this._connectTrace(traceOptions);

                // In cases where the conference was left but the connection was not closed,
                // logs could get cached, so we flush them as soon as we get a chance after the
                // conference is joined.
                this._defaultLogCollector?.flush();
            }

            const identityData = {
                ...confConfig,
                confName,
                displayName,
                endpointId,
                isBreakoutRoom,
                localId,
                meetingUniqueId
            };

            this.sendIdentity(identityData);
            // Reset the flag, so that the next conference that is joined will have the trace module initialized, such as a breakout room.
            this._startedWithNewConnection = false;
        });

        // Note, this will only be called for normal rooms, not breakout rooms.
        conference.once(JitsiConferenceEvents.CONFERENCE_UNIQUE_ID_SET, meetingUniqueId => {
            this.sendIdentity({ meetingUniqueId });
        });

        conference.once(JitsiConferenceEvents.CONFERENCE_LEFT, () => {
            this.reset();
        });

        conference.once(JitsiConferenceEvents.CONFERENCE_CREATED_TIMESTAMP, (timestamp: number) => {
            this.sendStatsEntry('conferenceStartTimestamp', null, timestamp);
        });

        conference.once(
            JitsiConferenceEvents.BEFORE_STATISTICS_DISPOSED,
            () => this._defaultLogCollector?.flush()
        );
    }

    /**
     * Reset and connects the trace module to the s server.
     *
     * @param traceOptions - Options for the trace module.
     * @returns {void}
     */
    _connectTrace(traceOptions: ITraceOptions) {

        const traceOptionsComplete = {
            ...traceOptions,
            onCloseCallback: event => this.events.emit(RTCStatsEvents.RTC_STATS_WC_DISCONNECTED, event),
            useLegacy: false
        };

        const { isBreakoutRoom } = traceOptionsComplete;

        this.reset();
        this._trace = traceInit(traceOptionsComplete);
        this._trace.connect(isBreakoutRoom);
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
        // If a trace is connected, flush the remaining logs before closing the connection,
        // if the trace is not present and we flush the logs will be lost,
        this._trace && this._defaultLogCollector?.flush();
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

    /**
     * Creates a new log collector with the default log storage.
     */
    getDefaultLogCollector(maxEntryLength: number = 10000) {
        if (!this._defaultLogCollector) {
            // If undefined is passed  as maxEntryLength LogCollector will default to 10000 bytes
            this._defaultLogCollector = new Logger.LogCollector(new DefaultLogStorage(this), { maxEntryLength });
            this._defaultLogCollector.start();
        }

        return this._defaultLogCollector;
    }
}

export default new RTCStats();
