module.exports = {
    'env': {
        'browser': true,
        'commonjs': true,
        'es6': true,
        'jasmine': true
    },
    'extends': [
        'eslint:recommended',
        'plugin:flowtype/recommended'
    ],
    'globals': {
        // The globals that (1) are accessed but not defined within many of our
        // files, (2) are certainly defined, and (3) we would like to use
        // without explicitly specifying them (using a comment) inside of our
        // files.
        '__filename': false
    },
    'parser': 'babel-eslint',
    'parserOptions': {
        'ecmaFeatures': {
            'experimentalObjectRestSpread': true
        },
        'sourceType': 'module'
    },
    'plugins': [
        'flowtype',

        // ESLint's rule no-duplicate-imports does not understand Flow's import
        // type. Fortunately, eslint-plugin-import understands Flow's import
        // type.
        'import'
    ],
    'rules': {
        'new-cap': 2,
        'no-console': 0,
        'semi': [ 'error', 'always' ],

        // Possible Errors group
        'no-cond-assign': 2,
        'no-constant-condition': 2,
        'no-control-regex': 2,
        'no-debugger': 2,
        'no-dupe-args': 2,
        'no-duplicate-case': 2,
        'no-empty': 2,
        'no-empty-character-class': 2,
        'no-ex-assign': 2,
        'no-extra-boolean-cast': 2,
        'no-extra-parens': [
            'error',
            'all',
            { 'nestedBinaryExpressions': false }
        ],
        'no-extra-semi': 2,
        'no-func-assign': 2,
        'no-inner-declarations': 2,
        'no-invalid-regexp': 2,
        'no-irregular-whitespace': 2,
        'no-negated-in-lhs': 2,
        'no-obj-calls': 2,
        'no-prototype-builtins': 0,
        'no-regex-spaces': 2,
        'no-sparse-arrays': 2,
        'no-unexpected-multiline': 2,
        'no-unreachable': 2,
        'no-unsafe-finally': 2,
        'use-isnan': 2,

        'valid-typeof': 2,

        // Best Practices group
        'accessor-pairs': 0,
        'array-callback-return': 2,
        'block-scoped-var': 0,
        'complexity': 0,
        'consistent-return': 0,
        'curly': 2,

        // Stylistic issues group
        'brace-style': 2,
        'indent': [ 'error', 4, { 'SwitchCase': 0 } ],

        'prefer-const': 2,
        'prefer-reflect': 0,
        'prefer-spread': 2,
        'require-yield': 2,
        'rest-spread-spacing': 2,
        'sort-imports': 0,
        'template-curly-spacing': 2,
        'yield-star-spacing': 2,

        'import/no-duplicates': 2
    }
};
