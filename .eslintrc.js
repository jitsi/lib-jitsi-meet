module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
        '@jitsi/eslint-config'
    ],
    plugins: [
        '@typescript-eslint'
    ],
    rules: {
        '@typescript-eslint/member-ordering': [
            'error',
            {
                default: [
                    'signature',
                    'private-static-field',
                    'protected-static-field',
                    'public-static-field',
                    'private-instance-field',
                    'protected-instance-field',
                    'public-instance-field',
                    'constructor',
                    'private-instance-method',
                    'protected-instance-method',
                    'public-instance-method'
                ]
            }
        ]
    }
};
