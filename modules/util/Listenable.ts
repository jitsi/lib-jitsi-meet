import EventEmitter, { EventListener } from './EventEmitter';

/**
 * The class implements basic event operations - add/remove listener.
 * NOTE: The purpose of the class is to be extended in order to add
 * this functionality to other classes.
 */
export default class Listenable {
    /**
     * @internal
     */
    eventEmitter: EventEmitter;

    /**
     * Creates new instance.
     */
    constructor() {
        this.eventEmitter = new EventEmitter();
    }

    /**
   * Attaches a handler for events (e.g., "participant joined") in the conference.
   * All possible events are defined in JitsiConferenceEvents.
   * @param {string} eventId - The event ID.
   * @param {Function} handler - Handler for the event.
   */
    on(eventId: string, handler: EventListener): void {
        this.eventEmitter.on(eventId, handler);
    }

    /**
   * Removes event listener.
   * @param {string} eventId - The event ID.
   * @param {Function} [handler] - Optional, the specific handler to unbind.
   */
    off(eventId: string, handler?: EventListener): void {
        this.eventEmitter.removeListener(eventId, handler);
    }

    /**
   * Adds a one-time listener function for the event.
   * @param {string} eventId - The event ID.
   * @param {Function} handler - Handler for the event.
   */
    once(eventId: string, handler: EventListener): void {
        this.eventEmitter.once(eventId, handler);
    }

    /**
     * Alias for on method.
     * @param {string} eventId - The event ID.
     * @param {Function} handler - Handler for the event.
     */
    addEventListener(eventId: string, handler: EventListener): void {
        this.on(eventId, handler);
    }

    /**
     * Alias for off method.
     * @param {string} eventId - The event ID.
     * @param {Function} [handler] - Optional, the specific handler to unbind.
     */
    removeEventListener(eventId: string, handler?: EventListener): void {
        this.off(eventId, handler);
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

    /**
     * Removes all listeners for the event emitter.
     */
    removeAllListeners(): void {
        this.eventEmitter.removeAllListeners();
    }

    /**
     * Returns the number of listeners for the specified event.
     * @param {string} [eventName] - The name of the event.
     * @returns {number} - The number of listeners for the event.
     */
    listenerCount(eventName?: string): number {
        return this.eventEmitter.listenerCount(eventName);
    }
}
