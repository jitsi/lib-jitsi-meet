import RecordingResult from './recordingResult';
import TrackRecorder from './trackRecorder';

/**
 * Possible audio formats MIME types
 */
const AUDIO_WEBM = 'audio/webm'; // Supported in chrome
const AUDIO_OGG = 'audio/ogg'; // Supported in firefox

/**
 * Starts the recording of a JitsiTrack in a TrackRecorder object.
 * This will also define the timestamp and try to update the name
 * @param trackRecorder the TrackRecorder to start
 */
function startRecorder(trackRecorder) {
    if (trackRecorder.recorder === undefined) {
        throw new Error('Passed an object to startRecorder which is not a '
            + 'TrackRecorder object');
    }
    trackRecorder.recorder.start();
    trackRecorder.startTime = new Date();
}

/**
 * Stops the recording of a JitsiTrack in a TrackRecorder object.
 * This will also try to update the name
 * @param trackRecorder the TrackRecorder to stop
 */
function stopRecorder(trackRecorder) {
    if (trackRecorder.recorder === undefined) {
        throw new Error('Passed an object to stopRecorder which is not a '
            + 'TrackRecorder object');
    }
    trackRecorder.recorder.stop();
}

/**
 * Determines which kind of audio recording the browser supports
 * chrome supports "audio/webm" and firefox supports "audio/ogg"
 */
function determineCorrectFileType() {
    if (MediaRecorder.isTypeSupported(AUDIO_WEBM)) {
        return AUDIO_WEBM;
    } else if (MediaRecorder.isTypeSupported(AUDIO_OGG)) {
        return AUDIO_OGG;
    }
    throw new Error(
        'unable to create a MediaRecorder with the right mimetype!');
}

/**
 * main exported object of the file, holding all
 * relevant functions and variables for the outside world
 * @param jitsiConference the jitsiConference which this object
 * is going to record
 */
function AudioRecorder(jitsiConference) {
    // array of TrackRecorders, where each trackRecorder
    // holds the JitsiTrack, MediaRecorder and recorder data
    this.recorders = [];

    // get which file type is supported by the current browser
    this.fileType = determineCorrectFileType();

    // boolean flag for active recording
    this.isRecording = false;

    // the jitsiconference the object is recording
    this.jitsiConference = jitsiConference;
}

/**
 * Add the exported module so that it can be accessed by other files
 */
AudioRecorder.determineCorrectFileType = determineCorrectFileType;

/**
 * Adds a new TrackRecorder object to the array.
 *
 * @param track the track potentially holding an audio stream
 */
AudioRecorder.prototype.addTrack = function(track) {
    if (track.isAudioTrack()) {
        // create the track recorder
        const trackRecorder = this.instantiateTrackRecorder(track);

        // push it to the local array of all recorders

        this.recorders.push(trackRecorder);

        // update the name of the trackRecorders
        this.updateNames();

        // If we're already recording, immediately start recording this new
        // track.
        if (this.isRecording) {
            startRecorder(trackRecorder);
        }
    }
};

/**
 * Creates a TrackRecorder object. Also creates the MediaRecorder and
 * data array for the trackRecorder.
 * @param track the JitsiTrack holding the audio MediaStream(s)
 */
AudioRecorder.prototype.instantiateTrackRecorder = function(track) {
    const trackRecorder = new TrackRecorder(track);

    // Create a new stream which only holds the audio track
    const originalStream = trackRecorder.track.getOriginalStream();
    const stream = new MediaStream();

    originalStream.getAudioTracks().forEach(t => stream.addTrack(t));

    // Create the MediaRecorder
    trackRecorder.recorder = new MediaRecorder(stream,
        { mimeType: this.fileType });

    // array for holding the recorder data. Resets it when
    // audio already has been recorder once
    trackRecorder.data = [];

    // function handling a dataEvent, e.g the stream gets new data
    trackRecorder.recorder.ondataavailable = function(dataEvent) {
        if (dataEvent.data.size > 0) {
            trackRecorder.data.push(dataEvent.data);
        }
    };

    return trackRecorder;
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
AudioRecorder.prototype.removeTrack = function(track) {
    if (track.isVideoTrack()) {
        return;
    }

    const array = this.recorders;
    let i;

    for (i = 0; i < array.length; i++) {
        if (array[i].track.getParticipantId() === track.getParticipantId()) {
            const recorderToRemove = array[i];

            if (this.isRecording) {
                stopRecorder(recorderToRemove);
            } else {
                // remove the TrackRecorder from the array
                array.splice(i, 1);
            }
        }
    }

    // make sure the names are up to date
    this.updateNames();
};

/**
 * Tries to update the name value of all TrackRecorder in the array.
 * If it hasn't changed,it will keep the exiting name. If it changes to a
 * undefined value, the old value will also be kept.
 */
AudioRecorder.prototype.updateNames = function() {
    const conference = this.jitsiConference;

    this.recorders.forEach(trackRecorder => {
        if (trackRecorder.track.isLocal()) {
            trackRecorder.name = 'the transcriber';
        } else {
            const id = trackRecorder.track.getParticipantId();
            const participant = conference.getParticipantById(id);
            const newName = participant.getDisplayName();

            if (newName !== 'undefined') {
                trackRecorder.name = newName;
            }
        }
    });
};

/**
 * Starts the audio recording of every local and remote track
 */
AudioRecorder.prototype.start = function() {
    if (this.isRecording) {
        throw new Error('audiorecorder is already recording');
    }

    // set boolean isRecording flag to true so if new participants join the
    // conference, that track can instantly start recording as well
    this.isRecording = true;

    // start all the mediaRecorders
    this.recorders.forEach(trackRecorder => startRecorder(trackRecorder));

    // log that recording has started
    console.log(
        `Started the recording of the audio. There are currently ${
            this.recorders.length} recorders active.`);
};

/**
 * Stops the audio recording of every local and remote track
 */
AudioRecorder.prototype.stop = function() {
    // set the boolean flag to false
    this.isRecording = false;

    // stop all recorders
    this.recorders.forEach(trackRecorder => stopRecorder(trackRecorder));
    console.log('stopped recording');
};

/**
 * link hacking to download all recorded audio streams
 */
AudioRecorder.prototype.download = function() {
    this.recorders.forEach(trackRecorder => {
        const blob = new Blob(trackRecorder.data, { type: this.fileType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = `test.${this.fileType.split('/')[1]}`;
        a.click();
        window.URL.revokeObjectURL(url);
    });
};

/**
 * returns the audio files of all recorders as an array of objects,
 * which include the name of the owner of the track and the starting time stamp
 * @returns {Array} an array of RecordingResult objects
 */
AudioRecorder.prototype.getRecordingResults = function() {
    if (this.isRecording) {
        throw new Error(
            'cannot get blobs because the AudioRecorder is still recording!');
    }

    // make sure the names are up to date before sending them off
    this.updateNames();

    const array = [];

    this.recorders.forEach(
        recorder =>
            array.push(
                new RecordingResult(
                    new Blob(recorder.data, { type: this.fileType }),
                    recorder.name,
                    recorder.startTime)));

    return array;
};

/**
 * Gets the mime type of the recorder audio
 * @returns {String} the mime type of the recorder audio
 */
AudioRecorder.prototype.getFileType = function() {
    return this.fileType;
};

/**
 * export the main object AudioRecorder
 */
export default AudioRecorder;
