/**
 * Base class for strophe connection plugins.
 */
export default class ConnectionPlugin {
    constructor() {
        this.connection = null;
    }
    init (connection) {
        this.connection = connection;
    }
}
