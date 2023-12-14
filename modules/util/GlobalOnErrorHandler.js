/**
 * This utility class defines custom onerror and onunhandledrejection functions.
 * The custom error handlers respect the previously-defined error handlers.
 * GlobalOnErrorHandler class provides utilities to add many custom error
 * handlers and to execute the error handlers directly.
 */


/**
 * List with global error handlers that will be executed.
 */
const handlers = [];

// If an old handler exists, also fire its events.
const oldOnErrorHandler = window.onerror;

/**
 * Custom error handler that calls the old global error handler and executes
 * all handlers that were previously added.
 */
function JitsiGlobalErrorHandler(...args) {
    handlers.forEach(handler => handler(...args));
    oldOnErrorHandler && oldOnErrorHandler(...args);
}

// If an old handler exists, also fire its events.
const oldOnUnhandledRejection = window.onunhandledrejection;

/**
 * Custom handler that calls the old global handler and executes all handlers
 * that were previously added. This handler handles rejected Promises.
 */
function JitsiGlobalUnhandledRejection(event) {
    handlers.forEach(handler => handler(null, null, null, null, event.reason));
    oldOnUnhandledRejection && oldOnUnhandledRejection(event);
}

// Setting the custom error handlers.
window.onerror = JitsiGlobalErrorHandler;
window.onunhandledrejection = JitsiGlobalUnhandledRejection;

const GlobalOnErrorHandler = {
    /**
     * Adds new error handlers.
     * @param handler the new handler.
     */
    addHandler(handler) {
        handlers.push(handler);
    }
};


module.exports = GlobalOnErrorHandler;
