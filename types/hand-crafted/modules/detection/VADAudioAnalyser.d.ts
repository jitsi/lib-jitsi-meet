import { VADProcessor } from "./TrackVADEmitter";
import JitsiConference from '../../JitsiConference';
import EventEmitter from '../../EventEmitter';

export default class VADAudioAnalyser extends EventEmitter<unknown> { // TODO:
  constructor( conference: JitsiConference, createVADProcessor: () => VADProcessor );
  addVADDetectionService: ( vadService: unknown ) => void;
}
