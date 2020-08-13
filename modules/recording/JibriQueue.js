/* global $ */

import EventEmitter from 'events';
import { getLogger } from 'jitsi-meet-logger';
import { $iq, Strophe } from 'strophe.js';

const logger = getLogger(__filename);

/**
 * A static counter of the JibriQueue instances used to generate a unique ID for the JibriQueue instances.
 */
let id = 0;

/**
 * Represents a jibri queue.
 */
export default class JibriQueue extends EventEmitter {
    /**
     * Initializes a new JibriQueue instance.
     *
     * @param {Object} options
     * @param {string} options.jibriQueueComponentAddress - The address of the jibri queue component.
     * @param {XmppConnection} options.connection - The XMPPConnection instance to use.
     * @param {string} options.roomJID - The JID of the MUC related to the current conference.
     *
     * @constructor
     */
    constructor(options = {}) {
        super();
        const { connection, jibriQueueComponentAddress, roomJID } = options;

        this._id = `${id++}`;
        this._metrics = {};
        this._hasJoined = false;
        this._connection = connection;
        this._jibriQueueComponentAddress = jibriQueueComponentAddress;
        this._roomJID = roomJID;
        this._onIQ = this._onIQ.bind(this);
        this._connectionHandlerRef = this._connection.addHandler(this._onIQ, 'http://jitsi.org/protocol/jibri-queue',
            'iq', 'set', null, this._jibriQueueComponentAddress, { matchBareFromJid: true });
    }

    /**
     * Returns the unique ID of the queue instance.
     *
     * @returns {number} - The ID of the queue.
     */
    get id() {
        return this._id;
    }

    /**
     * Joins the jibri queue.
     *
     * @returns {Promise}
     */
    join() {
        if (this._hasJoined) {
            return Promise.reject(new Error('The queue is already joined!'));
        }

        return new Promise((resolve, reject) => {
            this._connection.sendIQ(
                $iq({
                    to: this._jibriQueueComponentAddress,
                    type: 'set'
                })
                .c('jibri-queue', {
                    xmlns: 'http://jitsi.org/protocol/jibri-queue',
                    action: 'join',
                    room: this._roomJID
                })
                .up(), result => {
                    const jibriQueue = result && result.getElementsByTagName('jibri-queue')[0];

                    if (!jibriQueue) {
                        reject(new Error('Invalid response to join jibri queue request!'));

                        return;
                    }

                    const requestId = jibriQueue.getAttribute('requestId');

                    if (!requestId) {
                        reject(new Error('The response of the join jibri queue request doesn\'t have requestId!'));

                        return;
                    }

                    this._hasJoined = true;
                    this._id = requestId;
                    logger.debug('Successfully joined the jibri queue!');
                    resolve();
                }, error => {
                    logger.error(`Error joining the jibri queue - ${error}!`);
                    reject(error);
                }
            );
        });
    }

    /**
     * Handler for incoming IQ packets.
     *
     * @param {Element} iq - The IQ.
     * @returns {boolean}
     */
    _onIQ(iq) {
        if (!this._hasJoined) {
            return true;
        }

        const jibriQueueNodes = $(iq).find('jibri-queue');
        const from = iq.getAttribute('from');

        if (from !== this._jibriQueueComponentAddress || jibriQueueNodes.length === 0) {
            // This shouldn't happen!

            return true;
        }

        const jibriQueue = jibriQueueNodes[0];
        const action = jibriQueue.getAttribute('action');
        const value = jibriQueue.getAttribute('value');
        const requestId = jibriQueue.getAttribute('requestId');

        if (requestId !== this._id) {
            // The message is not for this JibiQueue.

            return true;
        }

        const ack = $iq({ type: 'result',
            to: from,
            id: iq.getAttribute('id')
        });

        switch (action) {
        case 'info': {
            let updated = false;

            for (const child of Array.from(jibriQueue.children)) {
                switch (child.tagName) {
                case 'position': {
                    const position = Strophe.getText(child);

                    if (position !== this._metrics.position) {
                        this._metrics.position = position;
                        updated = true;
                    }
                    break;
                }
                case 'time': {
                    const estimatedTimeLeft = Strophe.getText(child);

                    if (estimatedTimeLeft !== this._metrics.estimatedTimeLeft) {
                        this._metrics.estimatedTimeLeft = estimatedTimeLeft;
                        updated = true;
                    }
                    break;
                }
                }
            }

            if (updated) {
                this.emit('metrics', this._metrics);

                logger.debug(`JibriQueue info update: ${JSON.stringify(this._metrics)}}`);
            }

            break;
        }
        case 'token':
            this.emit('token', value);
            logger.debug('JibriQueue: token received.');
            break;

        default:
            ack.attrs({ type: 'error' });
            ack.c('error', { type: 'cancel' })
                .c('service-unavailable', {
                    xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas'
                })
                .up();
        }

        this._connection.send(ack);

        return true;
    }

    /**
     * Leave the queue.
     *
     * @returns {Promise}
     */
    leave() {
        this.emit('will-leave');
        if (!this._hasJoined) {
            return Promise.reject(new Error('There\'s no queue to leave!'));
        }

        return new Promise((resolve, reject) => {
            this._connection.sendIQ(
                $iq({
                    to: this._jibriQueueComponentAddress,
                    type: 'set'
                })
                .c('jibri-queue', {
                    'xmlns': 'http://jitsi.org/protocol/jibri-queue',
                    'requestId': this._id,
                    'action': 'leave'
                })
                .up(), () => {
                    this.emit('left');
                    logger.debug('Successfully left the jibri queue!');
                }, error => {
                    logger.error(`Error leaving the jibri queue - ${error}!`);

                    reject(error);
                }
            );
        });
    }

    /**
     * Disposes the allocated resources.
     */
    dispose() {
        this._connection.deleteHandler(this._connectionHandlerRef);
        this.removeAllListeners();
    }
}
