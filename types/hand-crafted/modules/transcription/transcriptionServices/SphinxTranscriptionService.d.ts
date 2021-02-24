import Word from '../word';

export type SphinxService = {
  sendRequest: ( audioFileBlob: unknown, callback: ( params: unknown ) => unknown ) => void; // TODO:
  formatResponse: ( response: unknown ) => Word[]; // TODO:
  verify: ( response: unknown ) => boolean; // TODO:
}
