import EventEmitter from '../../EventEmitter';
import JitsiLocalTrack from '../RTC/JitsiLocalTrack';

export type VADProcessor = {
  getRequiredPCMFrequency: () => number;
  getSampleLength: () => number;
  calculateAudioFrameVAD: ( samples: Array<unknown> ) => number; // TODO: work out what this is an array of
}

export default class TrackVADEmitter extends EventEmitter<unknown> {
  constructor( procNodeSampleRate: number, vadProcessor: VADProcessor, jitsiLocalTrack: JitsiLocalTrack );
  static create: ( micDeviceId: string, procNodeSampleRate: number, vadProcessor: VADProcessor ) => Promise<TrackVADEmitter>;
  getDeviceId: () => string;
  getTrackLabel: () => string;
  start: () => void;
  stop: () => void;
  destroy: () => void;
}
