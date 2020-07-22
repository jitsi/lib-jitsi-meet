import EventEmitter from 'events';

import JitsiConference from '../../JitsiConference';
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import browser from '../browser';

import Statistics from './statistics';

/**
 * Mock object to be used in place of a real conference.
 *
 * @constructor
 */
function MockConference() {
    this.eventEmitter = new EventEmitter();
}
MockConference.prototype = Object.create(JitsiConference.prototype);
MockConference.prototype.constructor = JitsiConference;

describe('PerformanceObserverStats', () => {
    beforeEach(() => {
        // works only on chrome.
        spyOn(browser, 'isChrome').and.returnValue(true);
    });

    it('Emits performance stats every sec', () => {
        const mockConference = new MockConference();
        const statistics = new Statistics();

        statistics.attachPerformanceStats(mockConference);

        const startObserverSpy = spyOn(statistics.performanceObserverStats, 'startObserver');
        const stopObserverSpy = spyOn(statistics.performanceObserverStats, 'stopObserver');
        const addNextSpy = spyOn(statistics.performanceObserverStats.stats, 'addNext');

        mockConference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_JOINED);
        expect(startObserverSpy).toHaveBeenCalled();
        expect(statistics.performanceObserverStats.getPerformanceStats()).toBeTruthy();

        setTimeout(() => {
            expect(addNextSpy).toHaveBeenCalled();
        }, 1000);

        mockConference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_LEFT);
        expect(stopObserverSpy).toHaveBeenCalled();
    });
});
