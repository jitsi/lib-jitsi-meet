module.exports = {
    parserOptions: {
        requireConfigFile: false
    },
    extends: [
        '@jitsi/eslint-config'
    ],
    rules: {
        "indent": ["error", 2], // Enforce 2-space indentation
        "quotes": ["error", "single"], // Require single quotes
        "semi": ["error", "always"], // Require semicolons
        "space-before-function-paren": ["error", "never"], // No space before function parentheses
        "object-curly-spacing": ["error", "always"], // Require spaces inside object braces
        "comma-dangle": ["error", "never"], // No trailing commas
        "arrow-parens": ["error", "always"], // Require parentheses around arrow function arguments
        "max-len": ["error", { "code": 100 }], // Limit line length to 100 characters
        "no-multi-spaces": ["error"], // Disallow multiple spaces
        "key-spacing": ["error", { "beforeColon": false, "afterColon": true }], // Enforce spacing in object keys
        "array-bracket-spacing": ["error", "never"], // No spaces inside array brackets
        "no-trailing-spaces": "error", // Disallow trailing whitespace
        "func-call-spacing": ["error", "never"], // No space between function name and parentheses
        "no-var": "error", // Disallow 'var', use 'let' or 'const' instead
    }
};
