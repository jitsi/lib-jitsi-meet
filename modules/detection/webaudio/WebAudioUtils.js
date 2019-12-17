/**
 * Adapter that creates AudioContext objects depending on the browser.
 *
 * @returns {AudioContext} - Return a new AudioContext or null if the browser does not support it.
 */
export function createAudioContext(options) {

    if (!window.AudioContext) {
        if (!window.webkitAudioContext) {
            return null;
        }

        window.AudioContext = window.webkitAudioContext;
    }


    return new AudioContext(options);
}
