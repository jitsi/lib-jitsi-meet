Jitsi Meet API
============

You can use Jitsi Meet API to create Jitsi Meet video conferences with custom GUI.

Installation
==========

To embed Jitsi Meet API in your application you need to add Jitsi Meet API library

```javascript
<script src="https://meet.jit.si/lib-jitsi-meet.js"></script>
```

Now you can access Jitsi Meet API trough the ```JitsiMeetJS``` global object.

Components
=========

Jitsi Meet API has the following components:

* JitsiMeetJS

* JitsiConnection

* JitsiConference

* JitsiTrack

* JitsiTrackError

Usage
======
JitsiMeetJS
----------
You can access the following methods and objects trough ```JitsiMeetJS``` object.


*  ```JitsiMeetJS.init(options)``` - this method initialized Jitsi Meet API.
The ```options``` parameter is JS object with the following properties:
    1. useIPv6 - boolean property
    2. desktopSharingChromeExtId - The ID of the jidesha extension for Chrome. Example: 'mbocklcggfhnbahlnepmldehdhpjfcjp'
    3. desktopSharingChromeDisabled - Boolean. Whether desktop sharing should be disabled on Chrome. Example: false.
    4. desktopSharingChromeSources - Array of strings with the media sources to use when using screen sharing with the Chrome extension. Example: ['screen', 'window']
    5. desktopSharingChromeMinExtVersion - Required version of Chrome extension. Example: '0.1'
    6. desktopSharingFirefoxExtId - The ID of the jidesha extension for Firefox. If null, we assume that no extension is required.
    7. desktopSharingFirefoxDisabled - Boolean. Whether desktop sharing should be disabled on Firefox. Example: false.
    8. desktopSharingFirefoxMaxVersionExtRequired - The maximum version of Firefox which requires a jidesha extension. Example: if set to 41, we will require the extension for Firefox versions up to and including 41. On Firefox 42 and higher, we will run without the extension. If set to -1, an extension will be required for all versions of Firefox.
    9. desktopSharingFirefoxExtensionURL - The URL to the Firefox extension for desktop sharing. "null" if no extension is required.
    10. disableAudioLevels - boolean property. Enables/disables audio levels.
    11. disableSimulcast - boolean property. Enables/disables simulcast.
    12. enableWindowOnErrorHandler - boolean property (default false). Enables/disables attaching global onerror handler (window.onerror).
    13. disableThirdPartyRequests - if true - callstats will be disabled and the callstats API won't be included.
    14. enableAnalyticsLogging - boolean property (default false). Enables/disables analytics logging.
    15. callStatsCustomScriptUrl - (optional) custom url to access callstats client script
    16. callStatsConfIDNamespace - (optional) a namespace to prepend the callstats conference ID with. Defaults to the window.location.hostname
    17. disableRtx - (optional) boolean property (default to false).  Enables/disable the use of RTX.
    18. preferH264 - (optional) boolean property (default to false).  Enables/disable preferring the first instance of an h264 codec in an offer by moving it to the front of the codec list.

* ```JitsiMeetJS.JitsiConnection``` - the ```JitsiConnection``` constructor. You can use that to create new server connection.

* ```JitsiMeetJS.setLogLevel``` - changes the log level for the library. For example to have only error messages you should do:
```
JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
```

* ```JitsiMeetJS.createLocalTracks(options, firePermissionPromptIsShownEvent)``` - Creates the media tracks and returns them trough ```Promise``` object. If rejected, passes ```JitsiTrackError``` instance to catch block.
    - options - JS object with configuration options for the local media tracks. You can change the following properties there:
        1. devices - array with the devices - "desktop", "video" and "audio" that will be passed to GUM. If that property is not set GUM will try to get all available devices.
        2. resolution - the prefered resolution for the local video.
        3. cameraDeviceId - the deviceID for the video device that is going to be used
        4. micDeviceId - the deviceID for the audio device that is going to be used
        5. minFps - the minimum frame rate for the video stream (passed to GUM)
        6. maxFps - the maximum frame rate for the video stream (passed to GUM)
        7. facingMode - facing mode for a camera (possible values - 'user', 'environment')
    - firePermissionPromptIsShownEvent - optional boolean parameter. If set to ```true```, ```JitsiMediaDevicesEvents.PERMISSION_PROMPT_IS_SHOWN``` will be fired when browser shows gUM permission prompt.

* ```JitsiMeetJS.enumerateDevices(callback)``` - __DEPRECATED__. Use ```JitsiMeetJS.mediaDevices.enumerateDevices(callback)``` instead.
* ```JitsiMeetJS.isDeviceListAvailable()``` - __DEPRECATED__. Use ```JitsiMeetJS.mediaDevices.isDeviceListAvailable()``` instead.
* ```JitsiMeetJS.isDeviceChangeAvailable(deviceType)``` - __DEPRECATED__. Use ```JitsiMeetJS.mediaDevices.isDeviceChangeAvailable(deviceType)``` instead.
* ```JitsiMeetJS.isDesktopSharingEnabled()``` - returns true if desktop sharing is supported and false otherwise. NOTE: that method can be used after ```JitsiMeetJS.init(options)``` is completed otherwise the result will be always null.
* ```JitsiMeetJS.getGlobalOnErrorHandler()``` - returns function that can be used to be attached to window.onerror and if options.enableWindowOnErrorHandler is enabled returns the function used by the lib. (function(message, source, lineno, colno, error)).

* ```JitsiMeetJS.mediaDevices``` - JS object that contains methods for interaction with media devices. Following methods are available:
    - ```isDeviceListAvailable()``` - returns true if retrieving the device list is supported and false - otherwise
    - ```isDeviceChangeAvailable(deviceType)``` - returns true if changing the input (camera / microphone) or output (audio) device is supported and false if not. ```deviceType``` is a type of device to change. Undefined or 'input' stands for input devices, 'output' - for audio output devices.
    - ```enumerateDevices(callback)``` - returns list of the available devices as a parameter to the callback function. Every device is a MediaDeviceInfo object with the following properties:
        - label - the name of the device
        - kind - "audioinput", "videoinput" or "audiooutput"
        - deviceId - the id of the device
        - groupId - group identifier, two devices have the same group identifier if they belong to the same physical device; for example a monitor with both a built-in camera and microphone
    - ```setAudioOutputDevice(deviceId)``` - sets current audio output device. ```deviceId``` - id of 'audiooutput' device from ```JitsiMeetJS.enumerateDevices()```, '' is for default device.
    - ```getAudioOutputDevice()``` - returns currently used audio output device id, '' stands for default device.
    - ```isDevicePermissionGranted(type)``` - returns true if user granted permission to media devices. ```type``` - 'audio', 'video' or ```undefined```. In case of ```undefined``` will check if both audio and video permissions were granted.
    - ```addEventListener(event, handler)``` - attaches an event handler.
    - ```removeEventListener(event, handler)``` - removes an event handler.

* ```JitsiMeetJS.events``` - JS object that contains all events used by the API. You will need that JS object when you try to subscribe for connection or conference events.
    We have two event types - connection and conference. You can access the events with the following code ```JitsiMeetJS.events.<event_type>.<event_name>```.
    For example if you want to use the conference event that is fired when somebody leave conference you can use the following code - ```JitsiMeetJS.events.conference.USER_LEFT```.
    We support the following events:
    1. conference
        - TRACK_ADDED - stream received. (parameters - JitsiTrack)
        - TRACK_REMOVED - stream removed. (parameters - JitsiTrack)
        - TRACK_MUTE_CHANGED - JitsiTrack was muted or unmuted. (parameters - JitsiTrack)
        - DOMINANT_SPEAKER_CHANGED - the dominant speaker is changed. (parameters - id(string))
        - USER_JOINED - new user joined a conference. (parameters - id(string), user(JitsiParticipant))
        - USER_LEFT - a participant left conference. (parameters - id(string), user(JitsiParticipant))
        - MESSAGE_RECEIVED - new text message received. (parameters - id(string), text(string), ts(number))
        - DISPLAY_NAME_CHANGED - user has changed his display name. (parameters - id(string), displayName(string))
        - SUBJECT_CHANGED - notifies that subject of the conference has changed (parameters - subject(string))
        - LAST_N_ENDPOINTS_CHANGED - last n set was changed (parameters - leavingEndpointIds(array) ids of users leaving lastN, enteringEndpointIds(array) ids of users entering lastN)
        - CONFERENCE_JOINED - notifies the local user that he joined the conference successfully. (no parameters)
        - CONFERENCE_LEFT - notifies the local user that he left the conference successfully. (no parameters)
        - DTMF_SUPPORT_CHANGED - notifies if at least one user supports DTMF. (parameters - supports(boolean))
        - USER_ROLE_CHANGED - notifies that role of some user changed. (parameters - id(string), role(string))
        - USER_STATUS_CHANGED - notifies that status of some user changed. (parameters - id(string), status(string))
        - CONFERENCE_FAILED - notifies that user failed to join the conference. (parameters - errorCode(JitsiMeetJS.errors.conference))
        - CONFERENCE_ERROR - notifies that error occurred. (parameters - errorCode(JitsiMeetJS.errors.conference))
        - KICKED - notifies that user has been kicked from the conference.
        - START_MUTED_POLICY_CHANGED - notifies that all new participants will join with muted audio/video stream (parameters - JS object with 2 properties - audio(boolean), video(boolean))
        - STARTED_MUTED - notifies that the local user has started muted
        - AVAILABLE_DEVICES_CHANGED - notifies that available participant devices changed (camera or microphone was added or removed) (parameters - id(string), devices(JS object with 2 properties - audio(boolean), video(boolean)))
        - CONNECTION_STATS - New local connection statistics are received. (parameters - stats(object))
        - BEFORE_STATISTICS_DISPOSED - fired just before the statistics module is disposed and it's the last chance to submit some logs to the statistics service, before it gets disconnected
        - AUTH_STATUS_CHANGED - notifies that authentication is enabled or disabled, or local user authenticated (logged in). (parameters - isAuthEnabled(boolean), authIdentity(string))
        - ENDPOINT_MESSAGE_RECEIVED - notifies that a new message
        from another participant is received on a data channel.

    2. connection
        - CONNECTION_FAILED - indicates that the server connection failed.
        - CONNECTION_ESTABLISHED - indicates that we have successfully established server connection.
        - CONNECTION_DISCONNECTED - indicates that we are disconnected.
        - WRONG_STATE - indicates that the user has performed action that can't be executed because the connection is in wrong state.

    3. tracks
        - LOCAL_TRACK_STOPPED - indicates that a local track was stopped. This
        event can be fired when ```dispose()``` method is called or for other reasons.
        - TRACK_AUDIO_OUTPUT_CHANGED - indicates that audio output device for track was changed (parameters - deviceId (string) - new audio output device ID).

    4. mediaDevices
        - DEVICE_LIST_CHANGED - indicates that list of currently connected devices has changed (parameters - devices(MediaDeviceInfo[])).
        - PERMISSION_PROMPT_IS_SHOWN - Indicates that the environment is currently showing permission prompt to access camera and/or microphone (parameters - environmentType ('chrome'|'opera'|'firefox'|'iexplorer'|'safari'|'nwjs'|'react-native'|'android').


* ```JitsiMeetJS.errors``` - JS object that contains all errors used by the API. You can use that object to check the reported errors from the API
    We have three error types - connection, conference and track. You can access the events with the following code ```JitsiMeetJS.errors.<error_type>.<error_name>```.
    For example if you want to use the conference event that is fired when somebody leave conference you can use the following code - ```JitsiMeetJS.errors.conference.PASSWORD_REQUIRED```.
    We support the following errors:
    1. conference
        - CONNECTION_ERROR - the connection with the conference is lost.
        - SETUP_FAILED - conference setup failed
        - AUTHENTICATION_REQUIRED - user must be authenticated to create this conference
        - PASSWORD_REQUIRED - that error can be passed when the connection to the conference failed. You should try to join the conference with password.
        - PASSWORD_NOT_SUPPORTED - indicates that conference cannot be locked
        - VIDEOBRIDGE_NOT_AVAILABLE - video bridge issues.
        - RESERVATION_ERROR - error in reservation system
        - GRACEFUL_SHUTDOWN - graceful shutdown
        - JINGLE_FATAL_ERROR - error in jingle (the orriginal error is attached as parameter.)
        - CONFERENCE_DESTROYED - conference has been destroyed
        - CHAT_ERROR - chat error happened
        - FOCUS_DISCONNECTED - focus error happened
        - FOCUS_DISCONNECTED - focus left the conference
        - CONFERENCE_MAX_USERS - The maximum users limit has been reached
    2. connection
        - PASSWORD_REQUIRED - passed when the connection to the server failed. You should try to authenticate with password.
        - CONNECTION_ERROR - indicates connection failures.
        - OTHER_ERROR - all other errors
    3. track
        - GENERAL - generic getUserMedia-related error.
        - UNSUPPORTED_RESOLUTION - getUserMedia-related error, indicates that requested video resolution is not supported by camera.
        - PERMISSION_DENIED - getUserMedia-related error, indicates that user denied permission to share requested device.
        - NOT_FOUND - getUserMedia-related error, indicates that requested device was not found.
        - CONSTRAINT_FAILED - getUserMedia-related error, indicates that some of requested constraints in getUserMedia call were not satisfied.
        - TRACK_IS_DISPOSED - an error which indicates that track has been already disposed and cannot be longer used.
        - TRACK_NO_STREAM_FOUND - an error which indicates that track has no MediaStream associated.
        - TRACK_MUTE_UNMUTE_IN_PROGRESS - an error which indicates that track is currently in progress of muting or unmuting itself.
        - CHROME_EXTENSION_GENERIC_ERROR - generic error for jidesha extension for Chrome.
        - CHROME_EXTENSION_USER_CANCELED - an error which indicates that user canceled screen sharing window selection dialog in jidesha extension for Chrome.
        - CHROME_EXTENSION_INSTALLATION_ERROR - an error which indicates that the jidesha extension for Chrome is failed to install.
        - FIREFOX_EXTENSION_NEEDED - An error which indicates that the jidesha extension for Firefox is needed to proceed with screen sharing, and that it is not installed.

* ```JitsiMeetJS.errorTypes``` - constructors for Error instances that can be produced by library. Are useful for checks like ```error instanceof JitsiMeetJS.errorTypes.JitsiTrackError```. Following Errors are available:
    1. ```JitsiTrackError``` - Error that happened to a JitsiTrack.

* ```JitsiMeetJS.logLevels``` - object with the log levels:
    1. TRACE
    2. DEBUG
    3. INFO
    4. LOG
    5. WARN
    6. ERROR

JitsiConnection
------------
This objects represents the server connection. You can create new ```JitsiConnection``` object with the constructor ```JitsiMeetJS.JitsiConnection```. ```JitsiConnection``` has the following methods:


1. ```JitsiConnection(appID, token, options)``` - constructor. Creates the conference object.

    - appID - identification for the provider of Jitsi Meet video conferencing services. **NOTE: not implemented yet. You can safely pass ```null```**
    - token - secret generated by the provider of Jitsi Meet video conferencing services. The token will be send to the provider from the Jitsi Meet server deployment for authorization of the current client. **NOTE: not implemented yet. You can safely pass ```null```**
    - options - JS object with configuration options for the server connection. You can change the following properties there:
        1. bosh -
        2. hosts - JS Object
            - domain
            - muc
            - anonymousdomain
        3. useStunTurn -
        4. enableLipSync - (optional) boolean property which enables the lipsync feature. Currently works only in Chrome and is enabled by default.

2. connect(options) - establish server connection
    - options - JS Object with ```id``` and ```password``` properties.

3. disconnect() - destroys the server connection

4. initJitsiConference(name, options) - creates new ```JitsiConference``` object.
    - name - the name of the conference
    - options - JS object with configuration options for the conference. You can change the following properties there:
        1. openSctp - boolean property. Enables/disables datachannel support. **NOTE: we recommend to set that option to true**
        2. recordingType - the type of recording to be used
        3. jirecon
        4. callStatsID - callstats credentials
        5. callStatsSecret - callstats credentials
        6. enableTalkWhileMuted - boolean property. Enables/disables talk while muted detection, by default the value is false/disabled.
        **NOTE: if 4 and 5 are set the library is going to send events to callstats. Otherwise the callstats integration will be disabled.**

5. addEventListener(event, listener) - Subscribes the passed listener to the event.
    - event - one of the events from ```JitsiMeetJS.events.connection``` object.
    - listener - handler for the event.

6. removeEventListener(event, listener) - Removes event listener.
    - event - the event
    - listener - the listener that will be removed.

7. addFeature - Adds new feature to the list of supported features for the local participant
    - feature - string, the name of the feature
    - submit - boolean, default false, if true - the new list of features will be immediately submitted to the others.

8. removeFeature - Removes a feature from the list of supported features for the local participant
    - feature - string, the name of the feature
    - submit - boolean, default false, if true - the new list of features will be immediately submitted to the others.

JitsiConference
-----------
The object represents a conference. We have the following methods to control the conference:


1. join(password) - Joins the conference
    - password - string of the password. This parameter is not mandatory.

2. leave() - leaves the conference. Returns Promise.

4. getLocalTracks() - Returns array with JitsiTrack objects for the local streams.

5. addEventListener(event, listener) - Subscribes the passed listener to the event.
    - event - one of the events from ```JitsiMeetJS.events.conference``` object.
    - listener - handler for the event.

6. removeEventListener(event, listener) - Removes event listener.
    - event - the event
    - listener - the listener that will be removed.

7. on(event, listener) - alias for addEventListener

8. off(event, listener) - alias for removeEventListener

9. sendTextMessage(text) - sends the given string to other participants in the conference.

10. setDisplayName(name) - changes the display name of the local participant.
    - name - the new display name

11. selectParticipant(participantID) - Elects the participant with the given id to be the selected participant or the speaker. You should use that method if you are using simulcast.


12. sendCommand(name, values) - sends user defined system command to the other participants
    - name - the name of the command.
    - values - JS object. The object has the following structure:


        ```
            {


                value: the_value_of_the_command,


                attributes: {},// map with keys the name of the attribute and values - the values of the attributes.


                children: [] // array with JS object with the same structure.
            }
        ```


    NOTE: When you use that method the passed object will be added in every system message that is sent to the other participants. It might be sent more than once.


13. sendCommandOnce(name, values) - Sends only one time a user defined system command to the other participants


14. removeCommand(name) - removes a command for the list of the commands that are sent to the ther participants
    - name - the name of the command

15. addCommandListener(command, handler) - adds listener
    - command - string for the name of the command
    - handler(values) - the listener that will be called when a command is received from another participant.

16. removeCommandListener(command) - removes the listeners for the specified command
    - command - the name of the command

17. addTrack(track) - Adds JitsiLocalTrack object to the conference. Throws an error if adding second video stream. Returns Promise.
    - track - the JitsiLocalTrack

18. removeTrack(track) - Removes JitsiLocalTrack object to the conference. Returns Promise.
    - track - the JitsiLocalTrack

19. isDTMFSupported() - Check if at least one user supports DTMF.

20. getRole() - returns string with the local user role ("moderator" or "none")

21. isModerator() - checks if local user has "moderator" role

22. lock(password) - set password for the conference; returns Promise
    - password - string password

    Note: available only for moderator

23. unlock() - unset conference password; returns Promise

    Note: available only for moderator

24. kick(id) - Kick participant from the conference
    - id - string participant id

25. setStartMutedPolicy(policy) - make all new participants join with muted audio/video
    - policy - JS object with following properties
        - audio - boolean if audio stream should be muted
        - video - boolean if video stream should be muted

    Note: available only for moderator

26. getStartMutedPolicy() - returns the current policy with JS object:
    - policy - JS object with following properties
        - audio - boolean if audio stream should be muted
        - video - boolean if video stream should be muted

27. isStartAudioMuted() - check if audio is muted on join

28. isStartVideoMuted() - check if video is muted on join

29. sendFeedback(overallFeedback, detailedFeedback) - Sends the given feedback through CallStats if enabled.
    - overallFeedback an integer between 1 and 5 indicating the user feedback
    - detailedFeedback detailed feedback from the user. Not yet used

30. setSubject(subject) - change subject of the conference
    - subject - string new subject

    Note: available only for moderator

31. sendEndpointMessage(to, payload) - Sends message via the data channels.
    - to - the id of the endpoint that should receive the message. If "" the message will be sent to all participants.
    - payload - JSON object - the payload of the message.

Throws NetworkError or InvalidStateError or Error if the operation fails.

32. broadcastEndpointMessage(payload) - Sends broadcast message via the datachannels.
    - payload - JSON object - the payload of the message.

Throws NetworkError or InvalidStateError or Error if the operation fails.

33. selectParticipant(participantId) - Elects the participant with the given id to be the selected participant in order to receive higher video quality (if simulcast is enabled).
    - participantId - the identifier of the participant

Throws NetworkError or InvalidStateError or Error if the operation fails.

34. pinParticipant(participantId) - Elects the participant with the given id to be the pinned participant in order to always receive video for this participant (even when last n is enabled).
    - participantId - the identifier of the participant

Throws NetworkError or InvalidStateError or Error if the operation fails.

JitsiTrack
======
The object represents single track - video or audio. They can be remote tracks ( from the other participants in the call) or local tracks (from the devices of the local participant).
We have the following methods for controling the tracks:

1. getType() - returns string with the type of the track( "video" for the video tracks and "audio" for the audio tracks)


2. mute() - mutes the track. Returns Promise.

   Note: This method is implemented only for the local tracks.

3. unmute() - unmutes the track. Returns Promise.

   Note: This method is implemented only for the local tracks.

4. isMuted() - check if track is muted

5. attach(container) - attaches the track to the given container.

6. detach(container) - removes the track from the container.

7. dispose() - disposes the track. If the track is added to a conference the track will be removed. Returns Promise.

   Note: This method is implemented only for the local tracks.

8. getId() - returns unique string for the track.

9. getParticipantId() - returns id(string) of the track owner

   Note: This method is implemented only for the remote tracks.

10. setAudioOutput(audioOutputDeviceId) - sets new audio output device for track's DOM elements. Video tracks are ignored.

11. getDeviceId() - returns device ID associated with track (for local tracks only)

12. isEnded() - returns true if track is ended

JitsiTrackError
======
The object represents error that happened to a JitsiTrack. Is inherited from JavaScript base ```Error``` object,
so ```"name"```, ```"message"``` and ```"stack"``` properties are available. For GUM-related errors,
exposes additional ```"gum"``` property, which is an object with following properties:
 - error - original GUM error
 - constraints - GUM constraints object used for the call
 - devices - array of devices requested in GUM call (possible values - "audio", "video", "screen", "desktop", "audiooutput")

Getting Started
==============

1. The first thing you must do in order to use Jitsi Meet API is to initialize ```JitsiMeetJS``` object:

```javascript
JitsiMeetJS.init();
```

2. Then you must create the connection object:


```javascript
var connection = new JitsiMeetJS.JitsiConnection(null, null, options);
```


3. Now we can attach some listeners to the connection object and establish the server connection:

```javascript
connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnectionSuccess);
connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onConnectionFailed);
connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED, disconnect);

connection.connect();
```

4. After you receive the ```CONNECTION_ESTABLISHED``` event you are to create the ```JitsiConference``` object and
also you may want to attach listeners for conference events (we are going to add handlers for remote track, conference joined, etc. ):


```javascript

room = connection.initJitsiConference("conference1", confOptions);
room.on(JitsiMeetJS.events.conference.TRACK_ADDED, onRemoteTrack);
room.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, onConferenceJoined);
```

5. You also may want to get your local tracks from the camera and microphone:
```javascript
JitsiMeetJS.createLocalTracks().then(onLocalTracks);
```

NOTE: Adding listeners and creating local streams are not mandatory steps.

6. Then you are ready to create / join a conference :

```javascript
room.join();
```

After that step you are in the conference. Now you can continue with adding some code that will handle the events and manage the conference.
