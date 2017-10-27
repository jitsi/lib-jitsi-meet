/* global __dirname */

const child_process = require('child_process'); // eslint-disable-line camelcase
const process = require('process');
const webpack = require('webpack');

const minimize
    = process.argv.indexOf('-p') !== -1
        || process.argv.indexOf('--optimize-minimize') !== -1;
const plugins = [
    new webpack.LoaderOptionsPlugin({
        debug: !minimize,
        minimize
    })
];

if (minimize) {
    plugins.push(new webpack.optimize.ModuleConcatenationPlugin());
    plugins.push(new webpack.optimize.UglifyJsPlugin({
        compress: {
            warnings: true
        },
        extractComments: true,
        sourceMap: true
    }));
}

module.exports = {
    devtool: 'source-map',
    entry: {
        'lib-jitsi-meet': './index.js'
    },
    module: {
        rules: [ {
            // Version this build of the lib-jitsi-meet library.

            loader: 'string-replace-loader',
            options: {
                flags: 'g',
                replace:
                    child_process.execSync( // eslint-disable-line camelcase
                        `${__dirname}/get-version.sh`)

                        // The type of the return value of
                        // child_process.execSync is either Buffer or String.
                        .toString()

                        // Shells may automatically append CR and/or LF
                        // characters to the output.
                        .trim(),
                search: '{#COMMIT_HASH#}'
            },
            test: `${__dirname}/JitsiMeetJS.js`
        }, {
            // Transpile ES2015 (aka ES6) to ES5.

            exclude: [
                `${__dirname}/modules/RTC/adapter.screenshare.js`,
                `${__dirname}/node_modules/`
            ],
            loader: 'babel-loader',
            options: {
                presets: [
                    [
                        'env',

                        // Tell babel to avoid compiling imports into CommonJS
                        // so that webpack may do tree shaking.
                        { modules: false }
                    ],
                    'stage-1'
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
        filename: `[name]${minimize ? '.min' : ''}.js`,
        library: 'JitsiMeetJS',
        libraryTarget: 'umd',
        sourceMapFilename: `[name].${minimize ? 'min' : 'js'}.map`
    },
    plugins
};
