
import * as JitsiConferenceEvents from '../../JitsiConferenceEvents';
import browser from '../browser';
import Listenable from '../util/Listenable';

import Statistics from './statistics';

/**
 * Mock object to be used in place of a real conference.
 *
 */
class MockConference extends Listenable {
    /**
     * constructor
     */
    constructor() {
        super();
        this.options = {
            config: {}
        };
    }
}

describe('PerformanceObserverStats', () => {
    let mockConference, statistics;

    beforeEach(() => {
        // works only on chrome.
        spyOn(browser, 'isChrome').and.returnValue(true);
        mockConference = new MockConference();
        Statistics.init({ longTasksStatsInterval: 1000 });
        statistics = new Statistics();
        jasmine.clock().install();
    });

    it('Conference events start/stop observer', () => {
        statistics.attachLongTasksStats(mockConference);
        const startObserverSpy = spyOn(statistics.performanceObserverStats, 'startObserver');
        const stopObserverSpy = spyOn(statistics.performanceObserverStats, 'stopObserver');

        mockConference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_JOINED);
        expect(startObserverSpy).toHaveBeenCalled();

        mockConference.eventEmitter.emit(JitsiConferenceEvents.CONFERENCE_LEFT);
        expect(stopObserverSpy).toHaveBeenCalled();
    });

    it('Emits long tasks stats every sec', () => {
        statistics.attachLongTasksStats(mockConference);
        statistics.performanceObserverStats.eventEmitter = {
            // eslint-disable-next-line no-empty-function
            emit: () => {}
        };
        statistics.performanceObserverStats.startObserver();
        const eventEmitSpy = spyOn(statistics.performanceObserverStats.eventEmitter, 'emit');

        expect(statistics.performanceObserverStats.getLongTasksStats()).toBeTruthy();
        expect(eventEmitSpy).not.toHaveBeenCalled();

        jasmine.clock().tick(1000);
        expect(eventEmitSpy).toHaveBeenCalled();
    });

    afterEach(() => {
        jasmine.clock().uninstall();
    });
});
