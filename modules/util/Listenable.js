import EventEmitter from './EventEmitter';

/**
 * The class implements basic event operations - add/remove listener.
 * NOTE: The purpose of the class is to be extended in order to add
 * this functionality to other classes.
 */
export default class Listenable {
    /**
     * Creates new instance.
     * @constructor
     */
    constructor() {
        this.eventEmitter = new EventEmitter();

        // aliases for addListener/removeListener
        this.addEventListener = this.on = this.addListener;
        this.removeEventListener = this.off = this.removeListener;
    }

    /**
     * Adds new cancellable listener.
     * @param {String} eventName the name of the event
     * @param {Function} listener the listener.
     * @returns {Function} - The unsubscribe function.
     */
    addCancellableListener(eventName, listener) {
        this.addListener(eventName, listener);

        return () => this.removeListener(eventName, listener);
    }

    /**
     * Adds new listener.
     * @param {String} eventName the name of the event
     * @param {Function} listener the listener.
     * @returns {EventEmitter} - The emitter, so that calls can be chained.
     */
    addListener(eventName, listener) {
        return this.eventEmitter.addListener(eventName, listener);
    }

    /**
     * Removes listener.
     * @param {String} eventName the name of the event that triggers the
     * listener
     * @param {Function} listener the listener.
     * @returns {EventEmitter} - The emitter, so that calls can be chained.
     */
    removeListener(eventName, listener) {
        return this.eventEmitter.removeListener(eventName, listener);
    }

    /**
     * Emits an event.
     * @param {string} event - event name
     */
    emit(event, ...args) {
        this.eventEmitter.emit(event, ...args);
    }
}
