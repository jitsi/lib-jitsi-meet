import EventEmitter from '../../EventEmitter';

export type VADScore = {
  timestamp: Date;
  score: number;
  pcmData: number[];
  deviceId: string;
}

declare class VADNoiseDetection extends EventEmitter<unknown> { // TODO:
  constructor();
  changeMuteState: ( isMuted: boolean ) => void;
  isActive: () => boolean;
  reset: () => void;
  processVADScore: ( vadScore: VADScore ) => void;
}
