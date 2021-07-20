import { VADScore } from "./VADNoiseDetection";
import EventEmitter from '../../EventEmitter';

export default class VADTalkMutedDetection extends EventEmitter<unknown> { // TODO:
  constructor();
  changeMuteState: ( isMuted: boolean ) => void;
  isActive: () => boolean;
  processVADScore: ( vadScore: VADScore ) => void;
  reset: () => void;
}
