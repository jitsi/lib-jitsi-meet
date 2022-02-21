// these declarations are a work in progress and will be added to as declarations are required

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
