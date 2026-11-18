import { Strophe } from 'strophe.js';

import './strophe.disco';

/**
 * Parses an XML string into the root element.
 *
 * @param {string} xml - The XML.
 * @returns {Element}
 */
function parse(xml: string): Element {
    return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('strophe.disco', () => {
    let disco: any;
    let sendSpy: jasmine.Spy;

    beforeEach(() => {
        sendSpy = jasmine.createSpy('send');
        disco = Object.create((Strophe as any)._connectionPlugins.disco);
        disco.init({
            addHandler: () => {}, // eslint-disable-line no-empty-function
            send: sendSpy
        });
        disco.addFeature('urn:example:feature');
    });

    /**
     * Returns the stanza that the plugin sent.
     *
     * @returns {Element}
     */
    function sentStanza(): Element {
        expect(sendSpy).toHaveBeenCalledTimes(1);

        return sendSpy.calls.mostRecent().args[0];
    }

    for (const [ name, ns, method ] of [
        [ 'disco#info', 'http://jabber.org/protocol/disco#info', '_onDiscoInfo' ],
        [ 'disco#items', 'http://jabber.org/protocol/disco#items', '_onDiscoItems' ]
    ]) {
        describe(`${name} request`, () => {
            it('answers a query that is a direct child', () => {
                const iq = parse(`<iq type="get" id="1" from="peer" xmlns="jabber:client"><query xmlns="${ns}"/></iq>`);

                expect(disco[method](iq)).toBe(true);
                expect(sentStanza().getAttribute('type')).toBe('result');
            });

            it('answers with an error and does not throw when the direct child is not a query', () => {
                const iq = parse(`<iq type="get" id="2" from="peer" xmlns="jabber:client"><other xmlns="${ns}"/></iq>`);

                expect(() => disco[method](iq)).not.toThrow();
                expect(disco[method](iq)).toBe(true);
                expect(sendSpy.calls.mostRecent().args[0].getAttribute('type')).toBe('error');
            });

            it('does not use a query that is nested in another element', () => {
                const iq = parse('' +
                    '<iq type="get" id="3" from="peer" xmlns="jabber:client">' +
                        `<other xmlns="${ns}"><query node="nested"/></other>` +
                    '</iq>');

                disco[method](iq);

                expect(sendSpy.calls.mostRecent().args[0].getAttribute('type')).toBe('error');
            });
        });
    }
});
