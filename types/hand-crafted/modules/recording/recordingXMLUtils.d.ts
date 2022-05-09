declare type RecordingXMLUtils = {
  getFocusRecordingUpdate: ( presence: Node ) => {
    error: string,
    initiator: string,
    recordingMode: string,
    sessionID: string,
    status: string
  };

  getHiddenDomainUpdate: ( presence: Node ) => {
    liveStreamViewURL: string,
    mode: string,
    sessionID: string
  };

  getSessionIdFromIq: ( response: Node ) => string;
  getSessionId: ( presence: Node ) => string;
  isFromFocus: ( presence: Node ) => boolean;
}

export default RecordingXMLUtils;