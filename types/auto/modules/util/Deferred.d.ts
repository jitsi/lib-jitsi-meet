/**
 * Promise-like object which can be passed around for resolving it later. It
 * implements the "thenable" interface, so it can be used wherever a Promise
 * could be used.
 *
 * In addition a "reject on timeout" functionality is provided.
 */
export default class Deferred {
    promise: Promise<any>;
    resolve: (...args: any[]) => void;
    reject: (...args: any[]) => void;
    then: any;
    catch: any;
    /**
     * Clears the reject timeout.
     */
    clearRejectTimeout(): void;
    /**
     * Rejects the promise after the given timeout.
     */
    setRejectTimeout(ms: any): void;
    _timeout: NodeJS.Timeout;
}
