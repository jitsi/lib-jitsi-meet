/**
 * A TrackRecorder object holds all the information needed for recording a
 * single JitsiTrack (either remote or local)
 * @param track The JitsiTrack the object is going to hold
 */
export default class TrackRecorder {
    /**
     * @param track The JitsiTrack the object is going to hold
     */
    constructor(track: any);
    track: any;
    recorder: any;
    data: any;
    name: any;
    startTime: any;
}
