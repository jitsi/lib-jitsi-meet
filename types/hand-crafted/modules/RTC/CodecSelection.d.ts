import JitsiConference from '../../JitsiConference';
import { CodecMimeType } from '../../service/RTC/CodecMimeType';

export class CodecSelection {
  constructor( conference: JitsiConference, options: { disabledCodec: string, enforcePreferredCodec: boolean, jvbCodec: string, p2pCodec: string } );  // TODO:
  getPreferredCodec: () => CodecMimeType;
}
