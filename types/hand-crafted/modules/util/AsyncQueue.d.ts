export class ClearedQueueError extends Error {
  constructor();
}

export default class AsyncQueue {
  constructor();
  push: ( task: ( callback: ( err?: Error ) => void ) => void, callback?: ( err: Error ) => void ) => void; // TODO: check this
  clear: () => void;
  shutdown: () => void;
}
