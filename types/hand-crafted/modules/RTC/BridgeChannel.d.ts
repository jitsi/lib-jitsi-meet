import { ReceiverVideoConstraints } from "../qualitycontrol/ReceiveVideoController";
import { EventEmitter } from "events";
import JitsiConference from '../../JitsiConference';

export default class BridgeChannel {
  constructor(
    peerconnection: RTCPeerConnection | null, 
    wsUrl: string | null, 
    emitter: EventEmitter, 
    conference: JitsiConference
  );
  
  mode: () => null | "datachannel" | "websocket";
  close: () => void;
  isOpen: () => boolean;
  sendMessage: (to: string, payload: Record<string, unknown>) => void;
  sendSetLastNMessage: (value: number) => void;
  sendEndpointStatsMessage: (payload: Record<string, unknown>) => void;
  sendReceiverVideoConstraintsMessage: (constraints: ReceiverVideoConstraints) => void;
}
