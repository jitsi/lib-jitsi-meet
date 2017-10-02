const AudioRecorder = require('./audioRecorder');
const SphinxService = require(
    './transcriptionServices/SphinxTranscriptionService');

const BEFORE_STATE = 'before';
const RECORDING_STATE = 'recording';
const TRANSCRIBING_STATE = 'transcribing';
const FINISHED_STATE = 'finished';

// the amount of characters each line in the transcription will have
const MAXIMUM_SENTENCE_LENGTH = 80;

/**
 * This is the main object for handing the Transcription. It interacts with
 * the audioRecorder to record every person in a conference and sends the
 * recorder audio to a transcriptionService. The returned speech-to-text result
 * will be merged to create a transcript
 * @param {AudioRecorder} audioRecorder An audioRecorder recording a conference
 */
function Transcriber() {
    // the object which can record all audio in the conference
    this.audioRecorder = new AudioRecorder();

    // this object can send the recorder audio to a speech-to-text service
    this.transcriptionService = new SphinxService();

    // holds a counter to keep track if merging can start
    this.counter = null;

    // holds the date when transcription started which makes it possible
    // to calculate the offset between recordings
    this.startTime = null;

    // will hold the transcription once it is completed
    this.transcription = null;

    // this will be a method which will be called once the transcription is done
    // with the transcription as parameter
    this.callback = null;

    // stores all the retrieved speech-to-text results to merge together
    // this value will store an Array<Word> object
    this.results = [];

    // Stores the current state of the transcription process
    this.state = BEFORE_STATE;

    // Used in the updateTranscription method to add a new line when the
    // sentence becomes to long
    this.lineLength = 0;
}

/**
 * Method to start the transcription process. It will tell the audioRecorder
 * to start storing all audio streams and record the start time for merging
 * purposes
 */
Transcriber.prototype.start = function start() {
    if (this.state !== BEFORE_STATE) {
        throw new Error(
            `The transcription can only start when it's in the "${
                BEFORE_STATE}" state. It's currently in the "${
                this.state}" state`);
    }
    this.state = RECORDING_STATE;
    this.audioRecorder.start();
    this.startTime = new Date();
};

/**
 * Method to stop the transcription process. It will tell the audioRecorder to
 * stop, and get all the recorded audio to send it to the transcription service

 * @param callback a callback which will receive the transcription
 */
Transcriber.prototype.stop = function stop(callback) {
    if (this.state !== RECORDING_STATE) {
        throw new Error(
            `The transcription can only stop when it's in the "${
                RECORDING_STATE}" state. It's currently in the "${
                this.state}" state`);
    }

    // stop the recording
    console.log('stopping recording and sending audio files');
    this.audioRecorder.stop();

    // and send all recorded audio the the transcription service
    const callBack = blobCallBack.bind(null, this);

    this.audioRecorder.getRecordingResults().forEach(recordingResult => {
        this.transcriptionService.send(recordingResult, callBack);
        this.counter++;
    });

    // set the state to "transcribing" so that maybeMerge() functions correctly
    this.state = TRANSCRIBING_STATE;

    // and store the callback for later
    this.callback = callback;
};

/**
 * This method gets the answer from the transcription service, calculates the
 * offset and adds is to every Word object. It will also start the merging
 * when every send request has been received
 *
 * note: Make sure to bind this as a Transcription object
 * @param {Transcriber} transcriber the transcriber instance
 * @param {RecordingResult} answer a RecordingResult object with a defined
 * WordArray
 */
function blobCallBack(transcriber, answer) {
    console.log(
        'retrieved an answer from the transcription service. The answer has an'
            + ` array of length: ${answer.wordArray.length}`);

    // first add the offset between the start of the transcription and
    // the start of the recording to all start and end times
    if (answer.wordArray.length > 0) {
        let offset = answer.startTime.getUTCMilliseconds()
            - transcriber.startTime.getUTCMilliseconds();

        // transcriber time will always be earlier

        if (offset < 0) {
            offset = 0; // presume 0 if it somehow not earlier
        }

        let array = '[';

        answer.wordArray.forEach(wordObject => {
            wordObject.begin += offset;
            wordObject.end += offset;
            array += `${wordObject.word},`;
        });
        array += ']';
        console.log(array);

        // give a name value to the Array object so that the merging can access
        // the name value without having to use the whole recordingResult object
        // in the algorithm
        answer.wordArray.name = answer.name;
    }

    // then store the array and decrease the counter
    transcriber.results.push(answer.wordArray);
    transcriber.counter--;
    console.log(`current counter: ${transcriber.counter}`);

    // and check if all results have been received.
    transcriber.maybeMerge();
}

/**
 * this method will check if the counter is zero. If it is, it will call
 * the merging method
 */
Transcriber.prototype.maybeMerge = function() {
    if (this.state === TRANSCRIBING_STATE && this.counter === 0) {
        // make sure to include the events in the result arrays before
        // merging starts
        this.merge();
    }
};

/**
 * This method will merge all speech-to-text arrays together in one
 * readable transcription string
 */
Transcriber.prototype.merge = function() {
    console.log(
        `starting merge process!\n The length of the array: ${
            this.results.length}`);
    this.transcription = '';

    // the merging algorithm will look over all Word objects who are at pos 0 in
    // every array. It will then select the one closest in time to the
    // previously placed word, while removing the selected word from its array
    // note: words can be skipped the skipped word's begin and end time somehow
    // end up between the closest word start and end time
    const arrays = this.results;

    // arrays of Word objects
    const potentialWords = []; // array of the first Word objects
    // check if any arrays are already empty and remove them

    hasPopulatedArrays(arrays);

    // populate all the potential Words for a first time
    arrays.forEach(array => pushWordToSortedArray(potentialWords, array));

    // keep adding words to transcription until all arrays are exhausted
    while (hasPopulatedArrays(arrays)) {
        // first select the lowest array;
        let lowestWordArray = arrays[0];

        arrays.forEach(wordArray => {
            if (wordArray[0].begin < lowestWordArray[0].begin) {
                lowestWordArray = wordArray;
            }
        });

        // put the word in the transcription
        let wordToAdd = lowestWordArray.shift();

        this.updateTranscription(wordToAdd, lowestWordArray.name);

        // keep going until a word in another array has a smaller time
        // or the array is empty
        while (lowestWordArray.length > 0) {
            let foundSmaller = false;
            const wordToCompare = lowestWordArray[0].begin;

            arrays.forEach(wordArray => {
                if (wordArray[0].begin < wordToCompare) {
                    foundSmaller = true;
                }
            });

            // add next word if no smaller time has been found
            if (foundSmaller) {
                break;
            }

            wordToAdd = lowestWordArray.shift();
            this.updateTranscription(wordToAdd, null);
        }

    }

    // set the state to finished and do the necessary left-over tasks
    this.state = FINISHED_STATE;
    if (this.callback) {
        this.callback(this.transcription);
    }
};

/**
 * Appends a word object to the transcription. It will make a new line with a
 * name if a name is specified
 * @param {Word} word the Word object holding the word to append
 * @param {String|null} name the name of a new speaker. Null if not applicable
 */
Transcriber.prototype.updateTranscription = function(word, name) {
    if (name !== undefined && name !== null) {
        this.transcription += `\n${name}:`;
        this.lineLength = name.length + 1; // +1 for the semi-colon
    }
    if (this.lineLength + word.word.length > MAXIMUM_SENTENCE_LENGTH) {
        this.transcription += '\n    ';
        this.lineLength = 4; // because of the 4 spaces after the new line
    }
    this.transcription += ` ${word.word}`;
    this.lineLength += word.word.length + 1; // +1 for the space
};

/**
 * Check if the given 2 dimensional array has any non-zero Word-arrays in them.
 * All zero-element arrays inside will be removed
 * If any non-zero-element arrays are found, the method will return true.
 * otherwise it will return false
 * @param {Array<Array>} twoDimensionalArray the array to check
 * @returns {boolean} true if any non-zero arrays inside, otherwise false
 */
function hasPopulatedArrays(twoDimensionalArray) {
    for (let i = 0; i < twoDimensionalArray.length; i++) {
        if (twoDimensionalArray[i].length === 0) {
            twoDimensionalArray.splice(i, 1);
        }
    }

    return twoDimensionalArray.length > 0;
}

/**
 * Push a word to the right location in a sorted array. The array is sorted
 * from lowest to highest start time. Every word is stored in an object which
 * includes the name of the person saying the word.
 *
 * @param {Array<Word>} array the sorted array to push to
 * @param {Word} word the word to push into the array
 */
function pushWordToSortedArray(array, word) {
    if (array.length === 0) {
        array.push(word);
    } else {
        if (array[array.length - 1].begin <= word.begin) {
            array.push(word);

            return;
        }

        for (let i = 0; i < array.length; i++) {
            if (word.begin < array[i].begin) {
                array.splice(i, 0, word);

                return;
            }
        }
        array.push(word); // fail safe
    }
}

/**
 * Gives the transcriber a JitsiTrack holding an audioStream to transcribe.
 * The JitsiTrack is given to the audioRecorder. If it doesn't hold an
 * audiostream, it will not be added by the audioRecorder
 * @param {JitsiTrack} track the track to give to the audioRecorder
 */
Transcriber.prototype.addTrack = function(track) {
    this.audioRecorder.addTrack(track);
};

/**
 * Remove the given track from the auioRecorder
 * @param track
 */
Transcriber.prototype.removeTrack = function(track) {
    this.audioRecorder.removeTrack(track);
};

/**
 * Will return the created transcription if it's avialable or throw an error
 * when it's not done yet
 * @returns {String} the transcription as a String
 */
Transcriber.prototype.getTranscription = function() {
    if (this.state !== FINISHED_STATE) {
        throw new Error(
            `The transcription can only be retrieved when it's in the "${
                FINISHED_STATE}" state. It's currently in the "${
                this.state}" state`);
    }

    return this.transcription;
};

/**
 * Returns the current state of the transcription process
 */
Transcriber.prototype.getState = function() {
    return this.state;
};

/**
 * Resets the state to the "before" state, such that it's again possible to
 * call the start method
 */
Transcriber.prototype.reset = function() {
    this.state = BEFORE_STATE;
    this.counter = null;
    this.transcription = null;
    this.startTime = null;
    this.callback = null;
    this.results = [];
    this.lineLength = 0;
};

module.exports = Transcriber;
