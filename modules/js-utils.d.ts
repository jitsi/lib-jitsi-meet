// these declarations are a work in progress and will be added to as declarations are required

declare module '@jitsi/js-utils' {
    /**
     * Implements browser detection.
     */
    class BrowserDetection {
        constructor( browserInfo?: { name?: string; version?: string; } );

        /**
         * Gets current browser name.
         */
        getName: () => string;

        /**
         * Returns the version of the current browser.
         */
        getVersion: () => string;

        /**
         * Checks if current browser is Firefox.
         */
        isFirefox: () => boolean;

        /**
         * Checks if current browser is Chrome.
         */
        isChrome: () => boolean;

        /**
         * Checks if current environment is Electron.
         */
        isElectron: () => boolean;

        /**
         * Checks if current browser is Internet Explorer.
         */
        isIExplorer: () => boolean;

        /**
         * Checks if current environment is NWJS.
         */
        isNWJS: () => boolean;

        /**
         * Checks if current browser is Opera.
         */
        isOpera: () => boolean;

        /**
         * Checks if current browser is Safari.
         */
        isSafari: () => boolean;

        /**
         * Checks if current environment is React Native.
         */
        isReactNative: () => boolean;

        /**
         * Compares the passed version with the current browser version.
         *
         * @param version - The version to compare with. Anything different
         * than string will be converted to string.
         * @returns - Returns true if the current version is
         * greater than the passed version and false otherwise. Returns undefined if
         * the current browser version is unknown.
         */
        isVersionGreaterThan: ( version: string ) => boolean | undefined;

        /**
         * Compares the passed version with the current browser version.
         *
         * @param version - The version to compare with. Anything different
         * than string will be converted to string.
         * @returns - Returns true if the current version is
         * lower than the passed version and false otherwise. Returns undefined if
         * the current browser version is unknown.
         */
        isVersionLessThan: ( version: string ) => boolean | undefined;


        /**
         * Compares the passed version with the current browser version.
         *
         * @param version - The version to compare with. Anything different
         * than string will be converted to string.
         * @returns - Returns true if the current version is
         * equal to the passed version and false otherwise. Returns undefined if
         * the current browser version is unknown.
         * A loose-equality operator is used here so that it matches the sub-versions as well.
         */
        isVersionEqualTo: ( version: string ) => boolean | undefined;

        _bowser: { isEngine: ( engine: string ) => boolean };
    }

    /**
     * Wrapper class for browser's local storage object.
     */
    class jitsiLocalStorage extends EventEmitter {
        /**
         * @constructor
         */
        constructor();

        /**
         * Returns true if window.localStorage is disabled and false otherwise.
         *
         * @returns {boolean} - True if window.localStorage is disabled and false otherwise.
         */
        isLocalStorageDisabled: () => boolean;

        /**
         * Empties all keys out of the storage.
         */
        clear: () => void;

        /**
         * Returns the number of data items stored in the Storage object.
         *
         * @returns - The number of data items stored in the Storage object.
         */
        readonly length: number;

        /**
         * Returns that passed key's value.
         * @param keyName the name of the key you want to retrieve
         * the value of.
         * @returns the value of the key. If the key does not exist,
         * null is returned.
         */
        getItem: ( keyName: string ) => string | null;

        /**
         * Adds a key to the storage, or update key's value if it already exists.
         * @param keyName - the name of the key you want to create/update.
         * @param keyValue - the value you want to give the key you are
         * creating/updating.
         * @param dontEmitChangedEvent - If true a changed event won't be emitted.
         */
        setItem: ( keyName: string, keyValue: string, dontEmitChangedEvent: boolean = false ) => void;

        /**
         * Remove a key from the storage.
         * @param keyName the name of the key you want to remove.
         */
        removeItem: ( keyName: string ) => void;

        /**
         * Returns the name of the nth key in the list, or null if n is greater
         * than or equal to the number of key/value pairs in the object.
         *
         * @param i - The index of the key in the list.
         */
        key: ( i: number ) => string;

        /**
         * Serializes the content of the storage.
         *
         * @returns - The serialized content.
         */
        serialize: () => string;
    }
}
