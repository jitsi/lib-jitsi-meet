/* global __dirname */

const process = require('process');

const minimize
    = process.argv.indexOf('-p') !== -1
        || process.argv.indexOf('--optimize-minimize') !== -1;

const config = {
    devtool: 'source-map',
    mode: minimize ? 'production' : 'development',
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
                new RegExp(`${__dirname}/node_modules/(?!js-utils)`)
            ],
            loader: 'babel-loader',
            options: {
                presets: [
                    [
                        '@babel/preset-env',

                        // Tell babel to avoid compiling imports into CommonJS
                        // so that webpack may do tree shaking.
                        { modules: false }
                    ],
                    '@babel/preset-flow'
                ],
                plugins: [
                    '@babel/plugin-transform-flow-strip-types',
                    '@babel/plugin-proposal-class-properties',
                    '@babel/plugin-proposal-export-namespace-from'
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
    optimization: {
        concatenateModules: minimize
    },
    output: {
        filename: `[name]${minimize ? '.min' : ''}.js`,
        path: process.cwd(),
        sourceMapFilename: `[name].${minimize ? 'min' : 'js'}.map`
    }
};

module.exports = [
    Object.assign({}, config, {
        entry: {
            'lib-jitsi-meet': './index.js'
        },
        output: Object.assign({}, config.output, {
            library: 'JitsiMeetJS',
            libraryTarget: 'umd'
        })
    })
];
