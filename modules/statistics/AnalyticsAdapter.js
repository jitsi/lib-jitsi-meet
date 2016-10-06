var RTCBrowserType = require("../RTC/RTCBrowserType");

function NoopAnalytics() {}
NoopAnalytics.prototype.sendEvent = function () {};

function AnalyticsAdapter() {
    this.browserName = RTCBrowserType.getBrowserName();
    /**
     * Map of properties that will be added to every event
     */
    this.permanentProperties = {};
}

// some events may happen before init or implementation script download
// in this case we accumulate them in this array and send them on init
AnalyticsAdapter.eventsQueue = [];

/**
 * Sends analytics event.
 * @param {String} action the name of the event
 * @param {Object} data can be any JSON object
 */
AnalyticsAdapter.prototype.sendEvent = function (action, data = {}) {
    if(this._checkAnalyticsAndMaybeCacheEvent(action, data)) {
        data.browserName = this.browserName;
        try {
            this.analytics.sendEvent(action,
                Object.assign({}, this.permanentProperties, data));
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
 * @param action
 * @param data
 */
AnalyticsAdapter.prototype._checkAnalyticsAndMaybeCacheEvent
= function (action, data) {
    if (this.analytics === null || typeof this.analytics === 'undefined') {
        // missing this.analytics but have window implementation, let's use it
        if (window.Analytics) {
            this.loaded();
        }
        else {
            AnalyticsAdapter.eventsQueue.push({
                action: action,
                data: data
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
 * Adds map of properties that will be added to every event.
 * @param {Object} properties the map of properties
 */
AnalyticsAdapter.prototype.addPermanentProperties = function (properties) {
    this.permanentProperties
        = Object.assign(this.permanentProperties, properties);
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
            this.sendEvent(event.action, event.data);
        }.bind(this));
        AnalyticsAdapter.eventsQueue.length = 0;
    }
};

module.exports = new AnalyticsAdapter();
