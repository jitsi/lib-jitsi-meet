export default class ResumeTask {
  constructor( stropheConnection: Strophe.Connection );
  retryCount: () => number;
  schedule: () => void;
  cancel: () => void;
}
