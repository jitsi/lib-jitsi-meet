export default class BridgeChannel {
  constructor( peerconnection: unknown, wsUrl: unknown, emitter: unknown ); // TODO:
  mode: () => null | "datachannel" | "websocket";
  close: () => void;
  isOpen: () => boolean;
  sendMessage: ( to: string, payload: unknown ) => void; // TODO:
  sendSetLastNMessage: ( value: number ) => void;
  sendSelectedEndpointsMessage: ( endpointIds: string[] ) => void;
  sendReceiverVideoConstraintMessage: ( maxFrameHeightPixels: number ) => void;
  sendEndpointStatsMessage: ( payload: unknown ) => void; // TODO:
  sendNewReceiverVideoConstraintsMessage: ( constraints: ReceiverVideoConstraints ) => void; // TODO:
  sendVideoTypeMessage: ( videoType: string ) => void;
}
