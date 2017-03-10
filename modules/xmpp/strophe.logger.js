/* global Strophe */
import ConnectionPlugin from './ConnectionPlugin';

/**
 *  Logs raw stanzas and makes them available for download as JSON
 */
class StropheLogger extends ConnectionPlugin {
    constructor() {
        super();
        this.log = [];
    }

    init(connection) {
        super.init(connection);
        this.connection.rawInput = this.logIncoming.bind(this);
        this.connection.rawOutput = this.logOutgoing.bind(this);
    }

    logIncoming(stanza) {
        this.log.push([ new Date().getTime(), 'incoming', stanza ]);
    }

    logOutgoing(stanza) {
        this.log.push([ new Date().getTime(), 'outgoing', stanza ]);
    }
}

export default function() {
    Strophe.addConnectionPlugin('logger', new StropheLogger());
}
