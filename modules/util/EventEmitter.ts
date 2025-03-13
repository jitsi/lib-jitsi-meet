import { EventEmitter as NodeEventEmitter } from 'events';

/**
 * The class creates our own EventEmitter instance
 */
export default class EventEmitter extends NodeEventEmitter {
    /**
     * Creates new instance.
     * @constructor
     */
    constructor() {
        super();
    }
       // aliases for addListener/removeListener
    addEventListener: (event: string, listener: (...args: any[]) => void) => this = this.addListener;
    removeEventListener: (event: string, listener: (...args: any[]) => void) => this = this.removeListener;
}
