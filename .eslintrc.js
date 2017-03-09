module.exports = {
    'env': {
        'browser': true,
        'commonjs': true,
        'es6': true,
        'jasmine': true
    },
    'extends': 'eslint:recommended',
    'globals': {
        // The globals that (1) are accessed but not defined within many of our
        // files, (2) are certainly defined, and (3) we would like to use
        // without explicitly specifying them (using a comment) inside of our
        // files.
        '__filename': false
    },
    'parserOptions': {
        'ecmaFeatures': {
            'experimentalObjectRestSpread': true
        },
        'sourceType': 'module'
    },
    'rules': {
        'new-cap': 2,
        'no-console': 0,
        'semi': [ 'error', 'always' ]
    }
};
