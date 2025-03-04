module.exports = {
    parserOptions: {
        requireConfigFile: false
    },
    extends: [
        '@jitsi/eslint-config'
    ],
    rules: {
        "@typescript-eslint/no-import-type-only": ["error"],
        "logical-assignment-operators": ["error", "always"],
        "no-unused-private-class-members": ["error"],
        "no-useless-backreference": ["error"],
        "require-await": ["error"],
        "no-floating-promises": ["error"],
        "max-nested-callbacks": ["error", 4]
    }
};
