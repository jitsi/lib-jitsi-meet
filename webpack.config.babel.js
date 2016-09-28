/* global __dirname */

import child_process from 'child_process'; // eslint-disable-line camelcase
import process from 'process';

const minimize
    = process.argv.indexOf('-p') !== -1
        || process.argv.indexOf('--optimize-minimize') !== -1;

export default {
    devtool: 'source-map',
    entry: {
        'lib-jitsi-meet': './JitsiMeetJS.js'
    },
    module: {
        loaders: [ {
            // Version this build of the lib-jitsi-meet library.

            loader: 'string-replace',
            query: {
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
            loader: 'babel',
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
    }
};
