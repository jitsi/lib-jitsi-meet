/**
 * A queue for async task execution.
 */
export default class AsyncQueue {
    _queue: import("async").QueueObject<any>;
    _stopped: boolean;
    /**
     * Removes any pending tasks from the queue.
     */
    clear(): void;
    /**
     * Internal task processing implementation which makes things work.
     */
    _processQueueTasks(task: any, finishedCallback: any): void;
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
    push(task: Function, callback?: Function): void;
    /**
     * Shutdowns the queue. All already queued tasks will execute, but no future tasks can be added. If a task is added
     * after the queue has been shutdown then the callback will be called with an error.
     */
    shutdown(): void;
}
