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

        it('keeps the features when identities are processed without features', () => {
            (xmpp as any)._processDiscoInfoIdentities(new Set(), new Set([ 'http://jitsi.org/protocol/polls#close' ]));
            (xmpp as any)._processDiscoInfoIdentities(new Set());

            expect(xmpp.isServerFeatureSupported('http://jitsi.org/protocol/polls#close')).toBe(true);
        });
    });
});
