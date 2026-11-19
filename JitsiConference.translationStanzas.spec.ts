import JitsiConference from './JitsiConference';
import { JitsiConferenceEvents } from './JitsiConferenceEvents';
import EventEmitter from './modules/util/EventEmitter';

/**
 * Parses an XML string into the root element.
 *
 * @param {string} xml - The XML.
 * @returns {Element}
 */
function parse(xml: string): Element {
    return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('JitsiConference audio translation stanzas', () => {
    let conference: any;
    let emitSpy: jasmine.Spy;

    beforeEach(() => {
        const eventEmitter = new EventEmitter();

        emitSpy = spyOn(eventEmitter, 'emit');
        conference = Object.assign(Object.create(JitsiConference.prototype), {
            _pendingTranslationRequests: new Map(),
            eventEmitter
        });
    });

    describe('translation-listeners push', () => {
        it('reads the listeners from a direct child of the message', () => {
            conference._onTranslationListenersChanged(parse('' +
                '<message xmlns="jabber:client">' +
                    '<wrapper><translation-listeners>["nested"]</translation-listeners></wrapper>' +
                    '<translation-listeners>["direct"]</translation-listeners>' +
                '</message>'));

            expect(emitSpy).toHaveBeenCalledWith(JitsiConferenceEvents.AUDIO_TRANSLATION_LISTENERS_CHANGED, [ 'direct' ]);
        });

        it('ignores a translation-listeners element that is not a direct child of the message', () => {
            conference._onTranslationListenersChanged(parse('' +
                '<message xmlns="jabber:client">' +
                    '<wrapper><translation-listeners>["nested"]</translation-listeners></wrapper>' +
                '</message>'));

            expect(emitSpy).not.toHaveBeenCalled();
        });
    });

    describe('error reply', () => {
        it('reads the condition from the error element that is a direct child of the message', () => {
            conference._onTranslationRequestError(parse('' +
                '<message type="error" id="req-1" xmlns="jabber:client">' +
                    '<wrapper><error><forbidden/></error></wrapper>' +
                    '<error><bad-request/></error>' +
                '</message>'));

            expect(emitSpy.calls.mostRecent().args[1].error).toBe('bad-request');
        });
    });
});
