module.exports = {
    extends: [
        '@jitsi/eslint-config'
    ],
    parser: '@typescript-eslint/parser',
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
        ],
        'sort-keys': [
            'error',
            'asc' // Sort in ascending order
        ]
    }
};
