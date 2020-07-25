import { $iq, Strophe } from 'strophe.js';

import { nextTick } from '../util/TestUtils';

import { MockStropheConnection } from './MockClasses';
import { default as XmppConnection } from './XmppConnection';

/**
 * Creates any IQ.
 * @returns {Element}
 */
function testIQ() {
    return $iq({
        to: 'remoteJid',
        type: 'set'
    })
    .c('jingle', { xmlns: 'urn:xmpp:jingle:1',
        action: 'session-info',
        initiator: 'blabla',
        sid: '1234' })
    .up();
}

describe('XmppConnection', () => {
    let connection;
    let mockStropheConnection;
    let sendIQSpy;

    beforeEach(() => {
        jasmine.clock().install();

        spyOn(Strophe, 'Connection').and.callFake((...args) => {
            mockStropheConnection = new MockStropheConnection(...args);

            return mockStropheConnection;
        });

        connection = new XmppConnection({
            serviceUrl: 'wss://localhost/xmpp-websocket'
        });

        sendIQSpy = spyOn(mockStropheConnection, 'sendIQ').and.callThrough();

        // eslint-disable-next-line no-empty-function
        connection.connect('jid', undefined, () => { });
    });

    afterEach(() => {
        jasmine.clock().uninstall();
    });
    describe('sendIQ2', () => {
        it('will send the IQ immediately if connected', () => {
            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTED);

            return connection.sendIQ2(testIQ(), { timeout: 15000 })
                .then(() => {
                    expect(sendIQSpy).toHaveBeenCalled();
                });
        });
        it('will send the IQ on reconnect', () => {
            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTING);

            let resolved = false;

            connection
                .sendIQ2(testIQ(), { timeout: 15000 })
                .then(() => {
                    resolved = true;
                });

            jasmine.clock().tick(10000);

            return nextTick()
                .then(() => {
                    expect(resolved).toBe(false);
                    expect(sendIQSpy).not.toHaveBeenCalled();

                    mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTED);

                    return nextTick();
                })
                .then(() => {
                    expect(resolved).toBe(true);
                    expect(sendIQSpy).toHaveBeenCalled();
                });
        });
        it('will timeout the operation if not connected in time', () => {
            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTING);

            let rejected = false, resolved = false;

            connection
                .sendIQ2(testIQ(), { timeout: 15000 })
                .then(() => {
                    resolved = true;
                }, () => {
                    rejected = true;
                });

            jasmine.clock().tick(10000);

            return nextTick()
                .then(() => {
                    expect(sendIQSpy).not.toHaveBeenCalled();
                    expect(resolved).toBe(false);
                    expect(rejected).toBe(false);

                    jasmine.clock().tick(10000);

                    return nextTick();
                })
                .then(() => {
                    expect(sendIQSpy).not.toHaveBeenCalled();
                    expect(resolved).toBe(false);
                    expect(rejected).toBe(true);
                });
        });
        it('will reject the promise on explicit disconnect', () => {
            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTING);

            let rejected = false, resolved = false;

            connection
                .sendIQ2(testIQ(), { timeout: 15000 })
                .then(() => {
                    resolved = true;
                }, error => {
                    rejected = error;
                });

            jasmine.clock().tick(10000);

            return nextTick()
                .then(() => {
                    expect(sendIQSpy).not.toHaveBeenCalled();
                    expect(resolved).toBe(false);
                    expect(rejected).toBe(false);

                    connection.disconnect();

                    return nextTick();
                })
                .then(() => {
                    expect(sendIQSpy).not.toHaveBeenCalled();
                    expect(resolved).toBe(false);
                    expect(rejected).toEqual(new Error('disconnect'));
                });
        });
    });
});
