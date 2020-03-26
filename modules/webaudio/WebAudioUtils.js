/**
 * Adapter that creates AudioContext objects depending on the browser.
 *
 * @returns {AudioContext} - Return a new AudioContext or undefined if the browser does not support it.
 */
export function createAudioContext(options) {
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextImpl) {
        return undefined;
    }

    return new AudioContextImpl(options);
}
