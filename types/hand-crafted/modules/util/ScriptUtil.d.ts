export function loadScript(
    src: string,
    async: boolean,
    prepend: boolean,
    relativeURL: boolean,
    loadCallback: (ev: Event) => void,
    errorCallback: (
        event: string | Event,
        source?: string,
        lineno?: number,
        colno?: number,
        error?: Error,
    ) => void,
): void;
