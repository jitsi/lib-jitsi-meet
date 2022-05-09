import JitsiParticipant from '../../JitsiParticipant';
import Jibri from './recordingConstants';

export default class JibriSession {
  constructor( options?: {
    connection: unknown, // TODO:
    mode: unknown, // TODO:
    sessionID: unknown, // TODO:
    status: unknown // TODO:
  } );
  getError: () => Jibri.error | undefined;
  getID: () => string | undefined;
  getInitiator: () => JitsiParticipant | string;
  getLiveStreamViewURL: () => string | undefined;
  getStatus: () => Jibri.status | undefined;
  getTerminator: () => JitsiParticipant | string;
  getMode: () => Jibri.mode;
  setError: ( error: Jibri.error ) => void;
  setLiveStreamViewURL: ( url: string ) => void;
  setStatus: ( status: Jibri.status ) => void;
  setInitiator: ( participant: JitsiParticipant | string ) => void;
  setTerminator: ( participant: JitsiParticipant | string ) => void;
}
