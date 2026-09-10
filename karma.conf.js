// Karma configuration
// Generated on Wed Dec 07 2016 14:40:28 GMT-0800 (PST)

module.exports = function(config) {
    // Reuse the shared webpack config, but stub out Node core modules. Some browser libraries used
    // by the tests (e.g. the Olm build loaded by OlmAdapter.spec.js) contain guarded `require`s for
    // 'crypto'/'fs'/'path' that only run under Node; webpack 5 still tries to resolve them at build
    // time, so we resolve them to empty modules for the test bundle.
    const webpackConfig = require('./webpack-shared-config')(false /* minimize */, false /* analyzeBundle */);

    webpackConfig.resolve = webpackConfig.resolve || {};
    webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        crypto: false,
        fs: false,
        path: false
    };

    config.set({
        // enable / disable watching file and executing tests whenever
        // any file changes
        autoWatch: false,

        // base path that will be used to resolve all patterns (eg. files,
        // exclude)
        basePath: '',

        // start these browsers
        // available browser launchers:
        // https://npmjs.org/browse/keyword/karma-launcher
        browsers: [ 'ChromeHeadless' ],

        // enable / disable colors in the output (reporters and logs)
        colors: true,

        // list of files to exclude
        exclude: [
        ],

        // list of files / patterns to load in the browser
        files: [
            'node_modules/core-js/index.js',
            './modules/**/*.spec.js',
            './modules/**/*.spec.ts',
            './service/**/*.spec.ts',
            './*.spec.ts'
        ],

        // frameworks to use
        // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
        frameworks: [ 'jasmine', 'webpack' ],

        // level of logging
        // possible values: config.LOG_DISABLE || config.LOG_ERROR ||
        //  config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
        logLevel: config.LOG_INFO,

        // web server port
        port: 9876,

        // preprocess matching files before serving them to the browser
        // available preprocessors:
        //  https://npmjs.org/browse/keyword/karma-preprocessor
        preprocessors: {
            './**/*.spec.js': [ 'webpack', 'sourcemap' ],
            './**/*.spec.ts': [ 'webpack', 'sourcemap' ],
            'node_modules/core-js/**': [ 'webpack' ]
        },

        // test results reporter to use
        // possible values: 'dots', 'progress'
        // available reporters: https://npmjs.org/browse/keyword/karma-reporter
        reporters: [ 'progress' ],

        // Continuous Integration mode
        // if true, Karma captures browsers, runs the tests and exits
        singleRun: true,

        webpack: webpackConfig
    });
};
