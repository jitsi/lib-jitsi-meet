module.exports = {
    parserOptions: {
        requireConfigFile: false
    },
    extends: [
        '@jitsi/eslint-config'
    ],
    rules: {
        "max-len": ["error", { "code": 120 }], // Limit line length to 120 characters
        "key-spacing": ["error", { "beforeColon": false, "afterColon": true }], // Enforce spacing in object keys
        "func-call-spacing": ["error", "never"], // No space between function name and parentheses
        "no-console": ["warn", { "allow": ["warn", "error"] }],
        "no-new": ["error"],
        "@typescript-eslint/no-import-type-only": ["error"],
        "logical-assignment-operators": ["error", "always"],
        "no-unused-private-class-members": ["error"],
        "no-useless-backreference": ["error"],
        "require-await": ["error"] 
    }
};
