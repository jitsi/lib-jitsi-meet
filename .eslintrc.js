module.exports = {
    parserOptions: {
        requireConfigFile: false
    },
    extends: [
        '@jitsi/eslint-config'
    ],
    rules: {
        "no-unused-private-class-members": ["error"],
        "no-useless-backreference": ["error"],
        "require-await": ["error"],
        "max-nested-callbacks": ["error", 4]
    }
};
