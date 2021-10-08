// Karma configuration
// Generated on Wed Dec 07 2016 14:40:28 GMT-0800 (PST)

module.exports = function(config) {
    config.set({

        // base path that will be used to resolve all patterns (eg. files,
        // exclude)
        basePath: '',

        // frameworks to use
        // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
        frameworks: [ 'jasmine', 'webpack' ],

        // list of files / patterns to load in the browser
        files: [
            'https://code.jquery.com/jquery-3.5.1.min.js',
            'node_modules/core-js/index.js',
            './modules/**/*.spec.js'
        ],

        // list of files to exclude
        exclude: [
        ],

        // preprocess matching files before serving them to the browser
        // available preprocessors:
        //  https://npmjs.org/browse/keyword/karma-preprocessor
        preprocessors: {
            'node_modules/core-js/**': [ 'webpack' ],
            './**/*.spec.js': [ 'webpack', 'sourcemap' ]
        },

        // test results reporter to use
        // possible values: 'dots', 'progress'
        // available reporters: https://npmjs.org/browse/keyword/karma-reporter
        reporters: [ 'progress' ],

        // web server port
        port: 9876,

        // enable / disable colors in the output (reporters and logs)
        colors: true,

        // level of logging
        // possible values: config.LOG_DISABLE || config.LOG_ERROR ||
        //  config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
        logLevel: config.LOG_INFO,

        // enable / disable watching file and executing tests whenever
        // any file changes
        autoWatch: false,

        // start these browsers
        // available browser launchers:
        // https://npmjs.org/browse/keyword/karma-launcher
        browsers: [ 'ChromeHeadless' ],

        // Continuous Integration mode
        // if true, Karma captures browsers, runs the tests and exits
        singleRun: true,

        webpack: require('./webpack-shared-config')(false /* minimize */, false /* analyzeBundle */)
    });
};
