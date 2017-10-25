/* global __dirname */

const process = require('process');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
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
    plugins.push(new UglifyJsPlugin({
        cache: true,
        extractComments: true,
        parallel: true,
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
                    process.env.LIB_JITSI_MEET_COMMIT_HASH || 'development',
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
