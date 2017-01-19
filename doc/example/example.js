/* global $, JitsiMeetJS */

var options = {
    hosts: {
        domain: 'jitsi-meet.example.com',
        muc: 'conference.jitsi-meet.example.com', // FIXME: use XEP-0030
    },
    bosh: '//jitsi-meet.example.com/http-bind', // FIXME: use xep-0156 for that
    clientNode: 'http://jitsi.org/jitsimeet', // The name of client node advertised in XEP-0115 'c' stanza
};

var confOptions = {
    openSctp: true
};

var isJoined = false;

/**
 * Handles local tracks.
 * @param tracks Array with JitsiTrack objects
 */
function onLocalTracks(tracks)
{
    localTracks = tracks;
    for(var i = 0; i < localTracks.length; i++)
    {
        localTracks[i].addEventListener(JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
            function (audioLevel) {
                console.log("Audio Level local: " + audioLevel);
            });
        localTracks[i].addEventListener(JitsiMeetJS.events.track.TRACK_MUTE_CHANGED,
            function () {
                console.log("local track muted");
            });
        localTracks[i].addEventListener(JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
            function () {
                console.log("local track stoped");
            });
        localTracks[i].addEventListener(JitsiMeetJS.events.track.TRACK_AUDIO_OUTPUT_CHANGED,
            function (deviceId) {
                console.log("track audio output device was changed to " + deviceId);
            });
        if(localTracks[i].getType() == "video") {
            $("body").append("<video autoplay='1' id='localVideo" + i + "' />");
            localTracks[i].attach($("#localVideo" + i)[0]);
        } else {
            $("body").append("<audio autoplay='1' muted='true' id='localAudio" + i + "' />");
            localTracks[i].attach($("#localAudio" + i)[0]);
        }
        if(isJoined)
            room.addTrack(localTracks[i]);
    }
}

/**
 * Handles remote tracks
 * @param track JitsiTrack object
 */
function onRemoteTrack(track) {
    if(track.isLocal())
        return;
    var participant = track.getParticipantId();
    if(!remoteTracks[participant])
        remoteTracks[participant] = [];
    var idx = remoteTracks[participant].push(track);
    track.addEventListener(JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
        function (audioLevel) {
            console.log("Audio Level remote: " + audioLevel);
        });
    track.addEventListener(JitsiMeetJS.events.track.TRACK_MUTE_CHANGED,
        function () {
            console.log("remote track muted");
        });
    track.addEventListener(JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
        function () {
            console.log("remote track stoped");
        });
    track.addEventListener(JitsiMeetJS.events.track.TRACK_AUDIO_OUTPUT_CHANGED,
        function (deviceId) {
            console.log("track audio output device was changed to " + deviceId);
        });
    var id = participant + track.getType() + idx;
    if(track.getType() == "video") {
        $("body").append("<video autoplay='1' id='" + participant + "video" + idx + "' />");
    } else {
        $("body").append("<audio autoplay='1' id='" + participant + "audio" + idx + "' />");
    }
    track.attach($("#" + id)[0]);
}

/**
 * That function is executed when the conference is joined
 */
function onConferenceJoined () {
    console.log("conference joined!");
    isJoined = true;
    for(var i = 0; i < localTracks.length; i++)
        room.addTrack(localTracks[i]);
}

function onUserLeft(id) {
    console.log("user left");
    if(!remoteTracks[id])
        return;
    var tracks = remoteTracks[id];
    for(var i = 0; i< tracks.length; i++)
        tracks[i].detach($("#" + id + tracks[i].getType()));
}

/**
 * That function is called when connection is established successfully
 */
function onConnectionSuccess(){
    room = connection.initJitsiConference("conference", confOptions);
    room.on(JitsiMeetJS.events.conference.TRACK_ADDED, onRemoteTrack);
    room.on(JitsiMeetJS.events.conference.TRACK_REMOVED, function (track) {
        console.log("track removed!!!" + track);
    });
    room.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, onConferenceJoined);
    room.on(JitsiMeetJS.events.conference.USER_JOINED, function(id){ console.log("user join");remoteTracks[id] = [];});
    room.on(JitsiMeetJS.events.conference.USER_LEFT, onUserLeft);
    room.on(JitsiMeetJS.events.conference.TRACK_MUTE_CHANGED, function (track) {
        console.log(track.getType() + " - " + track.isMuted());
    });
    room.on(JitsiMeetJS.events.conference.DISPLAY_NAME_CHANGED, function (userID, displayName) {
        console.log(userID + " - " + displayName);
    });
    room.on(JitsiMeetJS.events.conference.TRACK_AUDIO_LEVEL_CHANGED,
      function(userID, audioLevel){
          console.log(userID + " - " + audioLevel);
      });
    room.on(JitsiMeetJS.events.conference.RECORDER_STATE_CHANGED, function () {
        console.log(room.isRecordingSupported() + " - " +
            room.getRecordingState() + " - " +
            room.getRecordingURL());
    });
    room.on(JitsiMeetJS.events.conference.PHONE_NUMBER_CHANGED, function () {
        console.log(
            room.getPhoneNumber() + " - " +
            room.getPhonePin());
    });
    room.join();
}

/**
 * This function is called when the connection fail.
 */
function onConnectionFailed() {
    console.error("Connection Failed!");
}

/**
 * This function is called when the connection fail.
 */
function onDeviceListChanged(devices) {
    console.info('current devices', devices);
}

/**
 * This function is called when we disconnect.
 */
function disconnect(){
    console.log("disconnect!");
    connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnectionSuccess);
    connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onConnectionFailed);
    connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED, disconnect);
}

function unload() {
    for(var i = 0; i < localTracks.length; i++)
        localTracks[i].stop();
    room.leave();
    connection.disconnect();
}

var isVideo = true;
function switchVideo() { // eslint-disable-line no-unused-vars
    isVideo = !isVideo;
    if(localTracks[1]) {
        localTracks[1].dispose();
        localTracks.pop();
    }
    JitsiMeetJS.createLocalTracks({devices: isVideo? ["video"] : ["desktop"]}).
        then(function (tracks) {
            localTracks.push(tracks[0]);
            localTracks[1].addEventListener(JitsiMeetJS.events.track.TRACK_MUTE_CHANGED,
                function () {
                    console.log("local track muted");
                });
            localTracks[1].addEventListener(JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
                function () {
                    console.log("local track stoped");
                });
            localTracks[1].attach($("#localVideo1")[0]);
            room.addTrack(localTracks[1]);
        }).catch(function (error) {
            console.log(error);
        });
}

function changeAudioOutput(selected) { // eslint-disable-line no-unused-vars
    JitsiMeetJS.mediaDevices.setAudioOutputDevice(selected.value);
}

$(window).bind('beforeunload', unload);
$(window).bind('unload', unload);

// JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
var initOptions = {
    disableAudioLevels: true,
    // The ID of the jidesha extension for Chrome.
    desktopSharingChromeExtId: 'mbocklcggfhnbahlnepmldehdhpjfcjp',
    // Whether desktop sharing should be disabled on Chrome.
    desktopSharingChromeDisabled: false,
    // The media sources to use when using screen sharing with the Chrome
    // extension.
    desktopSharingChromeSources: ['screen', 'window'],
    // Required version of Chrome extension
    desktopSharingChromeMinExtVersion: '0.1',

    // The ID of the jidesha extension for Firefox. If null, we assume that no
    // extension is required.
    desktopSharingFirefoxExtId: null,
    // Whether desktop sharing should be disabled on Firefox.
    desktopSharingFirefoxDisabled: true,
    // The maximum version of Firefox which requires a jidesha extension.
    // Example: if set to 41, we will require the extension for Firefox versions
    // up to and including 41. On Firefox 42 and higher, we will run without the
    // extension.
    // If set to -1, an extension will be required for all versions of Firefox.
    desktopSharingFirefoxMaxVersionExtRequired: -1,
    // The URL to the Firefox extension for desktop sharing.
    desktopSharingFirefoxExtensionURL: null
};
JitsiMeetJS.init(initOptions).then(function(){
    connection = new JitsiMeetJS.JitsiConnection(null, null, options);

    connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnectionSuccess);
    connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onConnectionFailed);
    connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED, disconnect);

    JitsiMeetJS.mediaDevices.addEventListener(JitsiMeetJS.events.mediaDevices.DEVICE_LIST_CHANGED, onDeviceListChanged);

    connection.connect();
    JitsiMeetJS.createLocalTracks({devices: ["audio", "video"]}).
        then(onLocalTracks).catch(function (error) {
            throw error;
        });
}).catch(function (error) {
    console.log(error);
});

if (JitsiMeetJS.mediaDevices.isDeviceChangeAvailable('output')) {
    JitsiMeetJS.mediaDevices.enumerateDevices(function(devices) {
        var audioOutputDevices = devices.filter(function(d) { return d.kind === 'audiooutput'; });

        if (audioOutputDevices.length > 1) {
            $('#audioOutputSelect').html(
                audioOutputDevices.map(function (d) {
                    return '<option value="' + d.deviceId + '">' + d.label + '</option>';
                }).join('\n')
            );

            $('#audioOutputSelectWrapper').show();
        }
    });
}

var connection = null;
var room = null;
var localTracks = [];
var remoteTracks = {};
