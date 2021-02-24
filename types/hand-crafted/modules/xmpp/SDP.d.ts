export default function SDP( sdp: unknown ): void; // TODO:

export default class SDP {
  constructor( sdp: unknown ); // TODO:
  failICE: boolean;
  removeTcpCandidates: boolean;
  removeUdpCandidates: boolean;
  getMediaSsrcMap: () => unknown; // TODO:
  containsSSRC: ( ssrc: unknown ) => boolean; // TODO:
  toJingle: ( elem: unknown, thecreator: unknown ) => unknown; // TODO:
  transportToJingle: ( mediaindex: unknown, elem: unknown ) => unknown; // TODO:
  rtcpFbToJingle: ( mediaindex: unknown, elem: unknown, payloadtype: unknown ) => unknown; // TODO:
  rtcpFbFromJingle: ( elem: unknown, payloadtype: unknown ) => unknown; // TODO:
  fromJingle: ( jingle: unknown ) => unknown; // TODO:
  jingle2media: ( content: unknown ) => unknown; // TODO:
}
