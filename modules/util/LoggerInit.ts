/**
 * Logger initialization module
 * This module sets up the enhanced logging transport and must be imported
 * before any other modules that create loggers.
 */

// Import LoggerTransport which will automatically replace the console transport
import './LoggerTransport';

// Ensure this runs by exporting a marker
export const LOGGER_INITIALIZED = true;
