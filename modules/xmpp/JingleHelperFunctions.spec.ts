import { expandSourcesFromJson } from './JingleHelperFunctions';

/**
 * Parses an XML string into the root element.
 *
 * @param {string} xml - The XML.
 * @returns {Element}
 */
function parse(xml: string): Element {
    return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('JingleHelperFunctions expandSourcesFromJson', () => {
    const JSON_MESSAGE = '{"sources":{"ep1":[[],[],[{"n":"ep1-a0","s":"1234"}],[]]}}';

    it('adds the sources to the jingle element that is a direct child of the iq', () => {
        const iq = parse('' +
            '<iq type="set" xmlns="jabber:client">' +
                '<wrapper xmlns="urn:example:extension">' +
                    '<jingle xmlns="urn:xmpp:jingle:1"/>' +
                '</wrapper>' +
                '<jingle xmlns="urn:xmpp:jingle:1">' +
                    `<json-message xmlns="http://jitsi.org/jitmeet">${JSON_MESSAGE}</json-message>` +
                '</jingle>' +
            '</iq>');
        const jsonMessage = iq.querySelector(':scope>jingle>json-message') as Element;

        const ssrcs = expandSourcesFromJson(iq, jsonMessage);

        expect(ssrcs?.get('ep1')).toEqual([ '1234' ]);
        expect(iq.querySelectorAll(':scope>jingle>content[name="audio"]>description>source').length).toBe(1);
        expect(iq.querySelectorAll(':scope>wrapper content').length).toBe(0);
    });

    it('adds the sources to the description that is a direct child of the content', () => {
        const iq = parse('' +
            '<iq type="set" xmlns="jabber:client">' +
                '<jingle xmlns="urn:xmpp:jingle:1">' +
                    '<content name="audio"><wrapper><description xmlns="urn:example:other"/></wrapper></content>' +
                    `<json-message xmlns="http://jitsi.org/jitmeet">${JSON_MESSAGE}</json-message>` +
                '</jingle>' +
            '</iq>');
        const jsonMessage = iq.querySelector(':scope>jingle>json-message') as Element;

        expandSourcesFromJson(iq, jsonMessage);

        expect(iq.querySelectorAll(':scope>jingle>content[name="audio"]>description>source').length).toBe(1);
        expect(iq.querySelectorAll('wrapper>description>source').length).toBe(0);
    });
});
