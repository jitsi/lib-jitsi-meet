/**
 * Promise-like object which can be passed around for resolving it later. It
 * implements the "thenable" interface, so it can be used wherever a Promise
 * could be used.
 *
 * In addition a "reject on timeout" functionality is provided.
 */
export default class Deferred<T = any> {
    private _timeout?: Timeout;
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
    then: Promise<T>['then'];
    catch: Promise<T>['catch'];

    /**
     * Instantiates a Deferred object.
     */
    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = (value: T | PromiseLike<T>) => {
                this.clearRejectTimeout();
                resolve(value);
            };
            this.reject = (reason?: any) => {
                this.clearRejectTimeout();
                reject(reason);
            };
        });
        this.then = this.promise.then.bind(this.promise);
        this.catch = this.promise.catch.bind(this.promise);
    }

    /**
     * Clears the reject timeout.
     */
    clearRejectTimeout(): void {
        clearTimeout(this._timeout);
    }

    /**
     * Rejects the promise after the given timeout.
     */
    setRejectTimeout(ms: number): void {
        this._timeout = setTimeout(() => {
            this.reject(new Error('timeout'));
        }, ms);
    }
}
