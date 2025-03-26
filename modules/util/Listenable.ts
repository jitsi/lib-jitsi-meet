import EventEmitter, { EventListener } from './EventEmitter';

/**
 * The class implements basic event operations - add/remove listener.
 * NOTE: The purpose of the class is to be extended in order to add
 * this functionality to other classes.
 */
export default class Listenable {
    public eventEmitter: EventEmitter;
    public addEventListener: typeof EventEmitter.prototype.addListener;
    public removeEventListener: typeof EventEmitter.prototype.removeListener;
    public on: typeof EventEmitter.prototype.addListener;
    public off: typeof EventEmitter.prototype.removeListener;

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
    addCancellableListener(eventName: string, listener: EventListener): () => void {
        this.addListener(eventName, listener);

        return () => this.removeListener(eventName, listener);
    }

    /**
     * Adds new listener.
     * @param {String} eventName the name of the event
     * @param {Function} listener the listener.
     * @returns {EventEmitter} - The emitter, so that calls can be chained.
     */
    addListener(eventName: string, listener: EventListener): EventEmitter {
        return this.eventEmitter.addListener(eventName, listener);
    }

    /**
     * Removes listener.
     * @param {String} eventName the name of the event that triggers the
     * listener
     * @param {Function} listener the listener.
     * @returns {EventEmitter} - The emitter, so that calls can be chained.
     */
    removeListener(eventName: string, listener: EventListener): EventEmitter {
        return this.eventEmitter.removeListener(eventName, listener);
    }

    /**
     * Emits an event.
     * @param {string} event - event name
     */
    emit(event: string, ...args: any[]): void {
        this.eventEmitter.emit(event, ...args);
    }
}
