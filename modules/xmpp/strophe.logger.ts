import { Strophe } from 'strophe.js';

import ConnectionPlugin from './ConnectionPlugin';


/**
 *  Logs raw stanzas and makes them available for download as JSON
 */
class StropheLogger extends ConnectionPlugin {
    /**
     *
     */
    private log: any;

    /**
     *
     */
    constructor() {
        super();
        this.log = [];
    }

    /**
     *
     * @param connection
     */
    init(connection: any): void {
        super.init(connection);
        connection.rawInput = this.logIncoming.bind(this);
        connection.rawOutput = this.logOutgoing.bind(this);
    }

    /**
     *
     * @param stanza
     */
    logIncoming(stanza: any): void {
        this.log.push({ timestamp: new Date().getTime(), direction: 'incoming', stanza });
    }

    /**
     *
     * @param stanza
     */
    logOutgoing(stanza: any): void {
        this.log.push({ timestamp: new Date().getTime(), direction: 'outgoing', stanza });
    }
}

/**
 *
 */
export default function() {
    Strophe.addConnectionPlugin('logger', new StropheLogger());
}
