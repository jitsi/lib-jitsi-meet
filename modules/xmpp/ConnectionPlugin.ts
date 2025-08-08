import Listenable from '../util/Listenable';

/**
 * Creates ConnectionPlugin class that extends the passed class.
 * @param {Class} base the definition of the class that will be extended by
 * ConnectionPlugin
 */
function getConnectionPluginDefinition<T extends new (...args: any[]) => {}>(base: T = class {} as T) {
    /**
     * Base class for strophe connection plugins.
     */
    return class extends base {
        connection: Nullable<any>;
        /**
         *
         */
        constructor(...args: any[]) {
            super(...args);
            this.connection = null;
        }

        /**
         *
         * @param connection
         */
        init(connection: any): void {
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
export const ConnectionPluginListenable = getConnectionPluginDefinition(Listenable);
