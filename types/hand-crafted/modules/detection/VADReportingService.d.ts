import { VADProcessor } from "./TrackVADEmitter";
import EventEmitter from '../../EventEmitter';

export default class VADReportingService extends EventEmitter<unknown> { // TODO:
  constructor( intervalDelay: number );
  static create: ( micDeviceList: MediaDeviceInfo[], intervalDelay: number, createVADProcessor: () => VADProcessor ) => Promise<VADReportingService>;
  destroy: () => void;
}
