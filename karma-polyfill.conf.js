/**
 * Karma configuration for running tests with querySelector/querySelectorAll polyfill.
 * This configuration simulates a React Native environment where native querySelector
 * implementations are not available.
 *
 * The polyfill from @jitsi/js-utils is loaded before all tests via test-setup-polyfill.ts.
 */

module.exports = function(config) {
    // Load base configuration.
    const baseConfig = require('./karma.conf.js');

    baseConfig(config);

    // Extend the files array to include polyfill setup BEFORE all tests.
    const files = [
        'node_modules/core-js/index.js',
        './test-setup-polyfill.ts', // Load polyfill setup first.
        './modules/**/*.spec.js',
        './modules/**/*.spec.ts',
        './service/**/*.spec.ts',
        './*.spec.ts'
    ];

    // Extend preprocessors to include the polyfill setup file.
    const preprocessors = {
        './**/*.spec.js': [ 'webpack', 'sourcemap' ],
        './**/*.spec.ts': [ 'webpack', 'sourcemap' ],
        './test-setup-polyfill.ts': [ 'webpack', 'sourcemap' ],
        'node_modules/core-js/**': [ 'webpack' ]
    };

    // Customize browser name for clarity in output.
    const customLaunchers = {
        ChromeHeadlessPolyfill: {
            base: 'ChromeHeadless',
            displayName: 'Chrome Headless (Polyfill)'
        }
    };

    // Update configuration with polyfill-specific settings.
    config.set({
        browsers: [ 'ChromeHeadlessPolyfill' ],
        customLaunchers,
        files,
        preprocessors
    });
};
