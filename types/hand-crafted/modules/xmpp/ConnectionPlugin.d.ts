import Listenable from '../util/Listenable';

export default class ConnectionPluginListenable extends Listenable {
  constructor( ...args: unknown[] ); // TODO:
  init: ( connection: unknown ) => void;
}

export function getConnectionPluginDefinition<T>( base: T ): T | ConnectionPluginListenable; // TODO:
