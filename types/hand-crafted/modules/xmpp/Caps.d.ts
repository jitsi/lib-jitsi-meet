import Listenable from '../util/Listenable';

export const ERROR_FEATURE_VERSION_MISMATCH: "Feature version mismatch";

export default class Caps extends Listenable {
  constructor( connection?: Strophe.Connection, node?: string );
  parseDiscoInfo: ( node: string ) => { features: Set<string>, identities: Set<{ type: string, name: string, category: string }> }; // TODO: (string here is a jquery selector)
  addFeature: ( feature: string, submit?: boolean, external?: boolean ) => void;
  removeFeature: ( feature: string, submit?: boolean, external?: boolean ) => void;
  submit: () => void;
  getFeaturesAndIdentities: ( jid: string, node: string, timeout?: number ) => Promise<Set<string> | Error>; // TODO: check the promise
}
