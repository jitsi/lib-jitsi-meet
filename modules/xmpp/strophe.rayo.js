/* global $, $iq, Strophe */

import { getLogger } from 'jitsi-meet-logger';
const logger = getLogger(__filename);

import ConnectionPlugin from './ConnectionPlugin';

const RAYO_XMLNS = 'urn:xmpp:rayo:1';

class RayoConnectionPlugin extends ConnectionPlugin {
    init(connection) {
        super.init(connection);

        this.connection.addHandler(
            this.onRayo.bind(this), RAYO_XMLNS, 'iq', 'set', null, null);
    }

    onRayo(iq) {
        logger.info('Rayo IQ', iq);
    }

    dial(to, from, roomName, roomPass, focusMucJid) {
        return new Promise((resolve, reject) => {
            if (!focusMucJid) {
                reject(new Error('Internal error!'));

                return;
            }
            const req = $iq({
                type: 'set',
                to: focusMucJid
            });

            req.c('dial', {
                xmlns: RAYO_XMLNS,
                to,
                from
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

            this.connection.sendIQ(req, result => {
                logger.info('Dial result ', result);

                // eslint-disable-next-line newline-per-chained-call
                const resource = $(result).find('ref').attr('uri');

                this.callResource = resource.substr('xmpp:'.length);
                logger.info(`Received call resource: ${this.callResource}`);
                resolve();
            }, error => {
                logger.info('Dial error ', error);
                reject(error);
            });
        });
    }

    hangup() {
        return new Promise((resolve, reject) => {
            if (!this.callResource) {
                reject(new Error('No call in progress'));
                logger.warn('No call in progress');

                return;
            }

            const req = $iq({
                type: 'set',
                to: this.callResource
            });

            req.c('hangup', {
                xmlns: RAYO_XMLNS
            });

            this.connection.sendIQ(req, result => {
                logger.info('Hangup result ', result);
                this.callResource = null;
                resolve();
            }, error => {
                logger.info('Hangup error ', error);
                this.callResource = null;
                reject(new Error('Hangup error '));
            });
        });
    }
}

export default function() {
    Strophe.addConnectionPlugin('rayo', new RayoConnectionPlugin());
}
