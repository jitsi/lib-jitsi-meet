import Listenable from '../util/Listenable';

export const ERROR_FEATURE_VERSION_MISMATCH: "Feature version mismatch";

export default class Caps extends Listenable {
  constructor( connection?: Strophe.Connection, node?: string );
  addFeature: ( feature: string, submit?: boolean, external?: boolean ) => void;
  removeFeature: ( feature: string, submit?: boolean, external?: boolean ) => void;
  submit: () => void;
  getFeatures: ( jid: string, timeout?: number ) => Promise<Set<String> | Error>; // TODO: check the promise
  getFeaturesAndIdentities: ( jid: string, node: string, timeout?: number ) => Promise<Set<String> | Error>; // TODO: check the promise
}
