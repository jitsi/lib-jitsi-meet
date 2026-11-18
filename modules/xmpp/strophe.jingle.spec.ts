import JingleConnectionPlugin from './strophe.jingle';

/**
 * Parses an XML string into the root element.
 *
 * @param {string} xml - The XML.
 * @returns {Element}
 */
function parse(xml: string): Element {
    return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('strophe.jingle onJingle', () => {
    const PEER = 'room@conference.example.org/peer';
    let plugin: any;
    let sendSpy: jasmine.Spy;
    let session: any;

    beforeEach(() => {
        plugin = new (JingleConnectionPlugin as any)({}, { emit: () => {} }, { jvb: {},
            p2p: {} });
        sendSpy = jasmine.createSpy('send');
        plugin.connection = { send: sendSpy };

        session = {
            modifyContents: jasmine.createSpy('modifyContents'),
            remoteJid: PEER,
            sid: 'real'
        };
        plugin.sessions.real = session;
    });

    it('reads the sid and the action from the jingle element that is a direct child of the iq', () => {
        const iq = parse('' +
            `<iq type="set" id="1" from="${PEER}" to="me" xmlns="jabber:client">` +
                '<wrapper xmlns="urn:example:extension">' +
                    '<jingle xmlns="urn:xmpp:jingle:1" sid="nested" action="session-terminate"/>' +
                '</wrapper>' +
                '<jingle xmlns="urn:xmpp:jingle:1" sid="real" action="content-modify"/>' +
            '</iq>');

        plugin.onJingle(iq);

        expect(session.modifyContents).toHaveBeenCalledTimes(1);
        expect(session.modifyContents.calls.mostRecent().args[0].getAttribute('sid')).toBe('real');
        expect(sendSpy.calls.mostRecent().args[0].tree().getAttribute('type')).toBe('result');
    });
});
