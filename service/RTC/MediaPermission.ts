/**
 * The permission state of a capture device.
 */
export enum MediaPermissionState {

    /**
     * Access is blocked, a request fails without a prompt.
     */
    DENIED = 'denied',

    /**
     * Access is allowed.
     */
    GRANTED = 'granted',

    /**
     * A request shows the browser's permission prompt.
     */
    PROMPT = 'prompt'
}

/**
 * Why access to a capture device was denied.
 */
export enum PermissionDenialReason {

    /**
     * Blocked in the browser's site settings, no prompt was shown.
     */
    BROWSER = 'browser',

    /**
     * Blocked by the operating system's privacy settings.
     */
    OS = 'os',

    /**
     * Not allowed by the page's permissions policy, e.g. an iframe without {@code allow="camera; microphone"}. Only
     * the embedding page can change it.
     */
    POLICY = 'policy',

    /**
     * Denied or dismissed at the browser's prompt.
     */
    USER = 'user'
}

/**
 * The permission status of a capture device.
 */
export interface IPermissionStatus {
    reason?: PermissionDenialReason;
    state: MediaPermissionState;
}
