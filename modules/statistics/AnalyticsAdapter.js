var RTCBrowserType = require("../RTC/RTCBrowserType");

function NoopAnalytics() {}
NoopAnalytics.prototype.sendEvent = function () {};

function AnalyticsAdapter() {
    this.browserActionSuffix = '.' + RTCBrowserType.getBrowserName();
}

// XXX Since we asynchronously load the integration of the analytics API and the
// analytics API may asynchronously load its implementation (e.g. Google
// Analytics), we cannot make the decision with respect to which analytics
// implementation we will use here and we have to postpone it i.e. we will make
// a lazy decision.
AnalyticsAdapter.prototype.sendEvent = function (action, data)
{
    if (this.analytics === null || typeof this.analytics === 'undefined') {
        var AnalyticsImpl = window.Analytics || NoopAnalytics;

        this.analytics = new AnalyticsImpl();
    }
    try {
        this.analytics.sendEvent(action + this.browserActionSuffix, data);
    } catch (ignored) {}
};

module.exports = new AnalyticsAdapter();