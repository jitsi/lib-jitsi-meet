module.exports = {
    parserOptions: {
        requireConfigFile: false
    },
    'extends': [
        '@jitsi/eslint-config',
        'plugin:prettier/recommended'
    ],
    plugins: ['prettier'],
    rules: {
        'prettier/prettier': 'error'
    }
};
