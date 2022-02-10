declare module '@jitsi/js-utils' {
    class BrowserDetection {
        getName: () => string;
        getVersion: () => string;
        isFirefox: () => boolean;
        isChrome: () => boolean;
        isElectron: () => boolean;
        isNWJS: () => boolean;
        isOpera: () => boolean;
        isSafari: () => boolean;
        isReactNative: () => boolean;
        isVersionLessThan: ( version: string ) => boolean;
        _bowser: { isEngine: ( engine: string ) => boolean };
    }
}
