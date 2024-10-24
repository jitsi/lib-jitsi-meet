import { getLogger } from '@jitsi/logger';
import { Strophe } from 'strophe.js';

import * as JitsiConferenceErrors from './JitsiConferenceErrors';
import * as JitsiConferenceEvents from './JitsiConferenceEvents';
import * as JitsiTrackEvents from './JitsiTrackEvents';
import { SPEAKERS_AUDIO_LEVELS } from './modules/statistics/constants';
import Statistics from './modules/statistics/statistics';
import EventEmitterForwarder from './modules/util/EventEmitterForwarder';
import { MediaType } from './service/RTC/MediaType';
import RTCEvents from './service/RTC/RTCEvents';
import AuthenticationEvents
    from './service/authentication/AuthenticationEvents';
import {
    ACTION_JINGLE_SA_TIMEOUT,
    createBridgeDownEvent,
    createConnectionStageReachedEvent,
    createFocusLeftEvent,
    createJingleEvent,
    createRemotelyMutedEvent
} from './service/statistics/AnalyticsEvents';
import { XMPPEvents } from './service/xmpp/XMPPEvents';

const logger = getLogger(__filename);

/**
 * Setups all event listeners related to conference
 * @param conference {JitsiConference} the conference
 */
export default function JitsiConferenceEventManager(conference) {
    this.conference = conference;
    this.xmppListeners = {};
}

/**
 * Setups event listeners related to conference.chatRoom
 */
JitsiConferenceEventManager.prototype.setupChatRoomListeners = function() {
    const conference = this.conference;
    const chatRoom = conference.room;

    this.chatRoomForwarder = new EventEmitterForwarder(chatRoom,
        this.conference.eventEmitter);

    chatRoom.addListener(XMPPEvents.PARTICIPANT_FEATURES_CHANGED, (from, features) => {
        const participant = conference.getParticipantById(Strophe.getResourceFromJid(from));

        if (participant) {
            participant.setFeatures(features);
            conference.eventEmitter.emit(JitsiConferenceEvents.PARTCIPANT_FEATURES_CHANGED, participant);
        }
    });

    chatRoom.addListener(XMPPEvents.AUDIO_MUTED_BY_FOCUS,
        actor => {
            // TODO: Add a way to differentiate between commands which caused
            // us to mute and those that did not change our state (i.e. we were
            // already muted).
            Statistics.sendAnalytics(createRemotelyMutedEvent(MediaType.AUDIO));

            conference.mutedByFocusActor = actor;

            // set isMutedByFocus when setAudioMute Promise ends
            conference.rtc.setAudioMute(true).then(
                () => {
                    conference.isMutedByFocus = true;
                    conference.mutedByFocusActor = null;
                })
                .catch(
                    error => {
                        conference.mutedByFocusActor = null;
                        logger.warn(
                            'Error while audio muting due to focus request', error);
                    });
        }
    );

    chatRoom.addListener(XMPPEvents.VIDEO_MUTED_BY_FOCUS,
        actor => {
            // TODO: Add a way to differentiate between commands which caused
            // us to mute and those that did not change our state (i.e. we were
            // already muted).
            Statistics.sendAnalytics(createRemotelyMutedEvent(MediaType.VIDEO));

            conference.mutedVideoByFocusActor = actor;

            // set isVideoMutedByFocus when setVideoMute Promise ends
            conference.rtc.setVideoMute(true).then(
                () => {
                    conference.isVideoMutedByFocus = true;
                    conference.mutedVideoByFocusActor = null;
                })
                .catch(
                    error => {
                        conference.mutedVideoByFocusActor = null;
                        logger.warn(
                            'Error while video muting due to focus request', error);
                    });
        }
    );

    this.chatRoomForwarder.forward(XMPPEvents.SUBJECT_CHANGED,
        JitsiConferenceEvents.SUBJECT_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.MUC_JOINED,
        JitsiConferenceEvents.CONFERENCE_JOINED);

    this.chatRoomForwarder.forward(XMPPEvents.MUC_JOIN_IN_PROGRESS,
        JitsiConferenceEvents.CONFERENCE_JOIN_IN_PROGRESS);

    this.chatRoomForwarder.forward(XMPPEvents.MEETING_ID_SET,
        JitsiConferenceEvents.CONFERENCE_UNIQUE_ID_SET);

    this.chatRoomForwarder.forward(XMPPEvents.CONFERENCE_TIMESTAMP_RECEIVED,
        JitsiConferenceEvents.CONFERENCE_CREATED_TIMESTAMP);

    // send some analytics events
    chatRoom.addListener(XMPPEvents.MUC_JOINED,
        () => {
            this.conference._onMucJoined();

            this.conference.isJvbConnectionInterrupted = false;

            // TODO: Move all of the 'connectionTimes' logic to its own module.
            Object.keys(chatRoom.connectionTimes).forEach(key => {
                const event
                    = createConnectionStageReachedEvent(
                        `conference_${key}`,
                        { value: chatRoom.connectionTimes[key] });

                Statistics.sendAnalytics(event);
            });

            // TODO: Move all of the 'connectionTimes' logic to its own module.
            Object.keys(chatRoom.xmpp.connectionTimes).forEach(key => {
                const event
                    = createConnectionStageReachedEvent(
                        `xmpp_${key}`,
                        { value: chatRoom.xmpp.connectionTimes[key] });

                Statistics.sendAnalytics(event);
            });
        });

    chatRoom.addListener(XMPPEvents.RENEGOTIATION_FAILED, (e, session) => {
        if (!session.isP2P) {
            conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
                JitsiConferenceErrors.OFFER_ANSWER_FAILED, e);
        }
    });

    chatRoom.addListener(JitsiTrackEvents.TRACK_OWNER_SET, (track, owner, sourceName, videoType) => {
        if (track.getParticipantId() !== owner || track.getSourceName() !== sourceName) {
            conference.eventEmitter.emit(JitsiConferenceEvents.TRACK_REMOVED, track);

            // Update the owner and other properties on the track.
            track.setOwner(owner);
            track.setSourceName(sourceName);
            track._setVideoType(videoType);
            owner && conference.eventEmitter.emit(JitsiConferenceEvents.TRACK_ADDED, track);
        }
    });

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_JOIN_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONNECTION_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.DISPLAY_NAME_REQUIRED,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.DISPLAY_NAME_REQUIRED);

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_CONNECT_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONNECTION_ERROR);
    this.chatRoomForwarder.forward(XMPPEvents.ROOM_CONNECT_NOT_ALLOWED_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.NOT_ALLOWED_ERROR);
    this.chatRoomForwarder.forward(XMPPEvents.ROOM_CONNECT_MEMBERS_ONLY_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.MEMBERS_ONLY_ERROR);

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
        () => Statistics.sendAnalytics(createBridgeDownEvent()));

    chatRoom.addListener(XMPPEvents.CONNECTION_RESTARTED,
        jingleSession => {
            conference._onConferenceRestarted(jingleSession);
        });

    this.chatRoomForwarder.forward(XMPPEvents.RESERVATION_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.RESERVATION_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.GRACEFUL_SHUTDOWN,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.GRACEFUL_SHUTDOWN);

    this.chatRoomForwarder.forward(XMPPEvents.MUC_DESTROYED,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONFERENCE_DESTROYED);

    this.chatRoomForwarder.forward(XMPPEvents.CHAT_ERROR_RECEIVED,
        JitsiConferenceEvents.CONFERENCE_ERROR,
        JitsiConferenceErrors.CHAT_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.SETTINGS_ERROR_RECEIVED,
        JitsiConferenceEvents.CONFERENCE_ERROR,
        JitsiConferenceErrors.SETTINGS_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.FOCUS_DISCONNECTED,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.FOCUS_DISCONNECTED);

    chatRoom.addListener(XMPPEvents.FOCUS_LEFT,
        () => {
            Statistics.sendAnalytics(createFocusLeftEvent());
            conference.eventEmitter.emit(
                JitsiConferenceEvents.CONFERENCE_FAILED,
                JitsiConferenceErrors.FOCUS_LEFT);
        });

    chatRoom.addListener(XMPPEvents.SESSION_ACCEPT_TIMEOUT,
        jingleSession => {
            Statistics.sendAnalyticsAndLog(
                createJingleEvent(
                    ACTION_JINGLE_SA_TIMEOUT,
                    { p2p: jingleSession.isP2P }));
        });

    chatRoom.addListener(XMPPEvents.RECORDER_STATE_CHANGED,
        (session, jid) => {

            if (jid) {
                const resource = Strophe.getResourceFromJid(jid);
                const participant = conference.getParticipantById(resource) || resource;

                if (session.getStatus() === 'off') {
                    session.setTerminator(participant);
                } else if (session.getStatus() === 'on') {
                    session.setInitiator(participant);
                }
            }

            conference.eventEmitter.emit(
                JitsiConferenceEvents.RECORDER_STATE_CHANGED,
                session);
        });

    this.chatRoomForwarder.forward(XMPPEvents.TRANSCRIPTION_STATUS_CHANGED,
        JitsiConferenceEvents.TRANSCRIPTION_STATUS_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED,
        JitsiConferenceEvents.VIDEO_SIP_GW_AVAILABILITY_CHANGED);

    this.chatRoomForwarder.forward(
        XMPPEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED,
        JitsiConferenceEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.PHONE_NUMBER_CHANGED,
        JitsiConferenceEvents.PHONE_NUMBER_CHANGED);

    chatRoom.setParticipantPropertyListener((id, prop, value) => {
        const participant = conference.getParticipantById(id);

        if (!participant) {
            return;
        }

        participant.setProperty(prop, value);
    });

    chatRoom.addListener(XMPPEvents.KICKED,
        conference.onMemberKicked.bind(conference));
    chatRoom.addListener(XMPPEvents.SUSPEND_DETECTED,
        conference.onSuspendDetected.bind(conference));

    this.chatRoomForwarder.forward(XMPPEvents.MUC_LOCK_CHANGED,
        JitsiConferenceEvents.LOCK_STATE_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.MUC_MEMBERS_ONLY_CHANGED,
        JitsiConferenceEvents.MEMBERS_ONLY_CHANGED);
    this.chatRoomForwarder.forward(XMPPEvents.MUC_VISITORS_SUPPORTED_CHANGED,
        JitsiConferenceEvents.VISITORS_SUPPORTED_CHANGED);

    chatRoom.addListener(XMPPEvents.MUC_MEMBER_JOINED,
        conference.onMemberJoined.bind(conference));
    this.chatRoomForwarder.forward(XMPPEvents.MUC_LOBBY_MEMBER_JOINED,
        JitsiConferenceEvents.LOBBY_USER_JOINED);
    this.chatRoomForwarder.forward(XMPPEvents.MUC_LOBBY_MEMBER_UPDATED,
        JitsiConferenceEvents.LOBBY_USER_UPDATED);
    this.chatRoomForwarder.forward(XMPPEvents.MUC_LOBBY_MEMBER_LEFT,
        JitsiConferenceEvents.LOBBY_USER_LEFT);
    chatRoom.addListener(XMPPEvents.MUC_MEMBER_BOT_TYPE_CHANGED,
        conference._onMemberBotTypeChanged.bind(conference));
    chatRoom.addListener(XMPPEvents.MUC_MEMBER_LEFT,
        conference.onMemberLeft.bind(conference));
    this.chatRoomForwarder.forward(XMPPEvents.MUC_LEFT,
        JitsiConferenceEvents.CONFERENCE_LEFT);
    this.chatRoomForwarder.forward(XMPPEvents.MUC_DENIED_ACCESS,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONFERENCE_ACCESS_DENIED);

    chatRoom.addListener(XMPPEvents.DISPLAY_NAME_CHANGED,
        conference.onDisplayNameChanged.bind(conference));

    chatRoom.addListener(XMPPEvents.SILENT_STATUS_CHANGED,
        conference.onSilentStatusChanged.bind(conference));

    chatRoom.addListener(XMPPEvents.LOCAL_ROLE_CHANGED, role => {
        conference.onLocalRoleChanged(role);
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
        (jid, txt, myJid, ts, nick, isGuest, messageId) => {
            const participantId = Strophe.getResourceFromJid(jid);

            conference.eventEmitter.emit(
                JitsiConferenceEvents.MESSAGE_RECEIVED,
                participantId, txt, ts, nick, isGuest, messageId);
        });

    chatRoom.addListener(
        XMPPEvents.REACTION_RECEIVED,

        (jid, reactionList, messageId) => {
            const participantId = Strophe.getResourceFromJid(jid);

            conference.eventEmitter.emit(
                JitsiConferenceEvents.REACTION_RECEIVED,
                participantId, reactionList, messageId);
        });

    chatRoom.addListener(
        XMPPEvents.PRIVATE_MESSAGE_RECEIVED,

        // eslint-disable-next-line max-params
        (jid, txt, myJid, ts, messageId) => {
            const participantId = Strophe.getResourceFromJid(jid);

            conference.eventEmitter.emit(
                JitsiConferenceEvents.PRIVATE_MESSAGE_RECEIVED,
                participantId, txt, ts, messageId);
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

    chatRoom.addListener(XMPPEvents.JSON_MESSAGE_RECEIVED,
        (from, payload) => {
            const id = Strophe.getResourceFromJid(from);
            const participant = conference.getParticipantById(id);

            if (participant) {
                conference.eventEmitter.emit(
                    JitsiConferenceEvents.ENDPOINT_MESSAGE_RECEIVED,
                    participant, payload);
            } else {
                conference.eventEmitter.emit(
                    JitsiConferenceEvents.NON_PARTICIPANT_MESSAGE_RECEIVED,
                    id, payload);
            }
        });

    chatRoom.addPresenceListener('startmuted', (data, from) => {
        // Ignore the strartmuted policy if the presence is received from self. The moderator should join with
        // available local sources and the policy needs to be applied only on users that join the call after.
        if (conference.myUserId() === from) {
            return;
        }
        const participant = conference.getParticipantById(from);

        if (!participant || !participant.isModerator()) {
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

    // Breakout rooms.
    this.chatRoomForwarder.forward(XMPPEvents.BREAKOUT_ROOMS_MOVE_TO_ROOM,
        JitsiConferenceEvents.BREAKOUT_ROOMS_MOVE_TO_ROOM);
    this.chatRoomForwarder.forward(XMPPEvents.BREAKOUT_ROOMS_UPDATED,
        JitsiConferenceEvents.BREAKOUT_ROOMS_UPDATED);

    // Room metadata.
    this.chatRoomForwarder.forward(XMPPEvents.ROOM_METADATA_UPDATED,
        JitsiConferenceEvents.METADATA_UPDATED);
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
        (dominant, previous, silence) => {
            if ((conference.lastDominantSpeaker !== dominant || conference.dominantSpeakerIsSilent !== silence)
                    && conference.room) {
                conference.lastDominantSpeaker = dominant;
                conference.dominantSpeakerIsSilent = silence;
                conference.eventEmitter.emit(
                    JitsiConferenceEvents.DOMINANT_SPEAKER_CHANGED, dominant, previous, silence);
                if (conference.statistics && conference.myUserId() === dominant) {
                    // We are the new dominant speaker.
                    conference.xmpp.sendDominantSpeakerEvent(conference.room.roomjid, silence);
                }
                if (conference.lastDominantSpeaker !== dominant) {
                    if (previous && previous.length) {
                        const speakerList = previous.slice(0);

                        // Add the dominant speaker to the top of the list (exclude self).
                        if (conference.myUserId !== dominant) {
                            speakerList.splice(0, 0, dominant);
                        }

                        // Trim the list to the top 5 speakers only.
                        if (speakerList.length > SPEAKERS_AUDIO_LEVELS) {
                            speakerList.splice(SPEAKERS_AUDIO_LEVELS, speakerList.length - SPEAKERS_AUDIO_LEVELS);
                        }
                        conference.statistics && conference.statistics.setSpeakerList(speakerList);
                    }
                }
            }
        });

    rtc.addListener(RTCEvents.DATA_CHANNEL_OPEN, () => {
        const now = window.performance.now();
        const key = 'data.channel.opened';

        // TODO: Move all of the 'connectionTimes' logic to its own module.
        logger.log(`(TIME) ${key}:\t`, now);
        conference.room.connectionTimes[key] = now;
        Statistics.sendAnalytics(
            createConnectionStageReachedEvent(key, { value: now }));

        conference.eventEmitter.emit(JitsiConferenceEvents.DATA_CHANNEL_OPENED);
    });

    rtc.addListener(RTCEvents.DATA_CHANNEL_CLOSED, ev => {
        conference.eventEmitter.emit(JitsiConferenceEvents.DATA_CHANNEL_CLOSED, ev);
    });

    rtc.addListener(RTCEvents.VIDEO_SSRCS_REMAPPED, msg => {
        this.conference.jvbJingleSession.processSourceMap(msg, MediaType.VIDEO);
    });

    rtc.addListener(RTCEvents.AUDIO_SSRCS_REMAPPED, msg => {
        this.conference.jvbJingleSession.processSourceMap(msg, MediaType.AUDIO);
    });

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

    rtc.addListener(RTCEvents.ENDPOINT_STATS_RECEIVED,
        (from, payload) => {
            const participant = conference.getParticipantById(from);

            if (participant) {
                conference.eventEmitter.emit(JitsiConferenceEvents.ENDPOINT_STATS_RECEIVED, participant, payload);
            } else {
                logger.warn(`Ignoring ENDPOINT_STATS_RECEIVED for a non-existant participant: ${from}`);
            }
        });

    rtc.addListener(RTCEvents.CREATE_ANSWER_FAILED,
        (e, tpc) => {
            if (!tpc.isP2P) {
                conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
                    JitsiConferenceErrors.OFFER_ANSWER_FAILED, e);
            }
        });

    rtc.addListener(RTCEvents.CREATE_OFFER_FAILED,
        (e, tpc) => {
            if (!tpc.isP2P) {
                conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
                    JitsiConferenceErrors.OFFER_ANSWER_FAILED, e);
            }
        });

    rtc.addListener(RTCEvents.SET_LOCAL_DESCRIPTION_FAILED,
        (e, tpc) => {
            if (!tpc.isP2P) {
                conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
                    JitsiConferenceErrors.OFFER_ANSWER_FAILED, e);
            }
        });

    rtc.addListener(RTCEvents.SET_REMOTE_DESCRIPTION_FAILED,
        (e, tpc) => {
            if (!tpc.isP2P) {
                conference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_FAILED,
                    JitsiConferenceErrors.OFFER_ANSWER_FAILED, e);
            }
        });
};

/**
 * Removes event listeners related to conference.xmpp
 */
JitsiConferenceEventManager.prototype.removeXMPPListeners = function() {
    const conference = this.conference;

    Object.keys(this.xmppListeners).forEach(eventName => {
        conference.xmpp.removeListener(
            eventName,
            this.xmppListeners[eventName]);
    });
    this.xmppListeners = {};
};


/**
 * Setups event listeners related to conference.xmpp
 */
JitsiConferenceEventManager.prototype.setupXMPPListeners = function() {
    const conference = this.conference;

    this._addConferenceXMPPListener(
        XMPPEvents.CALL_INCOMING,
        conference.onIncomingCall.bind(conference));
    this._addConferenceXMPPListener(
        XMPPEvents.CALL_ACCEPTED,
        conference.onCallAccepted.bind(conference));
    this._addConferenceXMPPListener(
        XMPPEvents.TRANSPORT_INFO,
        conference.onTransportInfo.bind(conference));
    this._addConferenceXMPPListener(
        XMPPEvents.CALL_ENDED,
        conference.onCallEnded.bind(conference));

    this._addConferenceXMPPListener(XMPPEvents.START_MUTED_FROM_FOCUS,
        (audioMuted, videoMuted) => {
            if (conference.options.config.ignoreStartMuted) {
                return;
            }

            conference.startAudioMuted = audioMuted;
            conference.startVideoMuted = videoMuted;

            if (audioMuted) {
                conference.isMutedByFocus = true;
            }

            if (videoMuted) {
                conference.isVideoMutedByFocus = true;
            }

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

    this._addConferenceXMPPListener(XMPPEvents.AV_MODERATION_CHANGED,
        (value, mediaType, actorJid) => {
            const actorParticipant = conference.getParticipants().find(p => p.getJid() === actorJid);

            conference.eventEmitter.emit(JitsiConferenceEvents.AV_MODERATION_CHANGED, {
                enabled: value,
                mediaType,
                actor: actorParticipant
            });
        });
    this._addConferenceXMPPListener(XMPPEvents.AV_MODERATION_PARTICIPANT_APPROVED,
        (mediaType, jid) => {
            const participant = conference.getParticipantById(Strophe.getResourceFromJid(jid));

            if (participant) {
                conference.eventEmitter.emit(JitsiConferenceEvents.AV_MODERATION_PARTICIPANT_APPROVED, {
                    participant,
                    mediaType
                });
            }
        });
    this._addConferenceXMPPListener(XMPPEvents.AV_MODERATION_PARTICIPANT_REJECTED,
        (mediaType, jid) => {
            const participant = conference.getParticipantById(Strophe.getResourceFromJid(jid));

            if (participant) {
                conference.eventEmitter.emit(JitsiConferenceEvents.AV_MODERATION_PARTICIPANT_REJECTED, {
                    participant,
                    mediaType
                });
            }
        });
    this._addConferenceXMPPListener(XMPPEvents.AV_MODERATION_APPROVED,
        value => conference.eventEmitter.emit(JitsiConferenceEvents.AV_MODERATION_APPROVED, { mediaType: value }));
    this._addConferenceXMPPListener(XMPPEvents.AV_MODERATION_REJECTED,
        value => {
            conference.eventEmitter.emit(JitsiConferenceEvents.AV_MODERATION_REJECTED, { mediaType: value });
        });

    this._addConferenceXMPPListener(XMPPEvents.VISITORS_MESSAGE,
        value => conference.eventEmitter.emit(JitsiConferenceEvents.VISITORS_MESSAGE, value));
    this._addConferenceXMPPListener(XMPPEvents.VISITORS_REJECTION,
        () => conference.eventEmitter.emit(JitsiConferenceEvents.VISITORS_REJECTION));
};

/**
 * Add XMPP listener and save its reference for remove on leave conference.
 */
JitsiConferenceEventManager.prototype._addConferenceXMPPListener = function(
        eventName, listener) {
    this.xmppListeners[eventName] = listener;
    this.conference.xmpp.addListener(eventName, listener);
};

/**
 * Setups event listeners related to conference.statistics
 */
JitsiConferenceEventManager.prototype.setupStatisticsListeners = function() {
    const conference = this.conference;

    if (!conference.statistics) {
        return;
    }

    /* eslint-disable max-params */
    conference.statistics.addAudioLevelListener((tpc, ssrc, level, isLocal) => {
        conference.rtc.setAudioLevel(tpc, ssrc, level, isLocal);
    });

    /* eslint-enable max-params */

    // Forward the "before stats disposed" event
    conference.statistics.addBeforeDisposedListener(() => {
        conference.eventEmitter.emit(
            JitsiConferenceEvents.BEFORE_STATISTICS_DISPOSED);
    });

    conference.statistics.addEncodeTimeStatsListener((tpc, stats) => {
        conference.eventEmitter.emit(
            JitsiConferenceEvents.ENCODE_TIME_STATS_RECEIVED, tpc, stats);
    });

    // if we are in startSilent mode we will not be sending/receiving so nothing to detect
    if (!conference.options.config.startSilent) {
        conference.statistics.addByteSentStatsListener((tpc, stats) => {
            conference.getLocalTracks(MediaType.AUDIO).forEach(track => {
                const ssrc = tpc.getLocalSSRC(track);

                if (!ssrc || !stats.hasOwnProperty(ssrc)) {
                    return;
                }

                track.onByteSentStatsReceived(tpc, stats[ssrc]);
            });
        });
    }
};
