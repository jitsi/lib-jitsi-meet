/* global $, $iq, Strophe */

import { getLogger } from "jitsi-meet-logger";
const logger = getLogger(__filename);
import ConnectionPlugin from "./ConnectionPlugin";

const RAYO_XMLNS = 'urn:xmpp:rayo:1';

class RayoConnectionPlugin extends ConnectionPlugin {
    init (connection) {
        super.init(connection);

        this.connection.addHandler(
            this.onRayo.bind(this), RAYO_XMLNS, 'iq', 'set', null, null);
    }

    onRayo (iq) {
        logger.info("Rayo IQ", iq);
    }

    dial (to, from, roomName, roomPass, focusMucJid) {
        return new Promise((resolve, reject) => {
            if(!focusMucJid) {
                reject(new Error("Internal error!"));
                return;
            }
            const req = $iq({
                type: 'set',
                to: focusMucJid
            });
            req.c('dial', {
                xmlns: RAYO_XMLNS,
                to: to,
                from: from
            });
            req.c('header', {
                name: 'JvbRoomName',
                value: roomName
            }).up();

            if (roomPass && roomPass.length) {
                req.c('header', {
                    name: 'JvbRoomPassword',
                    value: roomPass
                }).up();
            }

            this.connection.sendIQ(req, (result) => {
                logger.info('Dial result ', result);

                let resource = $(result).find('ref').attr('uri');
                this.call_resource =
                    resource.substr('xmpp:'.length);
                logger.info("Received call resource: " + this.call_resource);
                resolve();
            }, (error) => {
                logger.info('Dial error ', error);
                reject(error);
            });
        });
    }

    hangup () {
        return new Promise((resolve, reject) => {
            if (!this.call_resource) {
                reject(new Error("No call in progress"));
                logger.warn("No call in progress");
                return;
            }

            const req = $iq({
                type: 'set',
                to: this.call_resource
            });
            req.c('hangup', {
                xmlns: RAYO_XMLNS
            });

            this.connection.sendIQ(req, (result) => {
                logger.info('Hangup result ', result);
                this.call_resource = null;
                resolve();
            }, (error) => {
                logger.info('Hangup error ', error);
                this.call_resource = null;
                reject(new Error('Hangup error '));
            });
        });
    }
}

export default function() {
    Strophe.addConnectionPlugin('rayo', new RayoConnectionPlugin());
}
