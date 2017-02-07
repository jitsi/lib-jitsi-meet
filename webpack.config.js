/* global __dirname */

var child_process = require('child_process'); // eslint-disable-line camelcase
var process = require('process');
var webpack = require('webpack');

var minimize
    = process.argv.indexOf('-p') !== -1
        || process.argv.indexOf('--optimize-minimize') !== -1;
var plugins = [];

if (minimize) {
    // While webpack will automatically insert UglifyJsPlugin when minimize is
    // true, the defaults of UglifyJsPlugin in webpack 1 and webpack 2 are
    // different. Explicitly state what we want even if we want defaults in
    // order to prepare for webpack 2.
    plugins.push(new webpack.optimize.UglifyJsPlugin({
        compress: {
            // It is nice to see warnings from UglifyJsPlugin that something is
            // unused and, consequently, is removed. The default is false in
            // webpack 2.
            warnings: true
        },

        // Use the source map to map error message locations to modules. The
        // default is false in webpack 2.
        sourceMap: true
    }));
}

module.exports = {
    devtool: 'source-map',
    entry: {
        'lib-jitsi-meet': './JitsiMeetJS.js'
    },
    module: {
        loaders: [ {
            // Version this build of the lib-jitsi-meet library.

            loader: 'string-replace-loader',
            query: {
                flags: 'g',
                replace:
                    child_process.execSync( // eslint-disable-line camelcase
                            __dirname + '/get-version.sh')

                        // The type of the return value of
                        // child_process.execSync is either Buffer or String.
                        .toString()

                            // Shells may automatically append CR and/or LF
                            // characters to the output.
                            .trim(),
                search: '{#COMMIT_HASH#}'
            },
            test: __dirname + '/JitsiMeetJS.js'
        }, {
            // Transpile ES2015 (aka ES6) to ES5.

            exclude: [
                __dirname + '/modules/RTC/adapter.screenshare.js',
                __dirname + '/node_modules/'
            ],
            loader: 'babel-loader',
            query: {
                presets: [
                    'es2015'
                ]
            },
            test: /\.js$/
        } ]
    },
    node: {
        // Allow the use of the real filename of the module being executed. By
        // default Webpack does not leak path-related information and provides a
        // value that is a mock (/index.js).
        __filename: true
    },
    output: {
        filename: '[name]' + (minimize ? '.min' : '') + '.js',
        library: 'JitsiMeetJS',
        libraryTarget: 'umd',
        sourceMapFilename: '[name].' + (minimize ? 'min' : 'js') + '.map'
    },
    plugins: plugins
};
