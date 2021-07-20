export = EventEmitterForwarder;
/**
 * Implements utility to forward events from one eventEmitter to another.
 * @param src {object} instance of EventEmitter or another class that implements
 * addListener method which will register listener to EventEmitter instance.
 * @param dest {object} instance of EventEmitter or another class that
 * implements emit method which will emit an event.
 */
declare function EventEmitterForwarder(src: object, dest: object): void;
declare class EventEmitterForwarder {
    /**
     * Implements utility to forward events from one eventEmitter to another.
     * @param src {object} instance of EventEmitter or another class that implements
     * addListener method which will register listener to EventEmitter instance.
     * @param dest {object} instance of EventEmitter or another class that
     * implements emit method which will emit an event.
     */
    constructor(src: object, dest: object);
    src: any;
    dest: any;
    forward(...args: any[]): void;
}
