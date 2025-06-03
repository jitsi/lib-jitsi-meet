/**
 * Adapter that creates AudioContext objects depending on the browser.
 *
 * @returns {AudioContext | undefined} - Return a new AudioContext or undefined if the browser does not support it.
 */
export function createAudioContext(options?: AudioContextOptions): AudioContext | undefined {
    const AudioContextImpl = window.AudioContext || (window as any).webkitAudioContext;

    if (!AudioContextImpl) {
        return undefined;
    }

    return new AudioContextImpl(options);
}
