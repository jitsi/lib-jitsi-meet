/* global $ */

import { getLogger } from '@jitsi/logger';
import { $iq } from 'strophe.js';

import ConnectionPlugin from './ConnectionPlugin';

const logger = getLogger(__filename);

const RAYO_XMLNS = 'urn:xmpp:rayo:1';

/**
 *
 */
export default class RayoConnectionPlugin extends ConnectionPlugin {
    /**
     *
     * @param connection
     */
    init(connection) {
        super.init(connection);

        this.connection.addHandler(
            this.onRayo.bind(this), RAYO_XMLNS, 'iq', 'set', null, null);
    }

    /**
     *
     * @param iq
     */
    onRayo(iq) {
        logger.info('Rayo IQ', iq);
    }

    /* eslint-disable max-params */

    /**
     *
     * @param to
     * @param from
     * @param roomName
     * @param roomPass
     * @param focusMucJid
     */
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

            this.connection.sendIQ(
                req,
                result => {
                    logger.info('Dial result ', result);

                    // eslint-disable-next-line newline-per-chained-call
                    const resource = $(result).find('ref').attr('uri');

                    this.callResource = resource.substr('xmpp:'.length);
                    logger.info(`Received call resource: ${this.callResource}`);
                    resolve();
                },
                error => {
                    logger.info('Dial error ', error);
                    reject(error);
                });
        });
    }

    /* eslint-enable max-params */

    /**
     *
     */
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
