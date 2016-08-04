function NoopAnalytics() {}
NoopAnalytics.prototype.sendEvent = function () {};

// XXX Since we asynchronously load the integration of the analytics API and the
// analytics API may asynchronously load its implementation (e.g. Google
// Analytics), we cannot make the decision with respect to which analytics
// implementation we will use here and we have to postpone it i.e. we will make
// a lazy decision.

function AnalyticsAdapter() {}

AnalyticsAdapter.prototype.sendEvent = function ()
{
    var a = this.analytics;

    if (a === null || typeof a === 'undefined') {
        var AnalyticsImpl = window.Analytics || NoopAnalytics;

        this.analytics = a = new AnalyticsImpl();
    }
    try {
        a.sendEvent.apply(a, arguments);
    } catch (ignored) {}
};

module.exports = new AnalyticsAdapter();