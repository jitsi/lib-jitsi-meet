import JitsiTrack from '../RTC/JitsiTrack';

export default class Transcriber {
  start: () => void;
  stop: () => void;
  maybeMerge: () => void;
  merge: () => void;
  updateTranscription: ( word: string, name?: string ) => void;
  addTrack: ( track: JitsiTrack ) => void;
  removeTrack: ( track: JitsiTrack ) => void;
  getTranscription: () => string;
  getState: () => unknown; // TODO:
  reset: () => void;
}
