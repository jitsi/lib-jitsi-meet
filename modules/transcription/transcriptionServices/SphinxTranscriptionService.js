/* global config */

import Word from '../word';

import audioRecorder from './../audioRecorder';
import AbstractTranscriptionService from './AbstractTranscriptionService';

/**
 * Implements a TranscriptionService for a Sphinx4 http server
 */
export default class SphinxService extends AbstractTranscriptionService {
    /**
     * Implements a TranscriptionService for a Sphinx4 http server
     */
    constructor() {
        super();

        // set the correct url
        this.url = getURL();
    }

    /**
     * Overrides the sendRequest method from AbstractTranscriptionService
     * it will send the audio stream the a Sphinx4 server to get the transcription
     *
     * @param audioFileBlob the recorder audio stream an a single Blob
     * @param callback the callback function retrieving the server response
     */
    sendRequest(audioFileBlob, callback) {
        console.log(`sending an audio file  to ${this.url}`);
        console.log(`the audio file being sent: ${audioFileBlob}`);
        const request = new XMLHttpRequest();

        request.onreadystatechange = function() {
            if (request.readyState === XMLHttpRequest.DONE
                && request.status === 200) {
                callback(request.responseText);
            } else if (request.readyState === XMLHttpRequest.DONE) {
                throw new Error(
                    `unable to accept response from sphinx server. status: ${request.status}`);
            }

            // if not ready no point to throw an error
        };
        request.open('POST', this.url);
        request.setRequestHeader('Content-Type',
            audioRecorder.determineCorrectFileType());
        request.send(audioFileBlob);
        console.log(`send ${audioFileBlob}`);
    }

    /**
     * Overrides the formatResponse method from AbstractTranscriptionService
     * It will parse the answer from the server in the expected format
     *
     * @param response the JSON body retrieved from the Sphinx4 server
     */
    formatResponse(response) {
        const result = JSON.parse(response).objects;

        // make sure to delete the session id object, which is always
        // the first value in the JSON array
        result.shift();
        const array = [];

        result.forEach(
            word => word.filler
                || array.push(new Word(word.word, word.start, word.end)));

        return array;
    }

    /**
     * checks wether the reply is empty, or doesn't contain a correct JSON object
     * @param response the server response
     * @return {boolean} whether the response is valid
     */
    verify(response) {
        console.log(`response from server:${response.toString()}`);

        // test if server responded with a string object
        if (typeof response !== 'string') {
            return false;
        }

        // test if the string can be parsed into valid JSON
        let json;

        try {
            json = JSON.parse(response);
        } catch (error) {
            console.log(error);

            return false;
        }

        // check if the JSON has a "objects" value
        if (json.objects === undefined) {
            return false;
        }

        // get the "objects" value and check for a session ID
        const array = json.objects;

        if (!(array[0] && array[0]['session-id'])) {
            return false;
        }

        // everything seems to be in order
        return true;
    }
}

/**
 * Gets the URL to the Sphinx4 server from the config file. If it's not there,
 * it will throw an error
 *
 * @returns {string} the URL to the sphinx4 server
 */
function getURL() {
    const message = 'config does not contain an url to a Sphinx4 https server';

    if (config.sphinxURL === undefined) {
        console.log(message);
    } else {
        const toReturn = config.sphinxURL;

        if (toReturn.includes !== undefined && toReturn.includes('https://')) {
            return toReturn;
        }
        console.log(message);

    }
}
