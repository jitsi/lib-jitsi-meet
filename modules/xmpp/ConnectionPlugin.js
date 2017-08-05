import Listenable from '../util/Listenable';

/**
 * Creates ConnectionPlugin class that extends the passed class.
 * @param {Class} base the definition of the class that will be extended by
 * ConnectionPlugin
 */
function getConnectionPluginDefinition(base = class {}) {
    /**
     * Base class for strophe connection plugins.
     */
    return class extends base {
        /**
         *
         */
        constructor(...args) {
            super(...args);
            this.connection = null;
        }

        /**
         *
         * @param connection
         */
        init(connection) {
            this.connection = connection;
        }
    };
}

/**
 * ConnectionPlugin class.
 */
export default getConnectionPluginDefinition();

/**
 * ConnectionPlugin class that extends Listenable.
 */
export const ConnectionPluginListenable
    = getConnectionPluginDefinition(Listenable);
