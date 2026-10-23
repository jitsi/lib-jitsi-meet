import { EventEmitter } from 'events';

import JitsiConference from './JitsiConference';
import JitsiConferenceEventManager from './JitsiConferenceEventManager';
import JingleSessionPC from './modules/xmpp/JingleSessionPC';
import { MediaType } from './service/RTC/MediaType';
import { RTCEvents } from './service/RTC/RTCEvents';

describe('JitsiConferenceEventManager SSRC remapping', () => {
    let conference: jasmine.SpyObj<JitsiConference>;
    let rtc: EventEmitter;
    let session: jasmine.SpyObj<JingleSessionPC>;

    beforeEach(() => {
        rtc = new EventEmitter();
        conference = jasmine.createSpyObj<JitsiConference>('conference', [
            'onRemoteTrackAdded',
            'onRemoteTrackRemoved'
        ]);
        session = jasmine.createSpyObj<JingleSessionPC>('session', [ 'processSourceMap' ]);

        // Only listener registration is needed from the RTC instance.
        Object.assign(conference, { rtc });
        new JitsiConferenceEventManager(conference).setupRTCListeners();
    });

    const events: [RTCEvents, MediaType][] = [
        [ RTCEvents.AUDIO_SSRCS_REMAPPED, MediaType.AUDIO ],
        [ RTCEvents.VIDEO_SSRCS_REMAPPED, MediaType.VIDEO ]
    ];

    events.forEach(([ event, mediaType ]) => {
        const message = { mappedSources: [] };

        it(`ignores ${mediaType} remapping before a JVB session is available`, () => {
            expect(conference.jvbJingleSession).toBeUndefined();
            expect(() => rtc.emit(event, message)).not.toThrow();
            expect(session.processSourceMap).not.toHaveBeenCalled();
        });

        it(`ignores ${mediaType} remapping after the JVB session is cleared`, () => {
            conference.jvbJingleSession = session;
            conference.jvbJingleSession = null;

            expect(() => rtc.emit(event, message)).not.toThrow();
            expect(session.processSourceMap).not.toHaveBeenCalled();
        });

        it(`forwards ${mediaType} remapping to the current JVB session`, () => {
            conference.jvbJingleSession = session;
            rtc.emit(event, message);

            expect(session.processSourceMap).toHaveBeenCalledOnceWith(message, mediaType);
            expect(session.processSourceMap.calls.mostRecent().args[0]).toBe(message);
        });
    });
});
