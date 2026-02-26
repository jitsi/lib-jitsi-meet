import { getLogger } from '@jitsi/logger';
import { AsyncQueue as AsyncQueueType, queue } from 'async-es';

const logger = getLogger('utils:AsyncQueue');

/**
 * Error to be passed to a callback of a queued task when the queue is cleared.
 */
export class ClearedQueueError extends Error {
    /**
     * Creates new instance.
     */
    constructor(message: string) {
        super(message);
        this.name = 'ClearedQueueError';
    }
}

export type Task = (callback: (err?: Error) => void) => void;
export type TaskCallback = (err?: Error) => void;

/**
 * A queue for async task execution.
 */
export default class AsyncQueue {
    private _queue: AsyncQueueType<Task>;
    private _stopped: boolean;
    private _taskCallbacks: Map<Task, Optional<TaskCallback>>;

    /**
     * Creates new instance.
     */
    constructor() {
        this._queue = queue(this._processQueueTasks.bind(this), 1);
        this._stopped = false;
        this._taskCallbacks = new Map();
    }

    /**
     * Internal task processing implementation which makes things work.
     */
    private _processQueueTasks(task: Task, finishedCallback: TaskCallback): void {
        try {
            task(finishedCallback);
        } catch (error) {
            logger.error(`Task failed: ${error?.stack}`);
            finishedCallback(error);
        } finally {
            this._taskCallbacks.delete(task);
        }
    }

    /**
     * Removes any pending tasks from the queue.
     */
    clear(): void {
        for (const finishedCallback of this._taskCallbacks.values()) {
            try {
                finishedCallback?.(new ClearedQueueError('The queue has been cleared'));
            } catch (error) {
                logger.error('Error in callback while clearing the queue:', error);
            }
        }
        this._queue.kill();
    }

    /**
     * Pauses the execution of the tasks on the queue.
     */
    pause(): void {
        this._queue.pause();
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
     * @param {Task} task - The task to be executed. See the description above.
     * @param {TaskCallback} [callback] - Optional callback to be called after the task has been executed.
     */
    push(task: Task, callback?: TaskCallback): void {
        if (this._stopped) {
            callback && callback(new Error('The queue has been stopped'));

            return;
        }
        this._taskCallbacks.set(task, callback);
        this._queue.push(task, callback);
    }

    /**
     * Resumes the execution of the tasks on the queue.
     */
    resume(): void {
        this._queue.resume();
    }

    /**
     * Shutdowns the queue. All already queued tasks will execute, but no future tasks can be added. If a task is added
     * after the queue has been shutdown then the callback will be called with an error.
     */
    shutdown(): void {
        this._stopped = true;
    }
}
