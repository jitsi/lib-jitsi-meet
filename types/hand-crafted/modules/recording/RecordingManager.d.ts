import ChatRoom from '../xmpp/ChatRoom';
import JibriSession from './JibriSession';
import Jibri from './recordingConstants';

export default class RecordingManager {
  constructor( chatRoom: ChatRoom ); // TODO: jsdocs says return type is void
  getSession: ( sessionID: string ) => JibriSession | undefined;
  onPresence: ( { fromHiddenDomain: Node, presence: boolean } ) => void;
  startRecording: ( options: { appData: string, broadcastId?: string, mode: Jibri.mode, streamId?: string } ) => Promise<unknown>;
  stopRecording: ( sessionID: string ) => Promise<unknown>;
}
