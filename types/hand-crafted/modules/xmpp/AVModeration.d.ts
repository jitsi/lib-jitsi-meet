import { MediaType } from "../../service/RTC/MediaType";
import ChatRoom from "./ChatRoom";

export default class AVModeration {
  constructor(room: ChatRoom);
  /**
   * Whether AV moderation is supported on backend.
   */
  isSupported(): boolean;
  /**
   * Enables or disables AV Moderation by sending a msg with command to the component.
   */
  enable(state: string, mediaType: MediaType): void;
  /**
   * Approves that a participant can unmute by sending a msg with its jid to the component.
   */
  approve(mediaType: MediaType, jid: string): void;
}
