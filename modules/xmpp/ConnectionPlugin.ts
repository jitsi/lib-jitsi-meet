import Strophe from 'strophe';
import Listenable from '../util/Listenable';

/**
 * Base class for strophe connection plugins.
 */
export class ConnectionPluginListenable extends Listenable {
    /**
     * Strophe connection.
     */
    private connection: Strophe.Connection;

    /**
     * @constructor
     */
    constructor() {
        super();
        this.connection = null;
    }

    /**
     *
     * @param connection
     */
    init(connection: Strophe.Connection) {
        this.connection = connection;
    }
}
