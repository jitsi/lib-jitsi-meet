export default class BridgeChannel {
  mode: () => null | "datachannel" | "websocket";
  close: () => void;
  isOpen: () => boolean;
  sendMessage: (to: string, payload: unknown) => void; // TODO:
  sendSetLastNMessage: (value: number) => void;
  sendSelectedEndpointsMessage: (endpointIds: string[]) => void;
  sendReceiverVideoConstraintMessage: (maxFrameHeightPixels: number) => void;
}
