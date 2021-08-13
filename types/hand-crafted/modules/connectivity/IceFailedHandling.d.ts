import JitsiConference from "../../JitsiConference";

export default class IceFailedHandling {
  constructor( conference: JitsiConference );
  start: () => void;
  cancel: () => void;
}
