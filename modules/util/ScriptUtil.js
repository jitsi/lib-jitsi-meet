const currentExecutingScript = require('current-executing-script');

/* eslint-disable max-params */

/**
 * Implements utility functions which facilitate the dealing with scripts such
 * as the download and execution of a JavaScript file.
 */
const ScriptUtil = {
    /**
     * Loads a script from a specific source.
     *
     * @param src the source from the which the script is to be (down)loaded
     * @param async true to asynchronously load the script or false to
     * synchronously load the script
     * @param prepend true to schedule the loading of the script as soon as
     * possible or false to schedule the loading of the script at the end of the
     * scripts known at the time
     * @param relativeURL whether we need load the library from url relative
     * to the url that lib-jitsi-meet was loaded. Useful when sourcing the
     * library from different location than the app that is using it
     * @param loadCallback on load callback function
     * @param errorCallback callback to be called on error loading the script
     */
    loadScript(
            src,
            async,
            prepend,
            relativeURL,
            loadCallback,
            errorCallback) {
        const d = document;
        const tagName = 'script';
        const script = d.createElement(tagName);
        const referenceNode = d.getElementsByTagName(tagName)[0];

        script.async = async;

        if (relativeURL) {
            // finds the src url of the current loaded script
            // and use it as base of the src supplied argument
            const scriptEl = currentExecutingScript();

            if (scriptEl) {
                const scriptSrc = scriptEl.src;
                const baseScriptSrc
                    = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);

                if (scriptSrc && baseScriptSrc) {
                    // eslint-disable-next-line no-param-reassign
                    src = baseScriptSrc + src;
                }
            }
        }

        if (loadCallback) {
            script.onload = loadCallback;
        }
        if (errorCallback) {
            script.onerror = errorCallback;
        }

        script.src = src;
        if (prepend) {
            referenceNode.parentNode.insertBefore(script, referenceNode);
        } else {
            referenceNode.parentNode.appendChild(script);
        }
    }
};

/* eslint-enable max-params */

module.exports = ScriptUtil;
