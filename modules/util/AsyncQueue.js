import async from 'async';

/**
 * A queue for async task execution.
 */
export default class AsyncQueue {
    /**
     * Creates new instance.
     */
    constructor() {
        this._queue = async.queue(this._processQueueTasks.bind(this), 1);
        this._stopped = false;
    }

    /**
     * Removes any pending tasks from the queue.
     */
    clear() {
        this._queue.kill();
    }

    /**
     * Internal task processing implementation which makes things work.
     */
    _processQueueTasks(task, finishedCallback) {
        task(finishedCallback);
    }

    /**
     * The 'task' function will be given a callback it MUST call with either:
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
     * @param {function} task - The task to be executed. See the description above.
     * @param {function} [callback] - Optional callback to be called after the task has been executed.
     */
    push(task, callback) {
        if (this._stopped) {
            callback && callback(new Error('The queue has been stopped'));

            return;
        }
        this._queue.push(task, callback);
    }

    /**
     * Shutdowns the queue. All already queued tasks will execute, but no future tasks can be added. If a task is added
     * after the queue has been shutdown then the callback will be called with an error.
     */
    shutdown() {
        this._stopped = true;
    }
}
