/* global __filename, Strophe */

import AuthenticationEvents
    from './service/authentication/AuthenticationEvents';
import EventEmitterForwarder from './modules/util/EventEmitterForwarder';
import { getLogger } from 'jitsi-meet-logger';
import * as JitsiConferenceErrors from './JitsiConferenceErrors';
import * as JitsiConferenceEvents from './JitsiConferenceEvents';
import * as MediaType from './service/RTC/MediaType';
import RTCEvents from './service/RTC/RTCEvents';
import Statistics from './modules/statistics/statistics';
import XMPPEvents from './service/xmpp/XMPPEvents';

const logger = getLogger(__filename);

/**
 * Setups all event listeners related to conference
 * @param conference {JitsiConference} the conference
 */
function JitsiConferenceEventManager(conference) {
    this.conference = conference;

    // Listeners related to the conference only
    conference.on(JitsiConferenceEvents.TRACK_MUTE_CHANGED,
        track => {
            if (!track.isLocal() || !conference.statistics) {
                return;
            }
            conference.statistics.sendMuteEvent(track.isMuted(),
                track.getType());
        });
    conference.on(
        JitsiConferenceEvents.CONNECTION_INTERRUPTED,
        Statistics.sendEventToAll.bind(Statistics, 'connection.interrupted'));
    conference.on(
        JitsiConferenceEvents.CONNECTION_RESTORED,
        Statistics.sendEventToAll.bind(Statistics, 'connection.restored'));
}

/**
 * Groups resolutions by user id, skip incorrect resolutions.
 * @param conference {JitsiConference} the conference
 * @param resolutions map of resolutions by ssrc
 */
function mapResolutionsByUserId(conference, resolutions) {

    const id2resolution = {};

    // preprocess resolutions: group by user id, skip incorrect
    // resolutions etc.
    Object.keys(resolutions).forEach(ssrc => {
        const resolution = resolutions[ssrc];

        if (!resolution.width || !resolution.height
            || resolution.width === -1 || resolution.height === -1) {
            return;
        }

        const id = conference.rtc.getResourceBySSRC(ssrc);

        if (!id) {
            return;
        }

        // ssrc to resolution map for user id
        const idResolutions = id2resolution[id] || {};

        idResolutions[ssrc] = resolution;

        id2resolution[id] = idResolutions;
    });

    return id2resolution;
}

/**
 * Groups framerates by user id, skip framerates with value of 0.
 * @param conference {JitsiConference} the conference
 * @param framerates map of framerates by ssrc
 */
function mapFrameratesByUserId(conference, framerates) {

    const id2framerate = {};

    // preprocess framerates: group by user id
    Object.keys(framerates).forEach(ssrc => {
        const framerate = framerates[ssrc];

        if (framerate === 0) {
            return;
        }

        const id = conference.rtc.getResourceBySSRC(ssrc);

        if (!id) {
            return;
        }

        // ssrc to framerate map for user id
        const id2framerates = id2framerate[id] || {};

        id2framerates[ssrc] = framerate;

        id2framerate[id] = id2framerates;
    });

    return id2framerate;
}

/**
 * Setups event listeners related to conference.chatRoom
 */
JitsiConferenceEventManager.prototype.setupChatRoomListeners = function() {
    const conference = this.conference;
    const chatRoom = conference.room;

    this.chatRoomForwarder = new EventEmitterForwarder(chatRoom,
        this.conference.eventEmitter);

    chatRoom.addListener(XMPPEvents.ICE_RESTARTING, jingleSession => {
        if (!jingleSession.isP2P) {
            // All data channels have to be closed, before ICE restart
            // otherwise Chrome will not trigger "opened" event for the channel
            // established with the new bridge
            conference.rtc.closeAllDataChannels();
        }

        // else: there are no DataChannels in P2P session (at least for now)
    });

    chatRoom.addListener(XMPPEvents.AUDIO_MUTED_BY_FOCUS,
        value => {
            // set isMutedByFocus when setAudioMute Promise ends
            conference.rtc.setAudioMute(value).then(
                () => {
                    conference.isMutedByFocus = true;
                },
                () =>
                    logger.warn(
                        'Error while audio muting due to focus request'));
        }
    );

    this.chatRoomForwarder.forward(XMPPEvents.SUBJECT_CHANGED,
        JitsiConferenceEvents.SUBJECT_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.MUC_JOINED,
        JitsiConferenceEvents.CONFERENCE_JOINED);

    // send some analytics events
    chatRoom.addListener(XMPPEvents.MUC_JOINED,
        () => {
            this.conference.isJvbConnectionInterrupted = false;

            Object.keys(chatRoom.connectionTimes).forEach(key => {
                const value = chatRoom.connectionTimes[key];

                Statistics.analytics.sendEvent(`conference.${key}`, { value });
            });
            Object.keys(chatRoom.xmpp.connectionTimes).forEach(key => {
                const value = chatRoom.xmpp.connectionTimes[key];

                Statistics.analytics.sendEvent(`xmpp.${key}`, { value });
            });
        });

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_JOIN_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONNECTION_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_CONNECT_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONNECTION_ERROR);
    this.chatRoomForwarder.forward(XMPPEvents.ROOM_CONNECT_NOT_ALLOWED_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.NOT_ALLOWED_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_MAX_USERS_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONFERENCE_MAX_USERS);

    this.chatRoomForwarder.forward(XMPPEvents.PASSWORD_REQUIRED,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.PASSWORD_REQUIRED);

    this.chatRoomForwarder.forward(XMPPEvents.AUTHENTICATION_REQUIRED,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.AUTHENTICATION_REQUIRED);

    this.chatRoomForwarder.forward(XMPPEvents.BRIDGE_DOWN,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.VIDEOBRIDGE_NOT_AVAILABLE);
    chatRoom.addListener(
        XMPPEvents.BRIDGE_DOWN,
        () => Statistics.analytics.sendEvent('conference.bridgeDown'));

    this.chatRoomForwarder.forward(XMPPEvents.RESERVATION_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.RESERVATION_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.GRACEFUL_SHUTDOWN,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.GRACEFUL_SHUTDOWN);

    chatRoom.addListener(XMPPEvents.JINGLE_FATAL_ERROR,
        (session, error) => {
            if (!session.isP2P) {
                conference.eventEmitter.emit(
                    JitsiConferenceEvents.CONFERENCE_FAILED,
                    JitsiConferenceErrors.JINGLE_FATAL_ERROR, error);
            }
        });

    chatRoom.addListener(XMPPEvents.CONNECTION_ICE_FAILED,
        jingleSession => {
            conference._onIceConnectionFailed(jingleSession);
        });

    this.chatRoomForwarder.forward(XMPPEvents.MUC_DESTROYED,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONFERENCE_DESTROYED);

    this.chatRoomForwarder.forward(XMPPEvents.CHAT_ERROR_RECEIVED,
        JitsiConferenceEvents.CONFERENCE_ERROR,
        JitsiConferenceErrors.CHAT_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.FOCUS_DISCONNECTED,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.FOCUS_DISCONNECTED);

    chatRoom.addListener(XMPPEvents.FOCUS_LEFT,
        () => {
            Statistics.analytics.sendEvent('conference.focusLeft');
            conference.eventEmitter.emit(
                JitsiConferenceEvents.CONFERENCE_FAILED,
                JitsiConferenceErrors.FOCUS_LEFT);
        });

    const eventLogHandler
        = reason => Statistics.sendEventToAll(`conference.error.${reason}`);

    chatRoom.addListener(XMPPEvents.SESSION_ACCEPT_TIMEOUT,
        jingleSession => {
            eventLogHandler(
                jingleSession.isP2P
                    ? 'p2pSessionAcceptTimeout' : 'sessionAcceptTimeout');
        });

    this.chatRoomForwarder.forward(XMPPEvents.RECORDER_STATE_CHANGED,
        JitsiConferenceEvents.RECORDER_STATE_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED,
        JitsiConferenceEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.PHONE_NUMBER_CHANGED,
        JitsiConferenceEvents.PHONE_NUMBER_CHANGED);

    chatRoom.addListener(
        XMPPEvents.CONFERENCE_SETUP_FAILED,
        (jingleSession, error) => {
            if (!jingleSession.isP2P) {
                conference.eventEmitter.emit(
                    JitsiConferenceEvents.CONFERENCE_FAILED,
                    JitsiConferenceErrors.SETUP_FAILED,
                    error);
            }
        });

    chatRoom.setParticipantPropertyListener((node, from) => {
        const participant = conference.getParticipantById(from);

        if (!participant) {
            return;
        }

        participant.setProperty(
            node.tagName.substring('jitsi_participant_'.length),
            node.value);
    });

    this.chatRoomForwarder.forward(XMPPEvents.KICKED,
        JitsiConferenceEvents.KICKED);
    chatRoom.addListener(XMPPEvents.KICKED,
        () => {
            conference.room = null;
            conference.leave();
        });
    chatRoom.addListener(XMPPEvents.SUSPEND_DETECTED,
        conference.onSuspendDetected.bind(conference));

    this.chatRoomForwarder.forward(XMPPEvents.MUC_LOCK_CHANGED,
        JitsiConferenceEvents.LOCK_STATE_CHANGED);

    chatRoom.addListener(XMPPEvents.MUC_MEMBER_JOINED,
        conference.onMemberJoined.bind(conference));
    chatRoom.addListener(XMPPEvents.MUC_MEMBER_LEFT,
        conference.onMemberLeft.bind(conference));
    this.chatRoomForwarder.forward(XMPPEvents.MUC_LEFT,
        JitsiConferenceEvents.CONFERENCE_LEFT);

    chatRoom.addListener(XMPPEvents.DISPLAY_NAME_CHANGED,
        conference.onDisplayNameChanged.bind(conference));

    chatRoom.addListener(XMPPEvents.LOCAL_ROLE_CHANGED, role => {
        conference.onLocalRoleChanged(role);

        // log all events for the recorder operated by the moderator
        if (conference.statistics && conference.isModerator()) {
            conference.on(JitsiConferenceEvents.RECORDER_STATE_CHANGED,
                (status, error) => {
                    const logObject = {
                        id: 'recorder_status',
                        status
                    };

                    if (error) {
                        logObject.error = error;
                    }
                    Statistics.sendLog(JSON.stringify(logObject));
                });
        }
    });

    chatRoom.addListener(XMPPEvents.MUC_ROLE_CHANGED,
        conference.onUserRoleChanged.bind(conference));

    chatRoom.addListener(AuthenticationEvents.IDENTITY_UPDATED,
        (authEnabled, authIdentity) => {
            conference.authEnabled = authEnabled;
            conference.authIdentity = authIdentity;
            conference.eventEmitter.emit(
                JitsiConferenceEvents.AUTH_STATUS_CHANGED, authEnabled,
                authIdentity);
        });

    chatRoom.addListener(
        XMPPEvents.MESSAGE_RECEIVED,

        // eslint-disable-next-line max-params
        (jid, displayName, txt, myJid, ts) => {
            const id = Strophe.getResourceFromJid(jid);

            conference.eventEmitter.emit(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                id, txt, ts);
        });

    chatRoom.addListener(XMPPEvents.PRESENCE_STATUS,
        (jid, status) => {
            const id = Strophe.getResourceFromJid(jid);
            const participant = conference.getParticipantById(id);

            if (!participant || participant._status === status) {
                return;
            }
            participant._status = status;
            conference.eventEmitter.emit(
                JitsiConferenceEvents.USER_STATUS_CHANGED, id, status);
        });

    chatRoom.addPresenceListener('startmuted', (data, from) => {
        let isModerator = false;

        if (conference.myUserId() === from && conference.isModerator()) {
            isModerator = true;
        } else {
            const participant = conference.getParticipantById(from);

            if (participant && participant.isModerator()) {
                isModerator = true;
            }
        }

        if (!isModerator) {
            return;
        }

        const startAudioMuted = data.attributes.audio === 'true';
        const startVideoMuted = data.attributes.video === 'true';

        let updated = false;

        if (startAudioMuted !== conference.startMutedPolicy.audio) {
            conference.startMutedPolicy.audio = startAudioMuted;
            updated = true;
        }

        if (startVideoMuted !== conference.startMutedPolicy.video) {
            conference.startMutedPolicy.video = startVideoMuted;
            updated = true;
        }

        if (updated) {
            conference.eventEmitter.emit(
                JitsiConferenceEvents.START_MUTED_POLICY_CHANGED,
                conference.startMutedPolicy
            );
        }
    });

    chatRoom.addPresenceListener('devices', (data, from) => {
        let isAudioAvailable = false;
        let isVideoAvailable = false;

        data.children.forEach(config => {
            if (config.tagName === 'audio') {
                isAudioAvailable = config.value === 'true';
            }
            if (config.tagName === 'video') {
                isVideoAvailable = config.value === 'true';
            }
        });

        let availableDevices;

        if (conference.myUserId() === from) {
            availableDevices = conference.availableDevices;
        } else {
            const participant = conference.getParticipantById(from);

            if (!participant) {
                return;
            }

            availableDevices = participant._availableDevices;
        }

        let updated = false;

        if (availableDevices.audio !== isAudioAvailable) {
            updated = true;
            availableDevices.audio = isAudioAvailable;
        }

        if (availableDevices.video !== isVideoAvailable) {
            updated = true;
            availableDevices.video = isVideoAvailable;
        }

        if (updated) {
            conference.eventEmitter.emit(
                JitsiConferenceEvents.AVAILABLE_DEVICES_CHANGED,
                from, availableDevices);
        }
    });

    if (conference.statistics) {
        // FIXME ICE related events should end up in RTCEvents eventually
        chatRoom.addListener(XMPPEvents.CONNECTION_ICE_FAILED,
            (session, pc) => {
                conference.statistics.sendIceConnectionFailedEvent(pc);
            });
        chatRoom.addListener(XMPPEvents.ADD_ICE_CANDIDATE_FAILED,
            (e, pc) => {
                conference.statistics.sendAddIceCandidateFailed(e, pc);
            });
    }
};

/**
 * Setups event listeners related to conference.rtc
 */
JitsiConferenceEventManager.prototype.setupRTCListeners = function() {
    const conference = this.conference;
    const rtc = conference.rtc;

    rtc.addListener(
        RTCEvents.REMOTE_TRACK_ADDED,
        conference.onRemoteTrackAdded.bind(conference));

    rtc.addListener(
        RTCEvents.REMOTE_TRACK_REMOVED,
        conference.onRemoteTrackRemoved.bind(conference));

    rtc.addListener(RTCEvents.DOMINANT_SPEAKER_CHANGED,
        id => {
            if (conference.lastDominantSpeaker !== id && conference.room) {
                conference.lastDominantSpeaker = id;
                conference.eventEmitter.emit(
                    JitsiConferenceEvents.DOMINANT_SPEAKER_CHANGED, id);
            }
            if (conference.statistics && conference.myUserId() === id) {
                // We are the new dominant speaker.
                conference.statistics.sendDominantSpeakerEvent();
            }
        });

    rtc.addListener(RTCEvents.DATA_CHANNEL_OPEN, () => {
        const now = window.performance.now();

        logger.log('(TIME) data channel opened ', now);
        conference.room.connectionTimes['data.channel.opened'] = now;
        Statistics.analytics.sendEvent('conference.dataChannel.open',
            { value: now });
    });

    rtc.addListener(
        RTCEvents.AVAILABLE_DEVICES_CHANGED,
        devices => conference.room.updateDeviceAvailability(devices));

    rtc.addListener(RTCEvents.ENDPOINT_MESSAGE_RECEIVED,
        (from, payload) => {
            const participant = conference.getParticipantById(from);

            if (participant) {
                conference.eventEmitter.emit(
                    JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
                    participant, payload);
            } else {
                logger.warn(
                    'Ignored ENDPOINT_MESSAGE_RECEIVED for not existing '
                        + `participant: ${from}`,
                    payload);
            }
        });

    rtc.addListener(RTCEvents.LOCAL_UFRAG_CHANGED,
        (tpc, ufrag) => {
            if (!tpc.isP2P) {
                Statistics.sendLog(
                    JSON.stringify({
                        id: 'local_ufrag',
                        value: ufrag
                    }));
            }
        });
    rtc.addListener(RTCEvents.REMOTE_UFRAG_CHANGED,
        (tpc, ufrag) => {
            if (!tpc.isP2P) {
                Statistics.sendLog(
                    JSON.stringify({
                        id: 'remote_ufrag',
                        value: ufrag
                    }));
            }
        });

    if (conference.statistics) {
        rtc.addListener(RTCEvents.CREATE_ANSWER_FAILED,
            (e, pc) => {
                conference.statistics.sendCreateAnswerFailed(e, pc);
            });

        rtc.addListener(RTCEvents.CREATE_OFFER_FAILED,
            (e, pc) => {
                conference.statistics.sendCreateOfferFailed(e, pc);
            });

        rtc.addListener(RTCEvents.SET_LOCAL_DESCRIPTION_FAILED,
            (e, pc) => {
                conference.statistics.sendSetLocalDescFailed(e, pc);
            });

        rtc.addListener(RTCEvents.SET_REMOTE_DESCRIPTION_FAILED,
            (e, pc) => {
                conference.statistics.sendSetRemoteDescFailed(e, pc);
            });
    }
};

/**
 * Setups event listeners related to conference.xmpp
 */
JitsiConferenceEventManager.prototype.setupXMPPListeners = function() {
    const conference = this.conference;

    conference.xmpp.caps.addListener(XMPPEvents.PARTCIPANT_FEATURES_CHANGED,
        from => {
            const participant
                = conference.getParticipantId(
                    Strophe.getResourceFromJid(from));

            if (participant) {
                conference.eventEmitter.emit(
                    JitsiConferenceEvents.PARTCIPANT_FEATURES_CHANGED,
                    participant);
            }
        });
    conference.xmpp.addListener(
        XMPPEvents.CALL_INCOMING,
        conference.onIncomingCall.bind(conference));
    conference.xmpp.addListener(
        XMPPEvents.CALL_ACCEPTED,
        conference.onCallAccepted.bind(conference));
    conference.xmpp.addListener(
        XMPPEvents.TRANSPORT_INFO,
        conference.onTransportInfo.bind(conference));
    conference.xmpp.addListener(
        XMPPEvents.CALL_ENDED,
        conference.onCallEnded.bind(conference));

    conference.xmpp.addListener(XMPPEvents.START_MUTED_FROM_FOCUS,
        (audioMuted, videoMuted) => {
            conference.startAudioMuted = audioMuted;
            conference.startVideoMuted = videoMuted;

            // mute existing local tracks because this is initial mute from
            // Jicofo
            conference.getLocalTracks().forEach(track => {
                switch (track.getType()) {
                case MediaType.AUDIO:
                    conference.startAudioMuted && track.mute();
                    break;
                case MediaType.VIDEO:
                    conference.startVideoMuted && track.mute();
                    break;
                }
            });

            conference.eventEmitter.emit(JitsiConferenceEvents.STARTED_MUTED);
        });
};

/**
 * Setups event listeners related to conference.statistics
 */
JitsiConferenceEventManager.prototype.setupStatisticsListeners = function() {
    const conference = this.conference;

    if (!conference.statistics) {
        return;
    }

    conference.statistics.addAudioLevelListener((ssrc, level) => {
        conference.rtc.setAudioLevel(ssrc, level);
    });

    // Forward the "before stats disposed" event
    conference.statistics.addBeforeDisposedListener(() => {
        conference.eventEmitter.emit(
            JitsiConferenceEvents.BEFORE_STATISTICS_DISPOSED);
    });
    conference.statistics.addConnectionStatsListener(stats => {

        stats.resolution = mapResolutionsByUserId(conference, stats.resolution);
        stats.framerate = mapFrameratesByUserId(conference, stats.framerate);

        conference.eventEmitter.emit(
            JitsiConferenceEvents.CONNECTION_STATS, stats);
    });

    conference.statistics.addByteSentStatsListener((tpc, stats) => {
        conference.getLocalTracks(MediaType.AUDIO).forEach(track => {
            const ssrc = tpc.getLocalSSRC(track);

            if (!ssrc || !stats.hasOwnProperty(ssrc)) {
                return;
            }

            track._setByteSent(tpc, stats[ssrc]);
        });
    });
};

module.exports = JitsiConferenceEventManager;
