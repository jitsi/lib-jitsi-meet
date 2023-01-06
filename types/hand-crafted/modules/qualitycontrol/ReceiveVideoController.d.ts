import JitsiConference from '../../JitsiConference';
import RTC from '../RTC/RTC';

export class ReceiverVideoConstraints {
  readonly constraints: unknown; // TODO:
  updateLastN: ( value: number ) => boolean;
  updateReceiveResolution: ( maxFrameHeight: number ) => boolean;
  updateReceiverVideoConstraints: ( videoConstraints: ReceiverVideoConstraints ) => boolean; // TODO:
}

export class ReceiveVideoController {
  constructor( conference: JitsiConference, rtc: RTC );
  getLastN: () => number;
  setLastN: ( value: number ) => void;
  setReceiverConstraints: ( constraints: ReceiverVideoConstraints ) => void;
}
