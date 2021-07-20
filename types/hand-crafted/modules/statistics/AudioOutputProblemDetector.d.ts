import JitsiConference from '../../JitsiConference';

export default class AudioOutputProblemDetector {
  constructor( conference: JitsiConference );
  dispose: () => void;
}
