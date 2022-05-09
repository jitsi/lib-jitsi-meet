export default class ResumeTask {
  constructor( stropheConnection: Strophe.Connection );
  retryDelay: () => number | undefined;
  schedule: () => void;
  cancel: () => void;
}
