import EventEmitter from '../../EventEmitter';

export default class Listenable {
  constructor( eventEmitter?: EventEmitter<unknown> ); // TODO:
  addListener: ( eventName: string, listener: () => unknown ) => () => unknown; // TODO: returns remote listener func
  removeListener: ( eventName: string, listener: () => unknown ) => void;
}
