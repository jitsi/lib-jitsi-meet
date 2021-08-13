import JitsiConference from '../../JitsiConference';

export default class AvgRTPStatsReporter {
  constructor( conference: JitsiConference, n: number );
  dispose: () => void;
}
