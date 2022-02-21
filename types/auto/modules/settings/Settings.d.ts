/// <reference path="../../../../modules/js-utils.d.ts" />
declare namespace _default {
    export { jitsiLocalStorage as _storage };
    /**
     * Initializes the Settings class.
     *
     * @param {Storage|undefined} externalStorage - Object that implements the Storage interface. This object will be
     * used for storing data instead of jitsiLocalStorage if specified.
     */
    export function init(externalStorage: Storage): void;
    /**
     * Initializes the Settings class.
     *
     * @param {Storage|undefined} externalStorage - Object that implements the Storage interface. This object will be
     * used for storing data instead of jitsiLocalStorage if specified.
     */
    export function init(externalStorage: Storage): void;
}
export default _default;
import { jitsiLocalStorage } from "@jitsi/js-utils";
