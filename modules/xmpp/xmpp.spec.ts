import { $msg, Strophe } from 'strophe.js';

import { JitsiConnectionEvents } from '../../JitsiConnectionEvents';

import XMPP from './xmpp';

/**
 * Creates an XMPP instance with the minimum options needed by the constructor.
 *
 * @param {boolean} disableBeforeUnloadHandlers - Whether to disable the beforeunload handler.
 * @param {string} serviceUrl - The XMPP service URL.
 * @returns {XMPP}
 */
function createXMPP(disableBeforeUnloadHandlers = false, serviceUrl = 'wss://localhost/xmpp-websocket'): XMPP {
    return new XMPP({
        disableBeforeUnloadHandlers,
        hosts: {
            domain: 'localhost'
        },
        serviceUrl
    } as any);
}

describe('XMPP', () => {
    describe('page unload handlers', () => {
        let addEventListenerSpy: jasmine.Spy;
        let removeEventListenerSpy: jasmine.Spy;
        let xmpp: XMPP;

        beforeEach(() => {
            addEventListenerSpy = spyOn(window, 'addEventListener').and.callThrough();
            removeEventListenerSpy = spyOn(window, 'removeEventListener').and.callThrough();
        });

        afterEach(() => {
            // Make sure no listeners leak into other tests.
            xmpp?.disconnect();
        });

        /**
         * Returns the window event types the XMPP instance registered a listener for.
         *
         * @returns {string[]}
         */
        function registeredEventTypes(): string[] {
            return addEventListenerSpy.calls.allArgs()
                .filter(([ , listener ]) => listener === (xmpp as any)._unloadHandler)
                .map(([ type ]) => type);
        }

        it('registers beforeunload and pagehide, but not unload', () => {
            xmpp = createXMPP();

            expect(registeredEventTypes()).toEqual([ 'beforeunload', 'pagehide' ]);
        });

        it('registers only pagehide when beforeunload handlers are disabled', () => {
            xmpp = createXMPP(true);

            expect(registeredEventTypes()).toEqual([ 'pagehide' ]);
        });

        it('disconnects on pagehide and removes its listeners', () => {
            xmpp = createXMPP();

            const handler = (xmpp as any)._unloadHandler;
            const disconnectSpy = spyOn(xmpp, 'disconnect').and.callThrough();

            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));

            expect(disconnectSpy).toHaveBeenCalledTimes(1);
            expect(disconnectSpy.calls.mostRecent().args[0].type).toBe('pagehide');
            expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', handler);
            expect(removeEventListenerSpy).toHaveBeenCalledWith('pagehide', handler);

            // A second pagehide must not trigger another disconnect.
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));

            expect(disconnectSpy).toHaveBeenCalledTimes(1);
        });

        it('sends the unavailable beacon on pagehide when using BOSH', () => {
            xmpp = createXMPP(false, 'https://localhost/http-bind');

            const beaconSpy = spyOn(xmpp.connection, 'sendUnavailableBeacon').and.returnValue(true);
            const connectionDisconnectSpy = spyOn(xmpp.connection, 'disconnect');

            // Pretend connect() was called, so that disconnect() goes through the cleanup.
            (xmpp as any)._startConnecting = true;

            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));

            expect(beaconSpy).toHaveBeenCalled();
            expect(connectionDisconnectSpy).not.toHaveBeenCalled();
        });
    });

    describe('server features', () => {
        const POLLS_CLOSE = 'http://jitsi.org/protocol/polls#close';
        const SINGLE_ANSWER = 'http://jitsi.org/protocol/polls#single_answer';
        let xmpp: XMPP;

        /**
         * Builds a jiconop message.
         *
         * @param serverFeatures - The features in the server features element.
         * @param roomFeatures - The features in the disco#info query, as added for the room in the connection URL.
         * @returns The message.
         */
        function jiconop(serverFeatures: string[], roomFeatures: string[] = []): Element {
            const msg = $msg({ from: 'localhost' })
                .c('query', { xmlns: 'http://jabber.org/protocol/disco#info' })
                .c('identity', { category: 'server', name: 'shard-1', type: 'shard' })
                .up();

            roomFeatures.forEach(f => msg.c('feature', { var: f }).up());
            msg.up().c('features', { xmlns: 'http://jitsi.org/protocol/server-features' });
            serverFeatures.forEach(f => msg.c('feature', { var: f }).up());

            return msg.tree();
        }

        /**
         * Passes a jiconop message to the XMPP.
         *
         * @param serverFeatures - The features in the server features element.
         * @param roomFeatures - The features in the disco#info query.
         * @returns {void}
         */
        function receiveJiconop(serverFeatures: string[], roomFeatures: string[] = []): void {
            (xmpp as any)._onSystemMessage(jiconop(serverFeatures, roomFeatures));
        }

        /**
         * Connects with a pending disco#info query of the main domain.
         *
         * @returns The function that resolves the query, and a promise that settles once its reply is processed.
         */
        function connectWithPendingDiscoInfo() {
            let resolveDiscoInfo: (value: unknown) => void;
            let processed: () => void;
            const replyProcessed = new Promise<void>(resolve => {
                processed = resolve;
            });

            spyOn(xmpp.caps, 'getFeaturesAndIdentities').and.returnValue(new Promise(resolve => {
                resolveDiscoInfo = resolve;
            }) as any);
            spyOn(xmpp as any, '_processDiscoInfoIdentities').and.callFake(() => processed());
            spyOn(xmpp.connection.jingle, 'getStunAndTurnCredentials');
            (xmpp as any).sendDiscoInfo = true;

            xmpp.connectionHandler({}, Strophe.Status.CONNECTED);

            return {
                replyProcessed,
                resolveDiscoInfo: (features: string[]) => resolveDiscoInfo({
                    features: new Set(features),
                    identities: new Set()
                })
            };
        }

        beforeEach(() => {
            xmpp = createXMPP();
            spyOn(xmpp.connection._stropheConn, 'deleteHandler');
        });

        afterEach(() => {
            xmpp?.disconnect();
        });

        it('does not support a feature that the server did not advertise', () => {
            expect(xmpp.isServerFeatureSupported(SINGLE_ANSWER)).toBe(false);
            expect(xmpp.getServerFeatures()).toEqual([]);
        });

        it('reads the server features of the jiconop message from their own element', () => {
            receiveJiconop([ SINGLE_ANSWER, 'urn:xmpp:ping' ], [
                'http://jitsi.org/protocol/breakout_rooms#rename',
                'http://jitsi.org/protocol/lobbyrooms#displayname_required'
            ]);

            expect(xmpp.isServerFeatureSupported(SINGLE_ANSWER)).toBe(true);
            expect(xmpp.isServerFeatureSupported(POLLS_CLOSE)).toBe(false);
            expect(xmpp.getServerFeatures()).toEqual([ SINGLE_ANSWER ]);
        });

        it('ignores a server features element with another namespace', () => {
            const msg = $msg({ from: 'localhost' })
                .c('query', { xmlns: 'http://jabber.org/protocol/disco#info' })
                .up()
                .c('features', { xmlns: 'urn:example:other' })
                .c('feature', { var: SINGLE_ANSWER })
                .tree();

            (xmpp as any)._onSystemMessage(msg);

            expect(xmpp.isServerFeatureSupported(SINGLE_ANSWER)).toBe(false);
        });

        it('reports only the jitsi features of the disco#info reply, once it arrives', async () => {
            const updated = new Promise<string[]>(resolve => {
                xmpp.addListener(JitsiConnectionEvents.SERVER_FEATURES_UPDATED, resolve);
            });
            const { resolveDiscoInfo } = connectWithPendingDiscoInfo();

            expect(xmpp.isServerFeatureSupported(SINGLE_ANSWER)).toBe(false);

            resolveDiscoInfo([ Strophe.NS.PING, SINGLE_ANSWER ]);

            expect(await updated).toEqual([ SINGLE_ANSWER ]);
            expect(xmpp.isServerFeatureSupported(SINGLE_ANSWER)).toBe(true);
            expect(xmpp.isServerFeatureSupported(Strophe.NS.PING)).toBe(false);
        });

        it('ignores a disco#info reply that arrives after a new connection started', async () => {
            const { replyProcessed, resolveDiscoInfo } = connectWithPendingDiscoInfo();

            spyOn(xmpp.connection, 'connect');
            xmpp.connect('localhost', undefined);
            resolveDiscoInfo([ SINGLE_ANSWER ]);
            await replyProcessed;

            expect(xmpp.isServerFeatureSupported(SINGLE_ANSWER)).toBe(false);
        });

        it('does not read the features of other modules as breakout rooms or lobby features', () => {
            const displayNameRequiredSpy = jasmine.createSpy('displayNameRequired');

            xmpp.addListener(JitsiConnectionEvents.DISPLAY_NAME_REQUIRED, displayNameRequiredSpy);
            (xmpp as any)._processDiscoInfoIdentities(new Set([
                { category: 'component', name: 'breakout.localhost', type: 'breakout_rooms' },
                { category: 'component', name: 'lobby.localhost', type: 'lobbyrooms' }
            ]), new Set([ 'http://jitsi.org/protocol/test#rename', 'http://jitsi.org/protocol/test#displayname_required' ]));

            expect(xmpp.breakoutRoomsFeatures.rename).toBeFalsy();
            expect(displayNameRequiredSpy).not.toHaveBeenCalled();
        });

        it('reads the breakout rooms and lobby features', () => {
            const displayNameRequiredSpy = jasmine.createSpy('displayNameRequired');

            xmpp.addListener(JitsiConnectionEvents.DISPLAY_NAME_REQUIRED, displayNameRequiredSpy);
            (xmpp as any)._processDiscoInfoIdentities(new Set([
                { category: 'component', name: 'breakout.localhost', type: 'breakout_rooms' },
                { category: 'component', name: 'lobby.localhost', type: 'lobbyrooms' }
            ]), new Set([
                'http://jitsi.org/protocol/breakout_rooms#rename',
                'http://jitsi.org/protocol/lobbyrooms#displayname_required'
            ]));

            expect(xmpp.breakoutRoomsFeatures.rename).toBe(true);
            expect(displayNameRequiredSpy).toHaveBeenCalled();
        });

        it('does not emit SERVER_FEATURES_UPDATED when the features did not change', () => {
            const updatedSpy = jasmine.createSpy('serverFeaturesUpdated');

            xmpp.addListener(JitsiConnectionEvents.SERVER_FEATURES_UPDATED, updatedSpy);
            receiveJiconop([ POLLS_CLOSE ]);
            receiveJiconop([ POLLS_CLOSE ]);

            expect(updatedSpy).toHaveBeenCalledTimes(1);
            expect(updatedSpy).toHaveBeenCalledWith([ POLLS_CLOSE ]);
        });

        it('forgets the features of the previous connection when connecting again', () => {
            const updatedSpy = jasmine.createSpy('serverFeaturesUpdated');

            receiveJiconop([ POLLS_CLOSE ]);
            xmpp.addListener(JitsiConnectionEvents.SERVER_FEATURES_UPDATED, updatedSpy);
            spyOn(xmpp.connection, 'connect');

            xmpp.connect('localhost', undefined);

            expect(xmpp.isServerFeatureSupported(POLLS_CLOSE)).toBe(false);
            expect(updatedSpy).toHaveBeenCalledWith([]);
        });

        it('keeps the features from jiconop when the connection is established', () => {
            receiveJiconop([ POLLS_CLOSE ]);
            connectWithPendingDiscoInfo();

            expect(xmpp.isServerFeatureSupported(POLLS_CLOSE)).toBe(true);
        });
    });
});
