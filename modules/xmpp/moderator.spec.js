import { CONNECTION_FAILED } from '../../JitsiConnectionEvents';
import { CONFERENCE_REQUEST_FAILED, TIME_LIMIT_ERROR } from '../../JitsiConnectionErrors';

import Moderator from './moderator';

/**
 * Builds an error IQ as a DOM element, the shape _handleIqError receives.
 *
 * @param {string} errorXml - The contents of the <error/> element.
 * @returns {Element}
 */
function errorIq(errorXml) {
    const xml = ''
        + '<iq type="error" from="focus.example.com" to="user@example.com/res" xmlns="jabber:client">'
            + '<conference xmlns="http://jitsi.org/protocol/focus" room="room@muc.example.com"/>'
            + `<error type="cancel">${errorXml}</error>`
        + '</iq>';

    return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('Moderator', () => {
    describe('_handleIqError - room time limit', () => {
        let moderator;
        let emitterSpy;
        let errorCallback;

        beforeEach(() => {
            const eventEmitter = { emit: () => {} }; // eslint-disable-line no-empty-function

            moderator = new Moderator({
                connection: {},
                eventEmitter,
                options: { hosts: {} }
            });
            moderator.eventEmitter = eventEmitter;
            emitterSpy = spyOn(eventEmitter, 'emit');
            errorCallback = jasmine.createSpy('errorCallback');
        });

        it('fails with TIME_LIMIT_ERROR when the condition comes through as an element', () => {
            moderator._handleIqError(
                'room@muc.example.com',
                errorIq('<resource-constraint xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>'),
                () => {}, // eslint-disable-line no-empty-function
                errorCallback);

            expect(emitterSpy).toHaveBeenCalledWith(CONNECTION_FAILED, TIME_LIMIT_ERROR);
            expect(emitterSpy).not.toHaveBeenCalledWith(CONNECTION_FAILED, CONFERENCE_REQUEST_FAILED);
            expect(errorCallback).toHaveBeenCalled();
        });

        it('fails with TIME_LIMIT_ERROR when jicofo only describes it in the error text', () => {
            moderator._handleIqError(
                'room@muc.example.com',
                errorIq('<text>XMPPError: resource-constraint - cancel</text>'),
                () => {}, // eslint-disable-line no-empty-function
                errorCallback);

            expect(emitterSpy).toHaveBeenCalledWith(CONNECTION_FAILED, TIME_LIMIT_ERROR);
            expect(errorCallback).toHaveBeenCalled();
        });

        it('leaves an unrelated error on the generic failure path', () => {
            moderator._handleIqError(
                'room@muc.example.com',
                errorIq('<service-unavailable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>'),
                () => {}, // eslint-disable-line no-empty-function
                errorCallback);

            expect(emitterSpy).not.toHaveBeenCalledWith(CONNECTION_FAILED, TIME_LIMIT_ERROR);
        });
    });
});
