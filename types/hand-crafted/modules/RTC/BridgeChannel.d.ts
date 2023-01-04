import { ReceiverVideoConstraints } from "../qualitycontrol/ReceiveVideoController";

export default class BridgeChannel {
  constructor( peerconnection: unknown, wsUrl: unknown, emitter: unknown ); // TODO:
  mode: () => null | "datachannel" | "websocket";
  close: () => void;
  isOpen: () => boolean;
  sendMessage: ( to: string, payload: unknown ) => void; // TODO:
  sendSetLastNMessage: ( value: number ) => void;
  sendEndpointStatsMessage: ( payload: unknown ) => void; // TODO:
  sendReceiverVideoConstraintsMessage: ( constraints: ReceiverVideoConstraints ) => void;
}
