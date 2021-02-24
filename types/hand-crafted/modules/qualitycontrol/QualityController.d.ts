import JitsiConference from '../../JitsiConference';

export class QualityController {
  constructor( conference: JitsiConference );
  selectSendMaxFrameHeight: () => number | undefined;
  setPreferredReceiveMaxFrameHeight: ( maxFrameHeight: number | undefined ) => void;
  setPreferredSendMaxFrameHeight: ( maxFrameHeight: number ) => Promise<void[]>;
}
