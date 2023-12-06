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
        this.addEventListener = this.on = this.addListener;
        this.removeEventListener = this.off = this.removeListener;
    }
}
