/**
 * This utility class defines custom onerror and onunhandledrejection functions
 * The custom error handlers are respecting the previous defined error handlers
 * GlobalOnErrorHandler class provides utilities to add many custom error
 * handlers and to execute the error handlers directly.
 */


/**
 * List with global error handlers that will be executed.
 */
var handlers = [];

// if an old handler exists also fire its events
var oldOnErrorHandler = window.onerror;

/**
 * Custom error handler that calls the old global error handler and executes
 * all handlers that were previously added.
 */
function JitsiGlobalErrorHandler(message, source, lineno, colno, error) {
    handlers.forEach(function (handler) {
        handler(message, source, lineno, colno, error);
    });
    if (oldOnErrorHandler)
        oldOnErrorHandler(message, source, lineno, colno, error);
}

// if an old handler exists also fire its events
var oldOnUnhandledRejection = window.onunhandledrejection;

/**
 * Custom handler that calls the old global handler and executes
 * all handlers that were previously added. This handler handles rejected
 * Promises.
 */
function JitsiGlobalUnhandlerRejection(event) {
    handlers.forEach(function (handler) {
        handler(null, null, null, null, event.reason);
    });
    if(oldOnUnhandledRejection)
        oldOnUnhandledRejection(event);
}

//Setting the custom error handlers.
window.onerror = JitsiGlobalErrorHandler;
window.onunhandledrejection = JitsiGlobalUnhandlerRejection;


var GlobalOnErrorHandler = {
    /**
     * Adds new error handlers.
     * @param handler the new handler.
     */
    addHandler: function (handler) {
        handlers.push(handler);
    },
    /**
     * Calls the global error handler if there is one.
     * @param error the error that is going to be passed to the error handler
     */
    callErrorHandler: function (error) {
        var errHandler = window.onerror;
        if(!errHandler)
            return;
        errHandler.call(null, null, null, null, null, error);
    },
    /**
     * Calls the global rejection handler if there is one.
     * @param error the error that is going to be passed to the rejection
     * handler.
     */
    callUnhandlerRejectionHandler: function (error) {
        var errHandler = window.onunhandledrejection;
        if(!errHandler)
            return;
        errHandler.call(null, error);
    }
};


module.exports = GlobalOnErrorHandler;
