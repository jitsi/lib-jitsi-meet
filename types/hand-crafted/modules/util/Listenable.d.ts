import EventEmitter from '../../EventEmitter';

export default class Listenable {
  constructor( eventEmitter?: EventEmitter<unknown> ); // TODO:
  addListener: ( eventName: string, listener: () => unknown ) => () => unknown; // TODO: returns remote listener func
  removeListener: ( eventName: string, listener: () => unknown ) => void;
  on: (eventName: string, listener: (...args: any[]) => unknown) => unknown; // TODO: returns remote listener func
  off: (eventName: string, listener: (...args: any[]) => unknown) => void;
}
