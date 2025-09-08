import { getLogger } from '@jitsi/logger';
import { $iq, type Connection } from 'strophe.js';

import $ from '../util/XMLParser';

import ConnectionPlugin from './ConnectionPlugin';

const logger = getLogger('XMPP:strophe.rayo');

const RAYO_XMLNS = 'urn:xmpp:rayo:1';

/**
 *
 */
export default class RayoConnectionPlugin extends ConnectionPlugin {
    private callResource: Nullable<string> = null;

    /**
     *
     * @param connection
     */
    override init(connection: Connection): void {
        super.init(connection);

        connection.addHandler(
            this.onRayo.bind(this),
            RAYO_XMLNS,
            'iq',
            'set',
            null,
            null
        );
    }

    /**
     *
     * @param iq
     */
    onRayo(iq: any): any {
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
    dial(
            to: string,
            from: string,
            roomName: string,
            roomPass: string,
            focusMucJid: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!focusMucJid) {
                reject(new Error('Internal error!'));

                return;
            }
            const req = $iq({
                to: focusMucJid,
                type: 'set',
            });

            req.c('dial', {
                from,
                to,
                xmlns: RAYO_XMLNS,
            });
            req.c('header', {
                name: 'JvbRoomName',
                value: roomName,
            }).up();

            if (roomPass?.length) {
                req.c('header', {
                    name: 'JvbRoomPassword',
                    value: roomPass,
                }).up();
            }

            (this.connection as Connection).sendIQ(
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
                }
            );
        });
    }

    /* eslint-enable max-params */

    /**
     *
     */
    hangup(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.callResource) {
                reject(new Error('No call in progress'));
                logger.warn('No call in progress');

                return;
            }

            const req = $iq({
                to: this.callResource,
                type: 'set',
            });

            req.c('hangup', {
                xmlns: RAYO_XMLNS,
            });

            (this.connection as Connection).sendIQ(
                req,
                result => {
                    logger.info('Hangup result ', result);
                    this.callResource = null;
                    resolve();
                },
                error => {
                    logger.info('Hangup error ', error);
                    this.callResource = null;
                    reject(new Error('Hangup error '));
                }
            );
        });
    }
}
