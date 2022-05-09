import Word from '../word';
import RecordingResult from '../recordingResult';

export class TranscriptionService {
  send: ( recordingResult: RecordingResult, callback: ( params: unknown ) => unknown ) => void; // TODO:
  sendRequest: ( audioBlob: Blob, callback: ( params: unknown ) => unknown ) => void; // TODO:
  formatResponse: ( response: unknown ) => Word[]; // TODO:
  verify: ( response: unknown ) => boolean; // TODO:
}
