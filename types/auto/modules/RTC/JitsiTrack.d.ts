/// <reference types="node" />
/**
 * Represents a single media track (either audio or video).
 */
export default class JitsiTrack extends EventEmitter {
    /**
     * Represents a single media track (either audio or video).
     * @constructor
     * @param conference the rtc instance
     * @param stream the WebRTC MediaStream instance
     * @param track the WebRTC MediaStreamTrack instance, must be part of
     * the given <tt>stream</tt>.
     * @param streamInactiveHandler the function that will handle
     *        onended/oninactive events of the stream.
     * @param trackMediaType the media type of the JitsiTrack
     * @param videoType the VideoType for this track if any
     */
    constructor(conference: any, stream: any, track: any, streamInactiveHandler: any, trackMediaType: any, videoType: any);
    addEventListener: (eventName: string | symbol, listener: (...args: any[]) => void) => JitsiTrack;
    removeEventListener: (eventName: string | symbol, listener: (...args: any[]) => void) => JitsiTrack;
    /**
     * Array with the HTML elements that are displaying the streams.
     * @type {Array}
     */
    containers: any[];
    conference: any;
    audioLevel: number;
    type: any;
    track: any;
    videoType: any;
    handlers: Map<any, any>;
    /**
     * Indicates whether this JitsiTrack has been disposed. If true, this
     * JitsiTrack is to be considered unusable and operations involving it
     * are to fail (e.g. {@link JitsiConference#addTrack(JitsiTrack)},
     * {@link JitsiConference#removeTrack(JitsiTrack)}).
     * @type {boolean}
     */
    disposed: boolean;
    /**
     * The inactive handler which will be triggered when the underlying
     * <tt>MediaStream</tt> ends.
     *
     * @private
     * @type {Function}
     */
    private _streamInactiveHandler;
    /**
     * Adds onended/oninactive handler to a MediaStream or a MediaStreamTrack.
     * Firefox doesn't fire a inactive event on the MediaStream, instead it fires
     * a onended event on the MediaStreamTrack.
     * @param {Function} handler the handler
     */
    _addMediaStreamInactiveHandler(handler: Function): void;
    /**
     * Sets handler to the WebRTC MediaStream or MediaStreamTrack object
     * depending on the passed type.
     * @param {string} type the type of the handler that is going to be set
     * @param {Function} handler the handler.
     */
    _setHandler(type: string, handler: Function): void;
    /**
     * Unregisters all event handlers bound to the underlying media stream/track
     * @private
     */
    private _unregisterHandlers;
    /**
     * Sets the stream property of JitsiTrack object and sets all stored
     * handlers to it.
     *
     * @param {MediaStream} stream the new stream.
     * @protected
     */
    protected _setStream(stream: MediaStream): void;
    stream: any;
    /**
     * Returns the video type (camera or desktop) of this track.
     */
    getVideoType(): any;
    /**
     * Returns the type (audio or video) of this track.
     */
    getType(): any;
    /**
     * Check if this is an audio track.
     */
    isAudioTrack(): boolean;
    /**
     * Checks whether the underlying WebRTC <tt>MediaStreamTrack</tt> is muted
     * according to it's 'muted' field status.
     * @return {boolean} <tt>true</tt> if the underlying
     * <tt>MediaStreamTrack</tt> is muted or <tt>false</tt> otherwise.
     */
    isWebRTCTrackMuted(): boolean;
    /**
     * Check if this is a video track.
     */
    isVideoTrack(): boolean;
    /**
     * Checks whether this is a local track.
     * @abstract
     * @return {boolean} 'true' if it's a local track or 'false' otherwise.
     */
    isLocal(): boolean;
    /**
     * Check whether this is a local audio track.
     *
     * @return {boolean} -  true if track represents a local audio track, false otherwise.
     */
    isLocalAudioTrack(): boolean;
    /**
     * Returns the WebRTC MediaStream instance.
     */
    getOriginalStream(): any;
    /**
     * Returns the ID of the underlying WebRTC Media Stream(if any)
     * @returns {String|null}
     */
    getStreamId(): string | null;
    /**
     * Return the underlying WebRTC MediaStreamTrack
     * @returns {MediaStreamTrack}
     */
    getTrack(): MediaStreamTrack;
    /**
     * Return the underlying WebRTC MediaStreamTrack label
     * @returns {string}
     */
    getTrackLabel(): string;
    /**
     * Returns the ID of the underlying WebRTC MediaStreamTrack(if any)
     * @returns {String|null}
     */
    getTrackId(): string | null;
    /**
     * Return meaningful usage label for this track depending on it's media and
     * eventual video type.
     * @returns {string}
     */
    getUsageLabel(): string;
    /**
     * Eventually will trigger RTCEvents.TRACK_ATTACHED event.
     * @param container the video/audio container to which this stream is
     *        attached and for which event will be fired.
     * @private
     */
    private _maybeFireTrackAttached;
    /**
     * Attaches the MediaStream of this track to an HTML container.
     * Adds the container to the list of containers that are displaying the
     * track.
     *
     * @param container the HTML container which can be 'video' or 'audio'
     * element.
     *
     * @returns {void}
     */
    attach(container: any): void;
    /**
     * Removes this JitsiTrack from the passed HTML container.
     *
     * @param container the HTML container to detach from this JitsiTrack. If
     * <tt>null</tt> or <tt>undefined</tt>, all containers are removed. A
     * container can be a 'video', 'audio' or 'object' HTML element instance to
     * which this JitsiTrack is currently attached.
     */
    detach(container: any): void;
    /**
     * Called when the track has been attached to a new container.
     *
     * @param {HTMLElement} container the HTML container which can be 'video' or
     * 'audio' element.
     * @private
     */
    private _onTrackAttach;
    /**
     * Called when the track has been detached from a container.
     *
     * @param {HTMLElement} container the HTML container which can be 'video' or
     * 'audio' element.
     * @private
     */
    private _onTrackDetach;
    /**
     * Attach time to first media tracker only if there is conference and only
     * for the first element.
     *
     * @param {HTMLElement} container the HTML container which can be 'video' or
     * 'audio' element.
     * @private
     */
    private _attachTTFMTracker;
    /**
     * Removes attached event listeners.
     *
     * @returns {Promise}
     */
    dispose(): Promise<any>;
    /**
     * Returns true if this is a video track and the source of the video is a
     * screen capture as opposed to a camera.
     */
    isScreenSharing(): void;
    /**
     * Returns id of the track.
     * @returns {string|null} id of the track or null if this is fake track.
     */
    getId(): string | null;
    /**
     * Checks whether the MediaStream is active/not ended.
     * When there is no check for active we don't have information and so
     * will return that stream is active (in case of FF).
     * @returns {boolean} whether MediaStream is active.
     */
    isActive(): boolean;
    /**
     * Sets the audio level for the stream
     * @param {number} audioLevel value between 0 and 1
     * @param {TraceablePeerConnection} [tpc] the peerconnection instance which
     * is source for the audio level. It can be <tt>undefined</tt> for
     * a local track if the audio level was measured outside of the
     * peerconnection (see /modules/statistics/LocalStatsCollector.js).
     */
    setAudioLevel(audioLevel: number, tpc?: any): void;
    /**
     * Returns the msid of the stream attached to the JitsiTrack object or null
     * if no stream is attached.
     */
    getMSID(): string;
    /**
     * Sets new audio output device for track's DOM elements. Video tracks are
     * ignored.
     * @param {string} audioOutputDeviceId - id of 'audiooutput' device from
     *      navigator.mediaDevices.enumerateDevices(), '' for default device
     * @emits JitsiTrackEvents.TRACK_AUDIO_OUTPUT_CHANGED
     * @returns {Promise}
     */
    setAudioOutput(audioOutputDeviceId: string): Promise<any>;
}
import EventEmitter from "events";
