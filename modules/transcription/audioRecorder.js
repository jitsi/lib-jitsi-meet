/* global MediaRecorder, MediaStream, webkitMediaStream */

var RecordingResult = require("./recordingResult");

/**
 * Possible audio formats MIME types
 */
var AUDIO_WEBM = "audio/webm";    // Supported in chrome
var AUDIO_OGG  = "audio/ogg";     // Supported in firefox

/**
 * A TrackRecorder object holds all the information needed for recording a
 * single JitsiTrack (either remote or local)
 * @param track The JitsiTrack the object is going to hold
 */
var TrackRecorder = function(track){
    // The JitsiTrack holding the stream
    this.track = track;
    // The MediaRecorder recording the stream
    this.recorder = null;
    // The array of data chunks recorded from the stream
    // acts as a buffer until the data is stored on disk
    this.data = null;
    //the name of the person of the JitsiTrack. This can be undefined and/or
    //not unique
    this.name = null;
    //the time of the start of the recording
    this.startTime = null;
};

/**
 * Starts the recording of a JitsiTrack in a TrackRecorder object.
 * This will also define the timestamp and try to update the name
 * @param trackRecorder the TrackRecorder to start
 */
function startRecorder(trackRecorder) {
    if(trackRecorder.recorder === undefined) {
        throw new Error("Passed an object to startRecorder which is not a " +
            "TrackRecorder object");
    }
    trackRecorder.recorder.start();
    trackRecorder.startTime = new Date();
}

/**
 * Stops the recording of a JitsiTrack in a TrackRecorder object.
 * This will also try to update the name
 * @param trackRecorder the TrackRecorder to stop
 */
function stopRecorder(trackRecorder){
    if(trackRecorder.recorder === undefined) {
        throw new Error("Passed an object to stopRecorder which is not a " +
            "TrackRecorder object");
    }
    trackRecorder.recorder.stop();
}

/**
 * Creates a TrackRecorder object. Also creates the MediaRecorder and
 * data array for the trackRecorder.
 * @param track the JitsiTrack holding the audio MediaStream(s)
 */
function instantiateTrackRecorder(track) {
    var trackRecorder = new TrackRecorder(track);
    // Create a new stream which only holds the audio track
    var originalStream = trackRecorder.track.getOriginalStream();
    var stream = createEmptyStream();
    originalStream.getAudioTracks().forEach(function(track){
        stream.addTrack(track);
    });
    // Create the MediaRecorder
    trackRecorder.recorder = new MediaRecorder(stream,
        {mimeType: audioRecorder.fileType});
    //array for holding the recorder data. Resets it when
    //audio already has been recorder once
    trackRecorder.data = [];
    // function handling a dataEvent, e.g the stream gets new data
    trackRecorder.recorder.ondataavailable = function (dataEvent) {
        if(dataEvent.data.size > 0) {
            trackRecorder.data.push(dataEvent.data);
        }
    };

    return trackRecorder;
}

/**
 * Determines which kind of audio recording the browser supports
 * chrome supports "audio/webm" and firefox supports "audio/ogg"
 */
function determineCorrectFileType() {
    if(MediaRecorder.isTypeSupported(AUDIO_WEBM)) {
        return AUDIO_WEBM;
    }
    else if(MediaRecorder.isTypeSupported(AUDIO_OGG)) {
        return AUDIO_OGG;
    }
    else {
        throw new Error("unable to create a MediaRecorder with the" +
            "right mimetype!");
    }
}

/**
 * main exported object of the file, holding all
 * relevant functions and variables for the outside world
 * @param jitsiConference the jitsiConference which this object
 * is going to record
 */
var audioRecorder = function(jitsiConference){
    // array of TrackRecorders, where each trackRecorder
    // holds the JitsiTrack, MediaRecorder and recorder data
    this.recorders = [];

    //get which file type is supported by the current browser
    this.fileType = determineCorrectFileType();

    //boolean flag for active recording
    this.isRecording = false;

    //the jitsiconference the object is recording
    this.jitsiConference = jitsiConference;
};

/**
 * Add the the exported module so that it can be accessed by other files
 */
audioRecorder.determineCorrectFileType = determineCorrectFileType;

/**
 * Adds a new TrackRecorder object to the array.
 *
 * @param track the track potentially holding an audio stream
 */
audioRecorder.prototype.addTrack = function (track) {
    if(track.isAudioTrack()) {
        //create the track recorder
        var trackRecorder = instantiateTrackRecorder(track);
        //push it to the local array of all recorders
        this.recorders.push(trackRecorder);
        //update the name of the trackRecorders
        this.updateNames();
        //if we're already recording, immediately start recording this new track
        if(this.isRecording){
            startRecorder(trackRecorder);
        }
    }
};

/**
 * Notifies the module that a specific track has stopped, e.g participant left
 * the conference.
 * if the recording has not started yet, the TrackRecorder will be removed from
 * the array. If the recording has started, the recorder will stop recording
 * but not removed from the array so that the recorded stream can still be
 * accessed
 *
 * @param {JitsiTrack} track the JitsiTrack to remove from the recording session
 */
audioRecorder.prototype.removeTrack = function(track){
    if(track.isVideoTrack()){
        return;
    }
    
    var array = this.recorders;
    var i;
    for(i = 0; i < array.length; i++) {
        if(array[i].track.getParticipantId() === track.getParticipantId()){
            var recorderToRemove = array[i];
            if(this.isRecording){
                stopRecorder(recorderToRemove);
            }
            else {
                //remove the TrackRecorder from the array
                array.splice(i, 1);
            }
        }
    }

    //make sure the names are up to date
    this.updateNames();
};

/**
 * Tries to update the name value of all TrackRecorder in the array.
 * If it hasn't changed,it will keep the exiting name. If it changes to a
 * undefined value, the old value will also be kept.
 */
audioRecorder.prototype.updateNames = function(){
    var conference = this.jitsiConference;
    this.recorders.forEach(function(trackRecorder){
        if(trackRecorder.track.isLocal()){
            trackRecorder.name = "the transcriber";
        }
        else {
            var id = trackRecorder.track.getParticipantId();
            var participant = conference.getParticipantById(id);
            var newName = participant.getDisplayName();
            if(newName !== 'undefined') {
                trackRecorder.name = newName;
            }
        }
    });
};

/**
 * Starts the audio recording of every local and remote track
 */
audioRecorder.prototype.start = function () {
    if(this.isRecording) {
        throw new Error("audiorecorder is already recording");
    }
    // set boolean isRecording flag to true so if new participants join the
    // conference, that track can instantly start recording as well
    this.isRecording = true;
    //start all the mediaRecorders
    this.recorders.forEach(function(trackRecorder){
        startRecorder(trackRecorder);
    });
    //log that recording has started
    console.log("Started the recording of the audio. There are currently " +
        this.recorders.length + " recorders active.");
};

/**
 * Stops the audio recording of every local and remote track
 */
audioRecorder.prototype.stop = function() {
    //set the boolean flag to false
    this.isRecording = false;
    //stop all recorders
    this.recorders.forEach(function(trackRecorder){
       stopRecorder(trackRecorder);
    });
    console.log("stopped recording");
};

/**
 * link hacking to download all recorded audio streams
 */
audioRecorder.prototype.download = function () {
    var t = this;
    this.recorders.forEach(function (trackRecorder) {
        var blob = new Blob(trackRecorder.data, {type: t.fileType});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        document.body.appendChild(a);
        a.style = "display: none";
        a.href = url;
        a.download = 'test.' + t.fileType.split("/")[1];
        a.click();
        window.URL.revokeObjectURL(url);
    });
};

/**
 * returns the audio files of all recorders as an array of objects,
 * which include the name of the owner of the track and the starting time stamp
 * @returns {Array} an array of RecordingResult objects
 */
audioRecorder.prototype.getRecordingResults = function () {
    if(this.isRecording) {
        throw new Error("cannot get blobs because the AudioRecorder is still" +
            "recording!");
    }
    //make sure the names are up to date before sending them off
    this.updateNames();

    var array = [];
    var t = this;
    this.recorders.forEach(function (recorder) {
        array.push(
            new RecordingResult(
            new Blob(recorder.data, {type: t.fileType}),
            recorder.name,
            recorder.startTime)
        );
    });
    return array;
};

/**
 * Gets the mime type of the recorder audio
 * @returns {String} the mime type of the recorder audio
 */
audioRecorder.prototype.getFileType = function () {
    return this.fileType;
};

/**
 * Creates a empty MediaStream object which can be used
 * to add MediaStreamTracks to
 * @returns MediaStream
 */
function createEmptyStream() {
    // Firefox supports the MediaStream object, Chrome webkitMediaStream
    if(typeof(MediaStream) !== 'undefined') {
        return new MediaStream();
    }
    else if(typeof(webkitMediaStream) !== 'undefined') {
        return new webkitMediaStream(); // eslint-disable-line new-cap
    }
    else {
        throw new Error("cannot create a clean mediaStream");
    }
}

/**
 * export the main object audioRecorder
 */
module.exports = audioRecorder;
