module.exports = {
    parserOptions: {
        requireConfigFile: false
    },
    'extends': [
        '@jitsi/eslint-config'
    ],
    'overrides': [
        {
            'files': [ '*.ts' ],
            extends: [ '@jitsi/eslint-config/typescript' ],
            parserOptions: {
                sourceType: 'module',
                project: [ 'tsconfig.json' ]
            },
            rules: {
                'no-continue': 0
            }
        }
    ]
};
