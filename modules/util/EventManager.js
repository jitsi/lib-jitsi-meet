import EventEmitter from 'events';

/**
 * The class creates our own EventEmitter instance
 */
export default class EventManager extends EventEmitter {
    /**
     * Creates new instance.
     * @constructor
     */
    constructor() {
        super();

        // aliases for addListener/removeListener
        this.addEventListener = this.on = this.addListener;
        this.removeEventListener = this.off = this.removeListener;
    }
}
