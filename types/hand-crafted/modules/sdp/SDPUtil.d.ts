import SDP from './SDP';

export type SDPUtil = {
  filterSpecialChars: ( text: string ) => string;
  iceparams: ( mediadesc: unknown, sessiondesc: unknown ) => unknown; // TODO:
  parseICEUfrag: ( line: string ) => string;
  buildICEUfrag: ( frag: unknown ) => string; // TODO:
  parseICEPwd: ( line: string ) => string;
  buildICEPwd: ( pwd: unknown ) => string; // TODO:
  parseMID: ( line: string ) => string;
  parseMLine: ( line: string ) => unknown; // TODO:
  buildMLine: ( mline: unknown ) => string; // TODO:
  parseRTPMap: ( line: string ) => unknown; // TODO:
  parseSCTPMap: ( line: string ) => unknown[]; // TODO:
  buildRTPMap: ( el: unknown ) => string; // TODO:
  parseCrypto: ( line: string ) => unknown; // TODO:
  parseFingerprint: ( line: string ) => unknown; // TODO:
  parseFmtp: ( line: string ) => unknown; // TODO:
  parseICECandidate: ( line: string ) => unknown; // TODO:
  buildICECandidate: ( cand: unknown ) => unknown; // TODO:
  parseSSRC: ( desc: unknown ) => unknown; // TODO:
  parseRTCPFB: ( cand: unknown ) => unknown; // TODO:
  parseExtmap: ( cand: unknown ) => unknown; // TODO:
  findLine: ( haystack: string, needle: string, sessionpart?: string ) => boolean;
  findLines: ( haystack: string, needle: string, sessionpart?: string ) => string[];
  candidateToJingle: ( line: string ) => unknown; // TODO:
  candidateFromJingle: ( cand: unknown ) => unknown; // TODO:
  parsePrimaryVideoSsrc: ( videoMLine: unknown ) => number; // TODO:
  generateSsrc: () => number;
  getSsrcAttribute: ( mLine: unknown, ssrc: number, attributeName: string ) => string;
  parseGroupSsrcs: ( ssrcGroup: unknown ) => number[]; // TODO:
  getMedia: ( sdp: SDP, type: unknown ) => unknown; // TODO:
  getUfrag: ( sdp: SDP ) => string;
  preferCodec: ( mline: unknown, codecName: string ) => void; // TODO:
  stripCodec: ( mLine: unknown, codecName: string, highProfile?: boolean ) => void; // TODO:
}
