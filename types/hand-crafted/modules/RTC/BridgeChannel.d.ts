import { ReceiverVideoConstraints } from "../qualitycontrol/ReceiveVideoController";
import { EventEmitter } from "events";
import JitsiConference from '../../JitsiConference';

// Defining these types as don't defined in modules/RTC/BridgeChannel.js
type SourceName = string;
type BridgeVideoType = "camera" | "desktop" | "presentation" | "other" | string;


export default class BridgeChannel {
  constructor(
    peerconnection: RTCPeerConnection | null, 
    wsUrl: string | null, 
    emitter: EventEmitter, 
    conference: JitsiConference
  );
  _initWebSocket:() => void;
  _startConnectionRetries : ()=> void;
  reload:()=>void;
  _stopConnectionRetries :()=>void;
  _retryWebSocketConnection: (closeEvent:CloseEvent) =>void;
  mode: () => null | "datachannel" | "websocket";
  close: () => void;
  isOpen: () => boolean;
  sendEndpointsMessage: (payload: Record<string, unknown>)=>void;
  sendMessage: (to: string, payload: Record<string, unknown>) => void;
  sendSetLastNMessage: (value: number) => void;
  sendEndpointStatsMessage: (payload: Record<string, unknown>) => void;
  sendReceiverVideoConstraintsMessage: (constraints: ReceiverVideoConstraints) => void;

  sendSourceVideoTypeMessage:(sourceName:SourceName, videoType: BridgeVideoType)=>void; 
  _handleChannel(channel: RTCDataChannel | WebSocket): void;
  onopen: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  _send:(jsonObject:Record<string,unknown>) => void;
}
