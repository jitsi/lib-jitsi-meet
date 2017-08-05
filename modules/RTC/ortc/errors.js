/**
 * Create a class inheriting from Error.
 */
function createErrorClass(name) {
    const klass = class extends Error {
        /**
         * Custom error class constructor.
         * @param {string} message
         */
        constructor(message) {
            super(message);

            // Override `name` property value and make it non enumerable.
            Object.defineProperty(this, 'name', { value: name });
        }
    };

    return klass;
}

export const InvalidStateError = createErrorClass('InvalidStateError');
