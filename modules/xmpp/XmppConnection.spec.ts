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

        spyOn(Strophe, 'Connection').and.callFake((...args: any[]) => {
            mockStropheConnection = new MockStropheConnection(...(args as []));

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

            let rejected: boolean | Error = false, resolved = false;

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
    describe('WebSocket keep-alive', () => {
        // The default keep-alive interval (60s) plus the maximum jitter (60s).
        const MAX_KEEP_ALIVE_INTERVAL = 120000;
        const INITIAL_KEEP_ALIVE_DELAY = 5000;
        const REQUEST_TIMEOUT = 10000;
        let fetchSpy: jasmine.Spy;

        beforeEach(() => {
            fetchSpy = spyOn(window, 'fetch').and.callFake(() => Promise.resolve(new Response('')));

            // Do not let the XMPP ping interfere with the test.
            spyOn(connection.ping, 'startInterval');
            spyOn(connection.ping, 'stopInterval');
        });

        it('sends the first request shortly after connecting and keeps sending them', () => {
            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTED);

            expect(fetchSpy).not.toHaveBeenCalled();

            return nextTick(INITIAL_KEEP_ALIVE_DELAY)
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(1);
                    expect(fetchSpy).toHaveBeenCalledWith(
                        'https://localhost/xmpp-websocket',
                        jasmine.objectContaining({ cache: 'no-store' }));

                    return nextTick(MAX_KEEP_ALIVE_INTERVAL);
                })
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(2);

                    return nextTick(MAX_KEEP_ALIVE_INTERVAL);
                })
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(3);
                });
        });

        it('keeps sending requests when a request fails', () => {
            fetchSpy.and.callFake(() => Promise.reject(new TypeError('Failed to fetch')));

            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTED);

            return nextTick(INITIAL_KEEP_ALIVE_DELAY)
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(1);

                    return nextTick(MAX_KEEP_ALIVE_INTERVAL);
                })
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(2);
                });
        });

        it('aborts a request that never settles and keeps sending requests', () => {
            // A fetch which never resolves nor rejects, unless aborted.
            fetchSpy.and.callFake((_url: string, { signal }: RequestInit) => new Promise((_, reject) => {
                signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            }));

            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTED);

            return nextTick(INITIAL_KEEP_ALIVE_DELAY)
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(1);

                    const { signal } = fetchSpy.calls.mostRecent().args[1] as RequestInit;

                    expect(signal.aborted).toBe(false);

                    // Well past the next interval, but the request is still hanging so nothing new should be sent
                    // before the request timeout fires.
                    return nextTick(REQUEST_TIMEOUT - 1);
                })
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(1);

                    return nextTick(1);
                })
                .then(() => {
                    const { signal } = fetchSpy.calls.mostRecent().args[1] as RequestInit;

                    expect(signal.aborted).toBe(true);

                    return nextTick(MAX_KEEP_ALIVE_INTERVAL);
                })
                .then(() => {
                    // The loop survived the hung request.
                    expect(fetchSpy).toHaveBeenCalledTimes(2);

                    // Let the second request time out as well.
                    return nextTick(REQUEST_TIMEOUT);
                })
                .then(() => nextTick(MAX_KEEP_ALIVE_INTERVAL))
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(3);
                });
        });

        it('keeps sending requests even if fetch ignores the abort signal', () => {
            fetchSpy.and.callFake(() => new Promise(() => { /* never settles */ }));

            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTED);

            return nextTick(INITIAL_KEEP_ALIVE_DELAY)
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(1);

                    // Let the request time out.
                    return nextTick(REQUEST_TIMEOUT);
                })
                .then(() => nextTick(MAX_KEEP_ALIVE_INTERVAL))
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(2);
                });
        });

        it('stops sending requests after disconnect, even with a request in flight', () => {
            let resolveRequest: (response: Response) => void;

            fetchSpy.and.callFake(() => new Promise<Response>(resolve => {
                resolveRequest = resolve;
            }));

            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTED);

            return nextTick(INITIAL_KEEP_ALIVE_DELAY)
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(1);

                    connection.disconnect();
                    resolveRequest(new Response(''));

                    return nextTick(REQUEST_TIMEOUT + (2 * MAX_KEEP_ALIVE_INTERVAL));
                })
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(1);
                });
        });

        it('restarts sending requests on reconnect', () => {
            mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTED);

            return nextTick(INITIAL_KEEP_ALIVE_DELAY)
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(1);

                    mockStropheConnection.simulateConnectionState(Strophe.Status.DISCONNECTED);

                    return nextTick(2 * MAX_KEEP_ALIVE_INTERVAL);
                })
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(1);

                    // On reconnect the keep-alive is sent immediately.
                    mockStropheConnection.simulateConnectionState(Strophe.Status.CONNECTED);

                    return nextTick(1);
                })
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(2);

                    return nextTick(MAX_KEEP_ALIVE_INTERVAL);
                })
                .then(() => {
                    expect(fetchSpy).toHaveBeenCalledTimes(3);
                });
        });
    });
});
