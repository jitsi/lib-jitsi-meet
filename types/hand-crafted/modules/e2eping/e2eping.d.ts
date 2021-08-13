import JitsiConference from '../../JitsiConference';
import JitsiParticipant from '../../JitsiParticipant';

declare type E2ePingOptions = {
  e2eping?: {
    pingInterval?: number;
    analyticsInterval?: number;
  }
}

declare type E2ePayload = {
  type: 'e2e-ping-request' | 'e2e-ping-response'
}

declare type E2eResponse = E2ePayload | {
  id: string
}

declare type E2eRequest = {
  id: string
}

export default class E2ePing {
  constructor( conference: JitsiConference, options: E2ePingOptions, sendMessage: ( response: E2eResponse, participant: string ) => void ); // TODO: jsdoc arguments are in the wrong order
  dataChannelOpened: () => void;
  messageReceived: ( participant: unknown, payload: unknown ) => void; // TODO:
  participantJoined: ( id: string, participant: JitsiParticipant ) => void;
  participantLeft: ( id: string ) => void;
  handleRequest: ( participantId: string, request: E2eRequest ) => void;
  handleResponse: ( participantId: string, response: unknown ) => void; // TODO:
  stop: () => void;
}
