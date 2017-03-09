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

        'prefer-spread': 2,
        'require-yield': 2,
        'rest-spread-spacing': 2,
        'sort-imports': 0,
        'template-curly-spacing': 2,
        'yield-star-spacing': 2,

        'import/no-duplicates': 2
    }
};
