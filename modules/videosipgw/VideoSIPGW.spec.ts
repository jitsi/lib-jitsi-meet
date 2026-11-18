import { XMPPEvents } from '../../service/xmpp/XMPPEvents';
import EventEmitter from '../util/EventEmitter';

import VideoSIPGW from './VideoSIPGW';
import * as Constants from './VideoSIPGWConstants';

describe('VideoSIPGW', () => {
    const FOCUS_JID = 'room@conference.example.org/focus';
    let eventEmitter: EventEmitter;
    let sipgw: VideoSIPGW;
    let stateSpy: jasmine.Spy;

    beforeEach(() => {
        eventEmitter = new EventEmitter();
        const chatRoom = {
            addPresenceListener: () => {}, // eslint-disable-line no-empty-function
            eventEmitter,
            isFocus: (jid: string) => jid === FOCUS_JID
        };

        sipgw = new VideoSIPGW(chatRoom as any);
        sipgw.createVideoSIPGWSession('sip@example.org', 'Room');
        stateSpy = jasmine.createSpy('stateChanged');
        eventEmitter.on(XMPPEvents.VIDEO_SIP_GW_SESSION_STATE_CHANGED, stateSpy);
    });

    describe('handleJibriSIPState', () => {
        const node = { attributes: { sipaddress: 'sip@example.org',
            state: Constants.STATE_ON } };

        it('applies the state that the focus published', () => {
            sipgw.handleJibriSIPState(node, 'focus', FOCUS_JID);

            expect(stateSpy).toHaveBeenCalledTimes(1);
            expect(stateSpy.calls.mostRecent().args[0].newState).toBe(Constants.STATE_ON);
        });

        it('ignores the state that another participant published', () => {
            sipgw.handleJibriSIPState(node, 'other', 'room@conference.example.org/other');

            expect(stateSpy).not.toHaveBeenCalled();
        });
    });
});
