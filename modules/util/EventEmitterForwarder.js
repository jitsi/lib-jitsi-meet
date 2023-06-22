/**
 * Implements utility to forward events from one eventEmitter to another.
 * @param src {object} instance of EventEmitter or another class that implements
 * addListener method which will register listener to EventEmitter instance.
 * @param dest {object} instance of EventEmitter or another class that
 * implements emit method which will emit an event.
 */
function EventEmitterForwarder(src, dest) {
    if (!src || !dest || typeof src.addListener !== 'function'
        || typeof dest.emit !== 'function') {
        throw new Error('Invalid arguments passed to EventEmitterForwarder');
    }
    this.src = src;
    this.dest = dest;
    this.listeners = new Map();
}

/**
 * Adds event to be forwarded from src to dest.
 * @param srcEvent {string} the event that EventEmitterForwarder is listening
 * for.
 * @param dstEvent {string} the event that will be fired from dest.
 * @param arguments all other passed arguments are going to be fired with
 * dstEvent.
 */
EventEmitterForwarder.prototype.forward = function(...args) {
    const srcEvent = args[0];

    // This will be the "this" value for emit function.

    args[0] = this.dest;

    // Using bind.apply to pass the arguments as Array-like object ("arguments")
    const newListener = Function.prototype.bind.apply(this.dest.emit, args);

    this.src.addListener(srcEvent, newListener);
    this.listeners.set(srcEvent, newListener);
};

/**
 * Clears the listeners for the supplied events.
 *
 * @param args all the events which listeners to be cleaned.
 */
EventEmitterForwarder.prototype.removeListeners = function(...args) {
    args.forEach(a => {
        const l = this.listeners.get(a);

        if (l) {
            this.src.removeListener(a, l);
            this.listeners.delete(a);
        }
    });
};

module.exports = EventEmitterForwarder;
