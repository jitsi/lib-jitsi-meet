import { EventEmitter as NodeEventEmitter } from 'events';

export type EventListener = (...args: any[]) => void;

/**
 * The class creates our own EventEmitter instance
 */
export default class EventEmitter extends NodeEventEmitter {
    public addEventListener: typeof NodeEventEmitter.prototype.addListener;
    public removeEventListener: typeof NodeEventEmitter.prototype.removeListener;

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
}
