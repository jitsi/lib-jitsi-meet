/* global Strophe */
import ConnectionPlugin from "./ConnectionPlugin";

/**
 *  Logs raw stanzas and makes them available for download as JSON
 */
class StropheLogger extends ConnectionPlugin {
    constructor() {
        super();
        this.log = [];
    }

    init (connection) {
        super.init(connection);
        this.connection.rawInput = this.log_incoming.bind(this);
        this.connection.rawOutput = this.log_outgoing.bind(this);
    }

    log_incoming (stanza) {
        this.log.push([new Date().getTime(), 'incoming', stanza]);
    }

    log_outgoing (stanza) {
        this.log.push([new Date().getTime(), 'outgoing', stanza]);
    }
}

export default function () {
    Strophe.addConnectionPlugin('logger', new StropheLogger());
}
