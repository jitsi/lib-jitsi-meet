const { IgnorePlugin, ProvidePlugin } = require('webpack');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');


module.exports = (minimize, analyzeBundle) => {
    return {
        // The inline-source-map is used to allow debugging the unit tests with Karma
        devtool: minimize ? 'source-map' : 'inline-source-map',
        mode: minimize ? 'production' : 'development',
        module: {
            rules: [ {
                // Transpile ES2015 (aka ES6) to ES5.

                loader: 'babel-loader',
                options: {
                    presets: [
                        [
                            '@babel/preset-env',

                            // Tell babel to avoid compiling imports into CommonJS
                            // so that webpack may do tree shaking.
                            {
                                modules: false,

                                // Specify our target browsers so no transpiling is
                                // done unnecessarily. For browsers not specified
                                // here, the ES2015+ profile will be used.
                                targets: {
                                    chrome: 80,
                                    electron: 10,
                                    firefox: 68,
                                    safari: 14
                                }
                            }
                        ],
                        '@babel/preset-typescript'
                    ]
                },
                test: /\.(js|ts)$/
            } ]
        },
        optimization: {
            concatenateModules: minimize
        },
        output: {
            filename: `[name]${minimize ? '.min' : ''}.js`,
            sourceMapFilename: `[name].${minimize ? 'min' : 'js'}.map`
        },
        performance: {
            hints: minimize ? 'error' : false,
            maxAssetSize: 1.25 * 1024 * 1024,
            maxEntrypointSize: 1.25 * 1024 * 1024
        },
        plugins: [
            new IgnorePlugin({ resourceRegExp: /^(@xmldom\/xmldom|ws)$/ }),
            analyzeBundle
                && new BundleAnalyzerPlugin({
                    analyzerMode: 'disabled',
                    generateStatsFile: true
                }),
            !minimize
                && new ProvidePlugin({
                    process: require.resolve('process/browser')
                })
        ].filter(Boolean),
        resolve: {
            alias: {
                'jquery': require.resolve('jquery/dist/jquery.slim.min.js')
            },
            extensions: [ '', '.js', '.ts' ]
        }
    };
};
