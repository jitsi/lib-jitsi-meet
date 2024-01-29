import { getLogger } from '@jitsi/logger';
import { queue } from 'async-es';
import { AsyncResultCallback, QueueObject } from "async";

const logger = getLogger(__filename);

/**
 * Error to be passed to a callback of a queued task when the queue is cleared.
 */
export class ClearedQueueError extends Error {
    /**
     * Creates new instance.
     */
    constructor(message) {
        super(message);
        this.name = 'ClearedQueueError';
    }
}

export type QueueTask = (() => void) | (() => Promise<void>);

/**
 * A queue for async task execution.
 *
 * TODO replace AsyncQueue usage in JingleSessionPC with the new queue based on promises and delete the AsyncQueue.
 */
export default class AsyncQueue2 {
    private _queue: QueueObject<any>;
    private _stopped: boolean;
    private _taskCallbacks: Map<QueueTask, AsyncResultCallback<void>>;
    /**
     * Creates new instance.
     */
    constructor() {
        this._queue = queue(
            (task: QueueTask, callback: AsyncResultCallback<void>) => this._processQueueTasks(task, callback),
            1
        );
        this._stopped = false;
        this._taskCallbacks = new Map();
    }

    /**
     * Removes any pending tasks from the queue.
     * @param errorMsg - Optional error message that will be used as the ClearedQueueError's message passed to all tasks
     * that will be canceled by this clear operation.
     */
    clear(errorMsg?: string) {
        for (const finishedCallback of this._taskCallbacks.values()) {
            try {
                finishedCallback?.(new ClearedQueueError(errorMsg || 'The queue has been cleared'));
            } catch (error) {
                logger.error('Error in callback while clearing the queue:', error);
            }
        }
        this._queue.kill();
    }

    /**
     * Internal task processing implementation which makes things work.
     */
    async _processQueueTasks(task: QueueTask, finishedCallback: AsyncResultCallback<void>) {
        try {
            await task();
            finishedCallback();
        } catch (error) {
            finishedCallback(error);
        } finally {
            this._taskCallbacks.delete(task);
        }
    }

    /**
     * Pauses the execution of the tasks on the queue.
     */
    pause() {
        this._queue.pause();
    }

    /**
     * Schedules a task to be executed on the queue and returns a Promise that resolves when the task has completed, or
     * rejects either when the task has failed or when the queue has been shutdown before the task got a chance to
     * execute.
     *
     * @param {function} task - The task to be executed. Can be a regular function a return a promise in which case
     * there queue will wait for that promise to finish, before proceeding with the next task.
     */
    push(task: QueueTask ): Promise<void> {
        if (this._stopped) {
            throw new Error('The queue has been stopped');
        }

        return new Promise((resolve, reject) => {
            const callback = (error?: Error)  => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            };

            this._taskCallbacks.set(task, callback);
            this._queue.push(task, callback);
        });
    }

    /**
     * Resumes the execution of the tasks on the queue.
     */
    resume() {
        this._queue.resume();
    }

    /**
     * Shutdowns the queue. All already queued tasks will execute, but no future tasks can be added. If a task is added
     * after the queue has been shutdown then the callback will be called with an error.
     */
    shutdown() {
        this._stopped = true;
    }
}
