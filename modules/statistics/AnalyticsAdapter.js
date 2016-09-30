var RTCBrowserType = require("../RTC/RTCBrowserType");

function NoopAnalytics() {}
NoopAnalytics.prototype.sendEvent = function () {};

function AnalyticsAdapter() {
    this.browserName = RTCBrowserType.getBrowserName();
}

// some events may happen before init or implementation script download
// in this case we accumulate them in this array and send them on init
AnalyticsAdapter.eventsQueue = [];

/**
 * Sends analytics event.
 * @param action
 * @param data
 * @param label
 */
AnalyticsAdapter.prototype.sendEvent = function (action, data, label) {
    if(this._checkAnalyticsAndMaybeCacheEvent(
        "sendEvent", action, data,label)) {
        try {
            this.analytics.sendEvent(action, data, label, this.browserName);
        } catch (ignored) { // eslint-disable-line no-empty
        }
    }
};

/**
 * Sends feedback.
 * @param {object} data with proprties:
 * - {int} overall an integer between 1 and 5 indicating the user feedback
 * - {string} detailed detailed feedback from the user.
 * @param label
 */
AnalyticsAdapter.prototype.sendFeedback = function (data, label) {
    if(this._checkAnalyticsAndMaybeCacheEvent(
        "sendFeedback", null, data,label)) {
        try {
            this.analytics.sendFeedback(data, label, this.browserName);
        } catch (ignored) { // eslint-disable-line no-empty
        }
    }

};

/**
 * Since we asynchronously load the integration of the analytics API and the
 * analytics API may asynchronously load its implementation (e.g. Google
 * Analytics), we cannot make the decision with respect to which analytics
 * implementation we will use here and we have to postpone it i.e. we will make
 * a lazy decision, will wait for loaded or dispose methods to be called.
 * in the meantime we accumulate any events received. We should call this
 * method before trying to send the event.
 * @param {string} method - Identifies which method should we use later for the
 * cached events - "sendEvent" or "sendFeedback".
 * @param action
 * @param data
 * @param label
 */
AnalyticsAdapter.prototype._checkAnalyticsAndMaybeCacheEvent
= function (method, action, data, label) {
    if (this.analytics === null || typeof this.analytics === 'undefined') {
        // missing this.analytics but have window implementation, let's use it
        if (window.Analytics) {
            this.loaded();
        }
        else {
            AnalyticsAdapter.eventsQueue.push({
                method: method,
                action: action,
                data: data,
                label: label
            });
            // stored, lets break here
            return false;
        }
    }
    return true;
};


/**
 * Dispose analytics. Clears any available queue element and sets
 * NoopAnalytics to be used.
 */
AnalyticsAdapter.prototype.dispose = function () {
    this.analytics = new NoopAnalytics();
    AnalyticsAdapter.eventsQueue.length = 0;
};

/**
 * Loaded analytics script. Sens queued events.
 */
AnalyticsAdapter.prototype.loaded = function () {
    var AnalyticsImpl = window.Analytics || NoopAnalytics;

    this.analytics = new AnalyticsImpl();

    // new analytics lets send all events if any
    if (AnalyticsAdapter.eventsQueue.length) {
        AnalyticsAdapter.eventsQueue.forEach(function (event) {
            switch(event.method) {
                case "sendEvent":
                    this.sendEvent(event.action, event.data, event.label);
                    break;
                case "sendFeedback":
                    this.sendFeedback(event.data, event.label);
                    break;
            }

        }.bind(this));
        AnalyticsAdapter.eventsQueue.length = 0;
    }
};

module.exports = new AnalyticsAdapter();
