import { JitsiConferenceErrors } from '../../JitsiConferenceErrors';
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
    describe('authenticate', () => {
        /**
         * Creates a moderator whose authentication IQ fails with the supplied response.
         *
         * @param {Element|null} response - The IQ error response, or null for a timeout.
         * @returns {Moderator}
         */
        function moderatorWithError(response) {
            const connection = {
                jid: 'user@example.com/res',
                sendIQ: jasmine.createSpy('sendIQ').and.callFake((iq, onSuccess, onError) => onError(response))
            };

            return new Moderator({
                connection,
                options: { hosts: {} }
            });
        }

        it('parses a generic XMPP authentication error', async () => {
            const moderator = moderatorWithError(errorIq(
                '<service-unavailable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>'
                + '<text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">Service unavailable</text>'));

            await expectAsync(moderator.authenticate('room@muc.example.com')).toBeRejectedWith({
                error: 'service-unavailable',
                message: 'Service unavailable'
            });
        });

        it('preserves reservation error details', async () => {
            const moderator = moderatorWithError(errorIq(
                '<service-unavailable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>'
                + '<text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">Room is not reserved</text>'
                + '<reservation-error xmlns="http://jitsi.org/protocol/focus" error-code="403"/>'));

            await expectAsync(moderator.authenticate('room@muc.example.com')).toBeRejectedWith({
                error: JitsiConferenceErrors.RESERVATION_ERROR,
                message: 'Room is not reserved',
                reservationErrorCode: '403'
            });
        });

        it('recognizes a reservation error without a text element', async () => {
            const moderator = moderatorWithError(errorIq(
                '<reservation-error xmlns="http://jitsi.org/protocol/focus" error-code="3"/>'));

            await expectAsync(moderator.authenticate('room@muc.example.com')).toBeRejectedWith({
                error: JitsiConferenceErrors.RESERVATION_ERROR,
                message: undefined,
                reservationErrorCode: '3'
            });
        });

        it('leaves the reservation error code undefined when the attribute is missing', async () => {
            const moderator = moderatorWithError(errorIq(
                '<text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">Room is not reserved</text>'
                + '<reservation-error xmlns="http://jitsi.org/protocol/focus"/>'));

            await expectAsync(moderator.authenticate('room@muc.example.com')).toBeRejectedWith({
                error: JitsiConferenceErrors.RESERVATION_ERROR,
                message: 'Room is not reserved',
                reservationErrorCode: undefined
            });
        });

        it('rejects an IQ timeout without throwing while parsing the error', async () => {
            const moderator = moderatorWithError(null);

            await expectAsync(moderator.authenticate('room@muc.example.com')).toBeRejectedWith({
                error: undefined,
                message: ''
            });
        });
    });

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
