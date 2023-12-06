import { EventEmitter } from 'events';

/**
 * The class implements basic event operations - add/remove listener.
 * NOTE: The purpose of the class is to be extended in order to add
 * this functionality to other classes.
 */
export default class Listenable extends EventEmitter {
    /**
     * Creates new instance.
     * @constructor
     */
    constructor() {
        super();

        // aliases for addListener/removeListener
        this.addEventListener = this.addListener;
        this.removeEventListener = this.removeListener;
    }

    /**
     * Adds new cancellable listener.
     * @param {String} eventName the name of the event
     * @param {Function} listener the listener.
     * @returns {Function} - The unsubscribe function.
     */
    addCancellableListener(eventName, listener) {
        this.addEventListener(eventName, listener);

        return () => this.removeEventListener(eventName, listener);
    }
}
