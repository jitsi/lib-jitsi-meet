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
    override init(connection: Strophe.Connection): void {
        super.init(connection);
        connection.rawInput = this.logIncoming.bind(this);
        connection.rawOutput = this.logOutgoing.bind(this);
    }

    /**
     *
     * @param stanza
     */
    logIncoming(stanza: Element | Strophe.Builder): void {
        this.log.push([ new Date().getTime(), 'incoming', stanza ]);
    }

    /**
     *
     * @param stanza
     */
    logOutgoing(stanza: Element | Strophe.Builder): void {
        this.log.push([ new Date().getTime(), 'outgoing', stanza ]);
    }
}

/**
 *
 */
export default function() {
    Strophe.addConnectionPlugin('logger', new StropheLogger());
}
