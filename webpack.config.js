const path = require('path');
const process = require('process');

const sharedConfig = require('./webpack-shared-config');

module.exports = (_env, argv) => {
    // Despite what whe docs say calling webpack with no arguments results in mode not being set.
    const mode = typeof argv.mode === 'undefined' ? 'production' : argv.mode;
    const config
        = sharedConfig(mode === 'production' /* minimize */, Boolean(process.env.ANALYZE_BUNDLE) /* analyzeBundle */);

    return [
        { ...config,
            entry: {
                'lib-jitsi-meet': './index.js'
            },
            output: { ...config.output,
                library: 'JitsiMeetJS',
                libraryTarget: 'umd',
                path: path.join(process.cwd(), 'dist', 'umd') } },
        {
            entry: {
                worker: './modules/e2ee/Worker.ts'
            },
            mode,
            module: config.module,
            optimization: {
                minimize: false
            },
            output: {
                filename: 'lib-jitsi-meet.e2ee-worker.js',
                path: path.join(process.cwd(), 'dist', 'umd')
            },
            resolve: config.resolve
        }
    ];
};
