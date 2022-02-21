// these declarations are a work in progress and will be added to as declarations are required

declare module '@jitsi/logger' {
    type LoggerTransport = unknown;

    /**
     * Adds given {@link LoggerTransport} instance to the list of global
     * transports which means that it'll be used by all {@link Logger}s
     */
    const addGlobalTransport: ( transport: LoggerTransport ) => void;

    /**
     * Removes given {@link LoggerTransport} instance from the list of global
     * transports
     */
    const removeGlobalTransport: ( transport: LoggerTransport ) => void;

    /**
     * Sets global options which will be used by all loggers. Changing these
     * works even after other loggers are created.
     */
    const setGlobalOptions: ( options: unknown ) => void;

    /**
     * Creates new logger.
     * @arguments the same as Logger constructor
     */
    const getLogger: ( id: unknown, transports: unknown, options: unknown ) => Logger;

    /**
     * Changes the log level for the existing loggers by id.
     * @param level the new log level.
     * @param id if specified the level will be changed only for loggers with the
     * same id. Otherwise the operation will affect all loggers that don't
     * have id.
     */
    const setLogLevelById: ( level: unknown, id?: unknown ) => void;

    /**
     * Changes the log level for all existing loggers.
     * @param level the new log level.
     */
    const setLogLevel: ( level: unknown ) => void;

    /**
     * The supported log levels.
     */
    const levels: Logger.levels;

    /**
     * Exports the <tt>LogCollector</tt>.
     */
    const LogCollector: LogCollector;

    class Logger {
        const levels = {
            "trace": 0,
            "debug": 1,
            "info": 2,
            "log": 3,
            "warn": 4,
            "error": 5
        };

        /**
         *
         * Constructs new logger object.
         * @param level the logging level for the new logger
         * @param id optional identifier for the logger instance.
         * @param transports optional list of handlers(objects) for
         * the logs. The handlers must support - log, warn, error, debug, info, trace.
         * @param options optional configuration file for how the logger should behave.
         * @param options.disableCallerInfo Whether the call site of a logger
         * method invocation should be included in the log. Defaults to false, so the
         * call site will be included.
         */
        constructor( level: unknown, id?: unknown, transports?: unknown, options?: { disableCallerInfo?: boolean } );

        setLevel: ( level: unknown ) => void;

        addGlobalTransport: ( transport: LoggerTransport ) => void;
        removeGlobalTransport: ( transport: LoggerTransport ) => void;
        setGlobalOptions: ( options: unknown ) => void;

        info: ( msg: string ) => void;
    }

    class LogCollector {
        constructor( logStorage: unknown, options: unknown );
        stringify: ( someObject: unknown ) => string;
        formatLogMessage: ( logLevel: unknown /* timestamp, arg2, arg3, arg4... */ ) => string | null;
        start: () => void;
        flush: () => void;
        stop: () => void;
    }
}
