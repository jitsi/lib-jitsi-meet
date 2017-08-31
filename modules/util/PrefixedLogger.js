/**
 * Class adds prefix to each log message.
 */
export default class PrefixedLogger {

    /**
     * Create new <tt>PrefixedLogger</tt>
     * @param {Logger} logger
     * @param {string} prefix string which wil be added at the beginning of each
     * log message.
     */
    constructor(logger, prefix) {
        this.logger = logger;
        this.prefix = prefix;
    }

    /**
     * Logs on TRACE logging level.
     * @param text
     * @param args
     * @constructor
     */
    t(text, ...args) {
        this.logger.trace(`${this.prefix} ${text}`, args);
    }

    /**
     * Logs on DEBUG logging level.
     * @param text
     * @param args
     * @constructor
     */
    d(text, ...args) {
        this.logger.debug(`${this.prefix} ${text}`, args);
    }

    /**
     * Logs on INFO logging level.
     * @param text
     * @param args
     * @constructor
     */
    i(text, ...args) {
        this.logger.info(`${this.prefix} ${text}`, args);
    }

    /**
     * Logs on LOG logging level.
     * @param text
     * @param args
     * @constructor
     */
    l(text, ...args) {
        this.logger.log(`${this.prefix} ${text}`, args);
    }

    /**
     * Logs on WARN logging level.
     * @param text
     * @param args
     * @constructor
     */
    w(text, ...args) {
        this.logger.warn(`${this.prefix} ${text}`, args);
    }

    /**
     * Logs on ERROR logging level.
     * @param text
     * @param args
     * @constructor
     */
    e(text, ...args) {
        this.logger.error(`${this.prefix} ${text}`, args);
    }
}
