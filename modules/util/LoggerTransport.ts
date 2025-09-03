
import Logger from '@jitsi/logger';
// Import the Logger constructor directly to access static properties
import LoggerConstructor from '@jitsi/logger/lib/Logger';

/**
 * Enhanced console transport that includes log levels in the output format
 */
export class EnhancedConsoleTransport {
    /**
     * The original console methods
     */
    private _originalConsole: Console;

    /**
     * Constructor
     */
    constructor(originalConsole?: Console) {
        this._originalConsole = originalConsole || console;
    }

    /**
     * Extracts the module name.
     *
     * @param {string} loggerId - logger ID.
     * @returns {string} module name.
     */
    private _extractModule(loggerId: string): string {
        if (!loggerId) {
            return 'unknown';
        }

        // Handle core components (no modules/ prefix)
        if (!loggerId.startsWith('modules/')) {
            // Core lib-jitsi-meet components
            if (loggerId.startsWith('Jitsi')) {
                return 'core';
            }
            // Service layer components
            if (loggerId.startsWith('service/')) {
                const serviceParts = loggerId.split('/');

                return serviceParts[1] || 'service';
            }

            return 'core';
        }

        // Extract module from modules/xxx/yyy path
        const parts = loggerId.split('/');

        if (parts.length >= 2 && parts[0] === 'modules') {
            return parts[1]; // Return the module name (e.g., 'statistics', 'RTC', 'xmpp')
        }

        return 'unknown';
    }

    /**
     * Extract component name from logger ID
     * Examples:
     * - 'modules/statistics/LocalStatsCollector' -> 'LocalStatsCollector'
     * - 'JitsiMeetJS' -> 'JitsiMeetJS'
     */
    private _extractComponent(loggerId: string): string {
        if (!loggerId) {
            return 'Unknown';
        }

        // For file paths, get the last part (filename without extension)
        const parts = loggerId.split('/');
        const filename = parts[parts.length - 1];

        // Remove file extension if present
        return filename.replace(/\.(js|ts)$/, '');
    }

    /**
     * Format log message with explicit log level and enhanced component info
     * @param level - Log level (trace, debug, info, log, warn, error)
     * @param args - Log arguments from @jitsi/logger
     * @returns Formatted arguments with log level and module info included
     */
    private _formatWithLevel(level: string, args: any[]): any[] {
        // Convert 'log' level to 'INFO' for consistency
        const normalizedLevel = level.toUpperCase() === 'LOG' ? 'INFO' : level.toUpperCase();

        // Extract timestamp (first argument from @jitsi/logger)
        const timestamp = args[0];

        // Find the component argument (should be in [ComponentName] format)
        let componentArgIndex = -1;
        let loggerId = '';

        for (let i = 1; i < args.length; i++) {
            const arg = args[i];

            if (typeof arg === 'string' && arg.startsWith('[') && arg.endsWith(']')) {
                componentArgIndex = i;
                loggerId = arg.slice(1, -1); // Remove brackets
                break;
            }
        }

        if (componentArgIndex === -1) {
            // Fallback: insert level after timestamp
            return [ timestamp, normalizedLevel, ...args.slice(1) ];
        }

        // Extract module and component information
        const module = this._extractModule(loggerId);
        const component = this._extractComponent(loggerId);

        // Create enhanced component format: [module:component]
        const enhancedComponent = module === 'core' ? `[${component}]` : `[${module}:${component}]`;

        // Rebuild args array with enhanced format
        const beforeComponent = args.slice(1, componentArgIndex);
        const afterComponent = args.slice(componentArgIndex + 1);

        return [ timestamp, normalizedLevel, ...beforeComponent, enhancedComponent, ...afterComponent ];
    }

    /**
     * Trace level logging
     */
    trace(...args: any[]): void {
        const formattedArgs = this._formatWithLevel('trace', args);

        this._originalConsole.trace(...formattedArgs);
    }

    /**
     * Debug level logging
     */
    debug(...args: any[]): void {
        const formattedArgs = this._formatWithLevel('debug', args);

        this._originalConsole.debug(...formattedArgs);
    }

    /**
     * Info level logging
     */
    info(...args: any[]): void {
        const formattedArgs = this._formatWithLevel('info', args);

        this._originalConsole.info(...formattedArgs);
    }

    /**
     * Log level logging (treated as INFO)
     */
    log(...args: any[]): void {
        const formattedArgs = this._formatWithLevel('log', args);

        this._originalConsole.log(...formattedArgs);
    }

    /**
     * Warn level logging
     */
    warn(...args: any[]): void {
        const formattedArgs = this._formatWithLevel('warn', args);

        this._originalConsole.warn(...formattedArgs);
    }

    /**
     * Error level logging
     */
    error(...args: any[]): void {
        const formattedArgs = this._formatWithLevel('error', args);

        this._originalConsole.error(...formattedArgs);
    }
}

// Store original console before any modifications
const originalConsole = {
    debug: console.debug.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    trace: console.trace.bind(console),
    warn: console.warn.bind(console)
};

/**
 * Default enhanced transport instance using original console methods
 */
export const enhancedConsoleTransport = new EnhancedConsoleTransport(originalConsole as any);

// Remove console transport - try multiple approaches
Logger.removeGlobalTransport(console);
Logger.removeGlobalTransport(LoggerConstructor.consoleTransport);

// TARGETED FIX: Override the specific console methods that the original transport uses
// This prevents the original transport from actually outputting anything
const originalConsoleMethods = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    trace: console.trace,
    warn: console.warn,
};

// Replace console methods with silent versions while preserving our enhanced transport
console.trace = function(...args: any[]) {
    // Check if this is being called from our enhanced transport
    const stack = new Error().stack || '';

    if (stack.includes('EnhancedConsoleTransport') || stack.includes('LoggerTransport')) {
        // Allow our enhanced transport to use original methods
        originalConsoleMethods.trace.apply(this, args);
    }
    // Silence all other console usage (including the original logger transport)
};

console.debug = function(...args: any[]) {
    const stack = new Error().stack || '';

    if (stack.includes('EnhancedConsoleTransport') || stack.includes('LoggerTransport')) {
        originalConsoleMethods.debug.apply(this, args);
    }
};

console.info = function(...args: any[]) {
    const stack = new Error().stack || '';

    if (stack.includes('EnhancedConsoleTransport') || stack.includes('LoggerTransport')) {
        originalConsoleMethods.info.apply(this, args);
    }
};

console.log = function(...args: any[]) {
    const stack = new Error().stack || '';

    if (stack.includes('EnhancedConsoleTransport') || stack.includes('LoggerTransport')) {
        originalConsoleMethods.log.apply(this, args);
    }
};

console.warn = function(...args: any[]) {
    const stack = new Error().stack || '';

    if (stack.includes('EnhancedConsoleTransport') || stack.includes('LoggerTransport')) {
        originalConsoleMethods.warn.apply(this, args);
    }
};

console.error = function(...args: any[]) {
    const stack = new Error().stack || '';

    if (stack.includes('EnhancedConsoleTransport') || stack.includes('LoggerTransport')) {
        originalConsoleMethods.error.apply(this, args);
    }
};

// Add our enhanced transport
Logger.addGlobalTransport(enhancedConsoleTransport);

// Store the original getLogger method
const originalGetLogger = Logger.getLogger;

// Override getLogger to ensure all new loggers use global transports only
Logger.getLogger = function(id?: string, transports?: any[], options?: any) {
    // Create logger without any local transports - it will use global transports only
    const logger = originalGetLogger.call(this, id, [], options);

    // Force empty local transports array to prevent duplication
    // The @jitsi/logger combines globalTransports.concat(logger.transports)
    logger.transports = [];

    return logger;
};
