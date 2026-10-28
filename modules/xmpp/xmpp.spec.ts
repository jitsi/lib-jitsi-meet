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
        let xmpp: XMPP;

        beforeEach(() => {
            xmpp = createXMPP();
        });

        afterEach(() => {
            xmpp?.disconnect();
        });

        it('does not support a feature that the server did not advertise', () => {
            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#single_answer')).toBe(false);
        });

        it('supports the features received with the disco info', () => {
            (xmpp as any)._processDiscoInfoIdentities(new Set(), new Set([
                'http://jitsi.org/protocol/polls#single_answer',
                'urn:xmpp:ping'
            ]));

            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#single_answer')).toBe(true);
            expect(xmpp.isServerFeatureSupported('urn:xmpp:ping')).toBe(true);
            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#close')).toBe(false);
        });

        it('supports the features received with the jiconop message', () => {
            const msg = $msg({ from: 'localhost' })
                .c('query', { xmlns: 'http://jabber.org/protocol/disco#info' })
                .c('identity', { category: 'server', name: 'shard-1', type: 'shard' })
                .up()
                .c('feature', { var: 'http://jitsi.org/protocol/polls#single_answer' })
                .tree();

            spyOn((xmpp as any).connection._stropheConn, 'deleteHandler');
            (xmpp as any)._onSystemMessage(msg);

            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#single_answer')).toBe(true);
            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#close')).toBe(false);
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

        it('keeps the features when identities are processed without features', () => {
            (xmpp as any)._processDiscoInfoIdentities(new Set(), new Set([ 'http://jitsi.org/protocol/polls#close' ]));
            (xmpp as any)._processDiscoInfoIdentities(new Set());

            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#close')).toBe(true);
        });

        it('emits SERVER_FEATURES_UPDATED when the disco info reply arrives after the connection is established',
            async () => {
                let resolveDiscoInfo: (value: unknown) => void;
                const discoInfo = new Promise(resolve => {
                    resolveDiscoInfo = resolve;
                });
                const updatedSpy = jasmine.createSpy('serverFeaturesUpdated');

                spyOn(xmpp.caps, 'getFeaturesAndIdentities').and.returnValue(discoInfo as any);
                spyOn(xmpp.connection.jingle, 'getStunAndTurnCredentials');
                (xmpp as any).sendDiscoInfo = true;
                xmpp.addListener(JitsiConnectionEvents.SERVER_FEATURES_UPDATED, updatedSpy);

                xmpp.connectionHandler({}, Strophe.Status.CONNECTED);

                expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#single_answer')).toBe(false);
                expect(updatedSpy).not.toHaveBeenCalled();

                resolveDiscoInfo({
                    features: new Set([ Strophe.NS.PING, 'http://jitsi.org/protocol/polls#single_answer' ]),
                    identities: new Set()
                });
                await discoInfo;
                await Promise.resolve();

                expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#single_answer')).toBe(true);
                expect(updatedSpy).toHaveBeenCalledTimes(1);
                expect(updatedSpy.calls.mostRecent().args[0])
                    .toEqual(jasmine.arrayContaining([ 'http://jitsi.org/protocol/polls#single_answer' ]));
            });

        it('does not emit SERVER_FEATURES_UPDATED when the features did not change', () => {
            const updatedSpy = jasmine.createSpy('serverFeaturesUpdated');

            xmpp.addListener(JitsiConnectionEvents.SERVER_FEATURES_UPDATED, updatedSpy);
            (xmpp as any)._processDiscoInfoIdentities(new Set(), new Set([ 'http://jitsi.org/protocol/polls#close' ]));
            (xmpp as any)._processDiscoInfoIdentities(new Set(), new Set([ 'http://jitsi.org/protocol/polls#close' ]));

            expect(updatedSpy).toHaveBeenCalledTimes(1);
            expect(updatedSpy).toHaveBeenCalledWith([ 'http://jitsi.org/protocol/polls#close' ]);
        });

        it('forgets the features of the previous connection when connecting again', () => {
            const updatedSpy = jasmine.createSpy('serverFeaturesUpdated');

            (xmpp as any)._processDiscoInfoIdentities(new Set(), new Set([ 'http://jitsi.org/protocol/polls#close' ]));
            xmpp.addListener(JitsiConnectionEvents.SERVER_FEATURES_UPDATED, updatedSpy);
            spyOn(xmpp.connection, 'connect');

            xmpp.connect('localhost', undefined);

            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#close')).toBe(false);
            expect(updatedSpy).toHaveBeenCalledWith([]);
        });

        it('keeps the features from jiconop when the connection is established', () => {
            (xmpp as any)._processDiscoInfoIdentities(new Set(), new Set([ 'http://jitsi.org/protocol/polls#close' ]));
            spyOn(xmpp.caps, 'getFeaturesAndIdentities').and.returnValue(new Promise(() => undefined) as any);
            spyOn(xmpp.connection.jingle, 'getStunAndTurnCredentials');
            (xmpp as any).sendDiscoInfo = true;

            xmpp.connectionHandler({}, Strophe.Status.CONNECTED);

            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#close')).toBe(true);
        });

        it('does not take the per-room lobby and breakout rooms features as server features', () => {
            (xmpp as any)._processDiscoInfoIdentities(new Set(), new Set([
                'http://jitsi.org/protocol/breakout_rooms#rename',
                'http://jitsi.org/protocol/lobbyrooms#displayname_required',
                'http://jitsi.org/protocol/polls#close'
            ]));

            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/breakout_rooms#rename')).toBe(false);
            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/lobbyrooms#displayname_required'))
                .toBe(false);
            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#close')).toBe(true);
        });
    });
});
