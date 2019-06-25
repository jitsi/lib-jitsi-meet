import async from 'async';

/**
 * A queue for async task execution.
 */
export default class AsyncQueue {
    /**
     * Creates new instance.
     */
    constructor() {
        this.modificationQueue = async.queue(this._processQueueTasks.bind(this), 1);
        this.stopped = false;
    }

    /**
     * Internal task processing implementation which makes things work.
     */
    _processQueueTasks(task, finishedCallback) {
        task(finishedCallback);
    }

    /**
     * The 'workFunction' function will be given a callback it MUST call with either:
     *  1) No arguments if it was successful or
     *  2) An error argument if there was an error
     * If the task wants to process the success or failure of the task, it
     * should pass the {@code callback} to the push function, e.g.:
     * queue.push(task, (err) => {
     *     if (err) {
     *         // error handling
     *     } else {
     *         // success handling
     *     }
     * });
     *
     * @param {function} workFunction - The task to be execute. See the description above.
     * @param {function} [callback] - Optional callback to be called after the task has been executed.
     */
    push(workFunction, callback) {
        if (this.stopped) {
            callback && callback('The queue has been stopped');

            return;
        }
        this.modificationQueue.push(workFunction, callback);
    }

    /**
     * Shutdowns the queue. All already queued tasks will execute, but no future tasks can be added. If a task is added
     * after the queue has been shutdown then the callback will be called with an error.
     */
    shutdown() {
        this.stopped = true;
    }
}
