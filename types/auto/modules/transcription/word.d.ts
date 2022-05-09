/**
 * An object representing a transcribed word, with some additional information
 * @param word the word
 * @param begin the time the word was started being uttered
 * @param end the time the word stopped being uttered
 */
export default class Word {
    /**
     * @param word the word
     * @param begin the time the word was started being uttered
     * @param end the time the word stopped being uttered
     */
    constructor(word: any, begin: any, end: any);
    word: any;
    begin: any;
    end: any;
    /**
     * Get the string representation of the word
     * @returns {*} the word as a string
     */
    getWord(): any;
    /**
     * Get the time the word started being uttered
     * @returns {*} the start time as an integer
     */
    getBeginTime(): any;
    /**
     * Get the time the word stopped being uttered
     * @returns {*} the end time as an integer
     */
    getEndTime(): any;
}
