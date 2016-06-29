/* global Strophe */
var logger = require("jitsi-meet-logger").getLogger(__filename);
var EventEmitterForwarder = require("./modules/util/EventEmitterForwarder");
var XMPPEvents = require("./service/xmpp/XMPPEvents");
var RTCEvents = require("./service/RTC/RTCEvents");
var JitsiConferenceEvents = require("./JitsiConferenceEvents");
var JitsiConferenceErrors = require("./JitsiConferenceErrors");
var AuthenticationEvents =
    require("./service/authentication/AuthenticationEvents");
var Statistics = require("./modules/statistics/statistics");
var MediaType = require("./service/RTC/MediaType");

/**
 * Setups all event listeners related to conference
 * @param conference {JitsiConference} the conference
 */
function JitsiConferenceEventManager(conference) {
    this.conference = conference;
    this.chatRoomForwarder = new EventEmitterForwarder(this.conference.room,
        this.conference.eventEmitter);
}

/**
 * Setups event listeners related to conference.chatRoom
 */
JitsiConferenceEventManager.prototype.setupChatRoomListeners = function () {
    var conference = this.conference;

    conference.room.addListener(XMPPEvents.ICE_RESTARTING, function () {
        // All data channels have to be closed, before ICE restart
        // otherwise Chrome will not trigger "opened" event for the channel
        // established with the new bridge
        conference.rtc.closeAllDataChannels();
    });

    conference.room.addListener(XMPPEvents.REMOTE_TRACK_ADDED,
        function (data) {
            var track = conference.rtc.createRemoteTrack(data);
            if (track) {
                conference.onTrackAdded(track);
            }
        }
    );
    conference.room.addListener(XMPPEvents.REMOTE_TRACK_REMOVED,
        function (streamId, trackId) {
            conference.getParticipants().forEach(function(participant) {
                var tracks = participant.getTracks();
                for(var i = 0; i < tracks.length; i++) {
                    if(tracks[i]
                        && tracks[i].getStreamId() == streamId
                        && tracks[i].getTrackId() == trackId) {
                        var track = participant._tracks.splice(i, 1)[0];
                        conference.eventEmitter.emit(
                            JitsiConferenceEvents.TRACK_REMOVED, track);
                        return;
                    }
                }
            });
        }
    );

    conference.room.addListener(XMPPEvents.AUDIO_MUTED_BY_FOCUS,
        function (value) {
            // set isMutedByFocus when setAudioMute Promise ends
            conference.rtc.setAudioMute(value).then(
                function() {
                    conference.isMutedByFocus = true;
                },
                function() {
                    logger.warn(
                        "Error while audio muting due to focus request");
                });
        }
    );

    this.chatRoomForwarder.forward(XMPPEvents.SUBJECT_CHANGED,
        JitsiConferenceEvents.SUBJECT_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.MUC_JOINED,
        JitsiConferenceEvents.CONFERENCE_JOINED);

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_JOIN_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONNECTION_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.ROOM_CONNECT_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.CONNECTION_ERROR);

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

    this.chatRoomForwarder.forward(XMPPEvents.RESERVATION_ERROR,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.RESERVATION_ERROR);

    this.chatRoomForwarder.forward(XMPPEvents.GRACEFUL_SHUTDOWN,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.GRACEFUL_SHUTDOWN);

    conference.room.addListener(XMPPEvents.JINGLE_FATAL_ERROR,
        function (session, error) {
            conference.eventEmitter.emit(
                JitsiConferenceEvents.CONFERENCE_FAILED,
                JitsiConferenceErrors.JINGLE_FATAL_ERROR, error);
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

    this.chatRoomForwarder.forward(XMPPEvents.FOCUS_LEFT,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.FOCUS_LEFT);

    this.chatRoomForwarder.forward(XMPPEvents.CONNECTION_INTERRUPTED,
        JitsiConferenceEvents.CONNECTION_INTERRUPTED);

    this.chatRoomForwarder.forward(XMPPEvents.RECORDER_STATE_CHANGED,
        JitsiConferenceEvents.RECORDER_STATE_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.PHONE_NUMBER_CHANGED,
        JitsiConferenceEvents.PHONE_NUMBER_CHANGED);

    this.chatRoomForwarder.forward(XMPPEvents.CONNECTION_RESTORED,
        JitsiConferenceEvents.CONNECTION_RESTORED);

    this.chatRoomForwarder.forward(XMPPEvents.CONFERENCE_SETUP_FAILED,
        JitsiConferenceEvents.CONFERENCE_FAILED,
        JitsiConferenceErrors.SETUP_FAILED);

    conference.room.setParticipantPropertyListener(function (node, from) {
        var participant = conference.getParticipantById(from);
        if (!participant) {
            return;
        }

        participant.setProperty(
            node.tagName.substring("jitsi_participant_".length),
            node.value);
    });

    this.chatRoomForwarder.forward(XMPPEvents.KICKED,
        JitsiConferenceEvents.KICKED);

    conference.room.addListener(XMPPEvents.MUC_MEMBER_JOINED,
        conference.onMemberJoined.bind(conference));
    conference.room.addListener(XMPPEvents.MUC_MEMBER_LEFT,
        conference.onMemberLeft.bind(conference));

    conference.room.addListener(XMPPEvents.DISPLAY_NAME_CHANGED,
        conference.onDisplayNameChanged.bind(conference));

    conference.room.addListener(XMPPEvents.LOCAL_ROLE_CHANGED, function (role) {
        conference.eventEmitter.emit(JitsiConferenceEvents.USER_ROLE_CHANGED,
            conference.myUserId(), role);

        // log all events for the recorder operated by the moderator
        if (conference.statistics && conference.isModerator()) {
            conference.on(JitsiConferenceEvents.RECORDER_STATE_CHANGED,
                function (status, error) {
                    Statistics.sendLog("[Recorder] status: " + status
                        + (error? " error: " + error : ""));
                });
        }
    });

    conference.room.addListener(XMPPEvents.MUC_ROLE_CHANGED,
        conference.onUserRoleChanged.bind(conference));

    conference.room.addListener(AuthenticationEvents.IDENTITY_UPDATED,
        function (authEnabled, authIdentity) {
            conference.authEnabled = authEnabled;
            conference.authIdentity = authIdentity;
            conference.eventEmitter.emit(
                JitsiConferenceEvents.AUTH_STATUS_CHANGED, authEnabled,
                authIdentity);
        });

    conference.room.addListener(XMPPEvents.MESSAGE_RECEIVED,
        function (jid, displayName, txt, myJid, ts) {
            var id = Strophe.getResourceFromJid(jid);
            conference.eventEmitter.emit(JitsiConferenceEvents.MESSAGE_RECEIVED,
                id, txt, ts);
        });

    conference.room.addListener(XMPPEvents.PRESENCE_STATUS,
        function (jid, status) {
            var id = Strophe.getResourceFromJid(jid);
            var participant = conference.getParticipantById(id);
            if (!participant || participant._status === status) {
                return;
            }
            participant._status = status;
            conference.eventEmitter.emit(
                JitsiConferenceEvents.USER_STATUS_CHANGED, id, status);
        });

    conference.room.addPresenceListener("startmuted", function (data, from) {
        var isModerator = false;
        if (conference.myUserId() === from && conference.isModerator()) {
            isModerator = true;
        } else {
            var participant = conference.getParticipantById(from);
            if (participant && participant.isModerator()) {
                isModerator = true;
            }
        }

        if (!isModerator) {
            return;
        }

        var startAudioMuted = data.attributes.audio === 'true';
        var startVideoMuted = data.attributes.video === 'true';

        var updated = false;

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

    conference.room.addPresenceListener("videomuted", function (values, from) {
        conference.rtc.handleRemoteTrackMute(MediaType.VIDEO,
            values.value == "true", from);
    });

    conference.room.addPresenceListener("audiomuted", function (values, from) {
        conference.rtc.handleRemoteTrackMute(MediaType.AUDIO,
            values.value == "true", from);
    });

    conference.room.addPresenceListener("videoType", function(data, from) {
        conference.rtc.handleRemoteTrackVideoTypeChanged(data.value, from);
    });

    conference.room.addPresenceListener("devices", function (data, from) {
        var isAudioAvailable = false;
        var isVideoAvailable = false;
        data.children.forEach(function (config) {
            if (config.tagName === 'audio') {
                isAudioAvailable = config.value === 'true';
            }
            if (config.tagName === 'video') {
                isVideoAvailable = config.value === 'true';
            }
        });

        var availableDevices;
        if (conference.myUserId() === from) {
            availableDevices = conference.availableDevices;
        } else {
            var participant = conference.getParticipantById(from);
            if (!participant) {
                return;
            }

            availableDevices = participant._availableDevices;
        }

        var updated = false;

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

    if(conference.statistics) {
        conference.room.addListener(XMPPEvents.DISPOSE_CONFERENCE,
            function () {
                conference.statistics.dispose();
            });

        conference.room.addListener(XMPPEvents.CONNECTION_ICE_FAILED,
            function (pc) {
                conference.statistics.sendIceConnectionFailedEvent(pc);
                conference.room.eventEmitter.emit(
                    XMPPEvents.CONFERENCE_SETUP_FAILED,
                    new Error("ICE fail"));
            });

        conference.room.addListener(XMPPEvents.CREATE_OFFER_FAILED,
            function (e, pc) {
                conference.statistics.sendCreateOfferFailed(e, pc);
            });

        conference.room.addListener(XMPPEvents.CREATE_ANSWER_FAILED,
            function (e, pc) {
                conference.statistics.sendCreateAnswerFailed(e, pc);
            });

        conference.room.addListener(XMPPEvents.SET_LOCAL_DESCRIPTION_FAILED,
            function (e, pc) {
                conference.statistics.sendSetLocalDescFailed(e, pc);
            });

        conference.room.addListener(XMPPEvents.SET_REMOTE_DESCRIPTION_FAILED,
            function (e, pc) {
                conference.statistics.sendSetRemoteDescFailed(e, pc);
            });

        conference.room.addListener(XMPPEvents.ADD_ICE_CANDIDATE_FAILED,
            function (e, pc) {
                conference.statistics.sendAddIceCandidateFailed(e, pc);
            });
    }
};

/**
 * Setups event listeners related to conference.rtc
 */
JitsiConferenceEventManager.prototype.setupRTCListeners = function () {
    var conference = this.conference;
    conference.rtc.addListener(RTCEvents.DOMINANTSPEAKER_CHANGED,
        function (id) {
            if(conference.lastDominantSpeaker !== id && conference.room) {
                conference.lastDominantSpeaker = id;
                conference.eventEmitter.emit(
                    JitsiConferenceEvents.DOMINANT_SPEAKER_CHANGED, id);
            }
            if (conference.statistics && conference.myUserId() === id) {
                // We are the new dominant speaker.
                conference.statistics.sendDominantSpeakerEvent();
            }
        });

    conference.rtc.addListener(RTCEvents.DATA_CHANNEL_OPEN, function () {
        var now = window.performance.now();
        logger.log("(TIME) data channel opened ", now);
        conference.room.connectionTimes["data.channel.opened"] = now;
    });

    conference.rtc.addListener(RTCEvents.LASTN_CHANGED,
        function (oldValue, newValue) {
            conference.eventEmitter.emit(
                JitsiConferenceEvents.IN_LAST_N_CHANGED, oldValue, newValue);
        });

    conference.rtc.addListener(RTCEvents.LASTN_ENDPOINT_CHANGED,
        function (lastNEndpoints, endpointsEnteringLastN) {
            conference.eventEmitter.emit(
                JitsiConferenceEvents.LAST_N_ENDPOINTS_CHANGED,
                lastNEndpoints, endpointsEnteringLastN);
        });

    conference.rtc.addListener(RTCEvents.AVAILABLE_DEVICES_CHANGED,
        function (devices) {
            conference.room.updateDeviceAvailability(devices);
        });
};

/**
 * Setups event listeners related to conference.xmpp
 */
JitsiConferenceEventManager.prototype.setupXMPPListeners = function () {
    var conference = this.conference;
    conference.xmpp.addListener(
        XMPPEvents.CALL_INCOMING, conference.onIncomingCall.bind(conference));

    conference.xmpp.addListener(XMPPEvents.START_MUTED_FROM_FOCUS,
        function (audioMuted, videoMuted) {
            conference.startAudioMuted = audioMuted;
            conference.startVideoMuted = videoMuted;

            // mute existing local tracks because this is initial mute from
            // Jicofo
            conference.getLocalTracks().forEach(function (track) {
                if (conference.startAudioMuted && track.isAudioTrack()) {
                    track.mute();
                }
                if (conference.startVideoMuted && track.isVideoTrack()) {
                    track.mute();
                }
            });

            conference.eventEmitter.emit(JitsiConferenceEvents.STARTED_MUTED);
        });
};

/**
 * Setups event listeners related to conference.statistics
 */
JitsiConferenceEventManager.prototype.setupStatisticsListeners = function () {
    var conference = this.conference;
    if(!conference.statistics)
        return;

    conference.statistics.addAudioLevelListener(function (ssrc, level) {
        var userId = null;

        var resource = conference.rtc.getResourceBySSRC(ssrc);
        if (!resource)
            return;

        conference.rtc.setAudioLevel(resource, level);
    });
    conference.statistics.addConnectionStatsListener(function (stats) {
        var ssrc2resolution = stats.resolution;

        var id2resolution = {};

        // preprocess resolutions: group by user id, skip incorrect
        // resolutions etc.
        Object.keys(ssrc2resolution).forEach(function (ssrc) {
            var resolution = ssrc2resolution[ssrc];

            if (!resolution.width || !resolution.height ||
                resolution.width == -1 || resolution.height == -1) {
                return;
            }

            var id = conference.rtc.getResourceBySSRC(ssrc);
            if (!id) {
                return;
            }

            // ssrc to resolution map for user id
            var idResolutions = id2resolution[id] || {};
            idResolutions[ssrc] = resolution;

            id2resolution[id] = idResolutions;
        });

        stats.resolution = id2resolution;

        conference.eventEmitter.emit(
            JitsiConferenceEvents.CONNECTION_STATS, stats);
    });

    conference.on(JitsiConferenceEvents.TRACK_MUTE_CHANGED,
        function (track) {
            if(!track.isLocal())
                return;
            var type = (track.getType() === "audio")? "audio" : "video";
            conference.statistics.sendMuteEvent(track.isMuted(), type);
        });
};

module.exports = JitsiConferenceEventManager;
