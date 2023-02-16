/* eslint-disable no-bitwise */
/* eslint-disable no-mixed-operators */

/**
 * Generates a SAS composed of decimal numbers.
 * Borrowed from the Matrix JS SDK.
 *
 * @param {Uint8Array} sasBytes - The bytes from sas.generate_bytes.
 * @returns Array<number>
 */
function generateDecimalSas(sasBytes) {
    /**
     *      +--------+--------+--------+--------+--------+
     *      | Byte 0 | Byte 1 | Byte 2 | Byte 3 | Byte 4 |
     *      +--------+--------+--------+--------+--------+
     * bits: 87654321 87654321 87654321 87654321 87654321
     *       \____________/\_____________/\____________/
     *         1st number    2nd number     3rd number
     */
    return [
        (sasBytes[0] << 5 | sasBytes[1] >> 3) + 1000,
        ((sasBytes[1] & 0x7) << 10 | sasBytes[2] << 2 | sasBytes[3] >> 6) + 1000,
        ((sasBytes[3] & 0x3f) << 7 | sasBytes[4] >> 1) + 1000
    ];
}

const emojiMapping = [
    [ '🐶', 'dog' ],
    [ '🐱', 'cat' ],
    [ '🦁', 'lion' ],
    [ '🐎', 'horse' ],
    [ '🦄', 'unicorn' ],
    [ '🐷', 'pig' ],
    [ '🐘', 'elephant' ],
    [ '🐰', 'rabbit' ],
    [ '🐼', 'panda' ],
    [ '🐓', 'rooster' ],
    [ '🐧', 'penguin' ],
    [ '🐢', 'turtle' ],
    [ '🐟', 'fish' ],
    [ '🐙', 'octopus' ],
    [ '🦋', 'butterfly' ],
    [ '🌷', 'flower' ],
    [ '🌳', 'tree' ],
    [ '🌵', 'cactus' ],
    [ '🍄', 'mushroom' ],
    [ '🌏', 'globe' ],
    [ '🌙', 'moon' ],
    [ '☁️', 'cloud' ],
    [ '🔥', 'fire' ],
    [ '🍌', 'banana' ],
    [ '🍎', 'apple' ],
    [ '🍓', 'strawberry' ],
    [ '🌽', 'corn' ],
    [ '🍕', 'pizza' ],
    [ '🎂', 'cake' ],
    [ '❤️', 'heart' ],
    [ '🙂', 'smiley' ],
    [ '🤖', 'robot' ],
    [ '🎩', 'hat' ],
    [ '👓', 'glasses' ],
    [ '🔧', 'spanner' ],
    [ '🎅', 'santa' ],
    [ '👍', 'thumbs up' ],
    [ '☂️', 'umbrella' ],
    [ '⌛', 'hourglass' ],
    [ '⏰', 'clock' ],
    [ '🎁', 'gift' ],
    [ '💡', 'light bulb' ],
    [ '📕', 'book' ],
    [ '✏️', 'pencil' ],
    [ '📎', 'paperclip' ],
    [ '✂️', 'scissors' ],
    [ '🔒', 'lock' ],
    [ '🔑', 'key' ],
    [ '🔨', 'hammer' ],
    [ '☎️', 'telephone' ],
    [ '🏁', 'flag' ],
    [ '🚂', 'train' ],
    [ '🚲', 'bicycle' ],
    [ '✈️', 'aeroplane' ],
    [ '🚀', 'rocket' ],
    [ '🏆', 'trophy' ],
    [ '⚽', 'ball' ],
    [ '🎸', 'guitar' ],
    [ '🎺', 'trumpet' ],
    [ '🔔', 'bell' ],
    [ '⚓️', 'anchor' ],
    [ '🎧', 'headphones' ],
    [ '📁', 'folder' ],
    [ '📌', 'pin' ]
];

/**
 * Generates a SAS composed of defimal numbers.
 * Borrowed from the Matrix JS SDK.
 *
 * @param {Uint8Array} sasBytes - The bytes from sas.generate_bytes.
 * @returns Array<number>
 */
function generateEmojiSas(sasBytes) {
    // Just like base64.
    const emojis = [
        sasBytes[0] >> 2,
        (sasBytes[0] & 0x3) << 4 | sasBytes[1] >> 4,
        (sasBytes[1] & 0xf) << 2 | sasBytes[2] >> 6,
        sasBytes[2] & 0x3f,
        sasBytes[3] >> 2,
        (sasBytes[3] & 0x3) << 4 | sasBytes[4] >> 4,
        (sasBytes[4] & 0xf) << 2 | sasBytes[5] >> 6
    ];

    return emojis.map(num => emojiMapping[num]);
}

const sasGenerators = {
    decimal: generateDecimalSas,
    emoji: generateEmojiSas
};

/**
 * Generates multiple SAS for the given bytes.
 *
 * @param {Uint8Array} sasBytes - The bytes from sas.generate_bytes.
 * @returns {object}
 */
export function generateSas(sasBytes) {
    const sas = {};

    for (const method in sasGenerators) {
        if (sasGenerators.hasOwnProperty(method)) {
            sas[method] = sasGenerators[method](sasBytes);
        }
    }

    return sas;
}
