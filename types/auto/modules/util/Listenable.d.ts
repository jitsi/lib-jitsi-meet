/// <reference types="node" />
/**
 * The class implements basic event operations - add/remove listener.
 * NOTE: The purpose of the class is to be extended in order to add
 * this functionality to other classes.
 */
export default class Listenable {
    /**
     * Creates new instance.
     * @param {EventEmitter} eventEmitter
     * @constructor
     */
    constructor(eventEmitter?: EventEmitter);
    eventEmitter: EventEmitter;
    addEventListener: (eventName: string, listener: Function) => Function;
    on: (eventName: string, listener: Function) => Function;
    removeEventListener: (eventName: string, listener: Function) => void;
    off: (eventName: string, listener: Function) => void;
    /**
     * Adds new listener.
     * @param {String} eventName the name of the event
     * @param {Function} listener the listener.
     * @returns {Function} - The unsubscribe function.
     */
    addListener(eventName: string, listener: Function): Function;
    /**
     * Removes listener.
     * @param {String} eventName the name of the event that triggers the
     * listener
     * @param {Function} listener the listener.
     */
    removeListener(eventName: string, listener: Function): void;
}
import EventEmitter from "events";
