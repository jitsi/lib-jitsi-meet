import { getFocusRecordingUpdate, getHiddenDomainUpdate, getSessionIdFromIq } from './recordingXMLUtils';

/**
 * Parses an XML string into the root element.
 *
 * @param {string} xml - The XML.
 * @returns {Element}
 */
function parse(xml: string): Element {
    return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('recordingXMLUtils', () => {
    describe('getFocusRecordingUpdate', () => {
        it('reads the recording status from a direct child of the presence', () => {
            const update = getFocusRecordingUpdate(parse('' +
                '<presence from="room/focus">' +
                    '<jibri-recording-status xmlns="http://jitsi.org/protocol/jibri" status="on" ' +
                        'session_id="s1" recording_mode="file" initiator="focus"/>' +
                '</presence>'));

            expect(update).toEqual({
                error: null,
                initiator: 'focus',
                recordingMode: 'file',
                sessionID: 's1',
                status: 'on'
            });
        });

        it('ignores a recording status that is not a direct child of the presence', () => {
            const update = getFocusRecordingUpdate(parse('' +
                '<presence from="room/focus">' +
                    '<extension xmlns="urn:example:extension">' +
                        '<jibri-recording-status xmlns="http://jitsi.org/protocol/jibri" status="on" session_id="nested"/>' +
                    '</extension>' +
                '</presence>'));

            expect(update).toBeUndefined();
        });

        it('prefers the direct child over an element that is deeper in the presence', () => {
            const update = getFocusRecordingUpdate(parse('' +
                '<presence from="room/focus">' +
                    '<extension xmlns="urn:example:extension">' +
                        '<jibri-recording-status xmlns="http://jitsi.org/protocol/jibri" status="on" session_id="nested"/>' +
                    '</extension>' +
                    '<jibri-recording-status xmlns="http://jitsi.org/protocol/jibri" status="off" session_id="direct"/>' +
                '</presence>'));

            expect(update?.sessionID).toBe('direct');
            expect(update?.status).toBe('off');
        });
    });

    describe('getHiddenDomainUpdate', () => {
        it('reads the values from direct children of the presence', () => {
            const update = getHiddenDomainUpdate(parse('' +
                '<presence from="room/jibri">' +
                    '<session_id>s1</session_id>' +
                    '<mode>STREAM</mode>' +
                    '<live-stream-view-url>https://example.org/live</live-stream-view-url>' +
                '</presence>'));

            expect(update).toEqual({
                liveStreamViewURL: 'https://example.org/live',
                mode: 'stream',
                sessionID: 's1'
            });
        });

        it('prefers a direct child over an element that is deeper in the presence', () => {
            const update = getHiddenDomainUpdate(parse('' +
                '<presence from="room/jibri">' +
                    '<extension xmlns="urn:example:extension">' +
                        '<session_id>nested</session_id>' +
                        '<mode>nested</mode>' +
                        '<live-stream-view-url>https://nested.example.org</live-stream-view-url>' +
                    '</extension>' +
                    '<session_id>direct</session_id>' +
                    '<mode>file</mode>' +
                '</presence>'));

            expect(update).toEqual({
                liveStreamViewURL: undefined,
                mode: 'file',
                sessionID: 'direct'
            });
        });
    });

    describe('getSessionIdFromIq', () => {
        it('reads the session id from a direct child of the iq', () => {
            expect(getSessionIdFromIq(parse('' +
                '<iq type="result">' +
                    '<extension xmlns="urn:example:extension"><jibri session_id="nested"/></extension>' +
                    '<jibri xmlns="http://jitsi.org/protocol/jibri" session_id="direct"/>' +
                '</iq>'))).toBe('direct');
        });

        it('returns null when the jibri element is not a direct child of the iq', () => {
            expect(getSessionIdFromIq(parse('' +
                '<iq type="result">' +
                    '<extension xmlns="urn:example:extension"><jibri session_id="nested"/></extension>' +
                '</iq>'))).toBeNull();
        });
    });
});
