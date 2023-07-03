import JitsiConference from '../../JitsiConference';
import { CodecMimeType } from '../../service/RTC/CodecMimeType';

export class CodecSelection {
  constructor( conference: JitsiConference, options: { jvb: Object, p2p: Object } );  // TODO:
  getCodecPreferenceList: () => Array<CodecMimeType>;
}
