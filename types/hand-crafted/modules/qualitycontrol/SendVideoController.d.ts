import JitsiConference from '../../JitsiConference';
import RTC from '../RTC/RTC';

export class SendVideoController {
  constructor( conference: JitsiConference, rtc: RTC );
  selectSendMaxFrameHeight: () => number | undefined;
  setPreferredSendMaxFrameHeight: ( maxFrameHeight: number ) => Promise<void[]>;
}
