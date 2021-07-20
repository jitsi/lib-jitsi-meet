/**
 * Implements browser capabilities for lib-jitsi-meet.
 */
export default class BrowserCapabilities {
    /**
     * Tells whether or not the <tt>MediaStream/tt> is removed from
     * the <tt>PeerConnection</tt> and disposed on video mute (in order to turn
     * off the camera device).
     * @return {boolean} <tt>true</tt> if the current browser supports this
     * strategy or <tt>false</tt> otherwise.
     */
    doesVideoMuteByStreamRemove(): boolean;
    /**
     * Check whether or not the current browser support peer to peer connections
     * @return {boolean} <tt>true</tt> if p2p is supported or <tt>false</tt>
     * otherwise.
     */
    supportsP2P(): boolean;
    /**
     * Checks if the current browser is Chromium based, that is, it's either
     * Chrome / Chromium or uses it as its engine, but doesn't identify as
     * Chrome.
     *
     * This includes the following browsers:
     * - Chrome and Chromium
     * - Other browsers which use the Chrome engine, but are detected as Chrome,
     *   such as Brave and Vivaldi
     * - Browsers which are NOT Chrome but use it as their engine, and have
     *   custom detection code: Opera, Electron and NW.JS
     */
    isChromiumBased(): any;
    /**
     * Checks whether current running context is a Trusted Web Application.
     *
     * @returns {boolean} Whether the current context is a TWA.
     */
    isTwa(): boolean;
    /**
     * Checks if the current browser is supported.
     *
     * @returns {boolean} true if the browser is supported, false otherwise.
     */
    isSupported(): boolean;
    /**
     * Returns whether or not the current environment needs a user interaction
     * with the page before any unmute can occur.
     *
     * @returns {boolean}
     */
    isUserInteractionRequiredForUnmute(): boolean;
    /**
     * Checks if the current browser triggers 'onmute'/'onunmute' events when
     * user's connection is interrupted and the video stops playback.
     * @returns {*|boolean} 'true' if the event is supported or 'false'
     * otherwise.
     */
    supportsVideoMuteOnConnInterrupted(): any | boolean;
    /**
     * Checks if the current browser reports upload and download bandwidth
     * statistics.
     * @return {boolean}
     */
    supportsBandwidthStatistics(): boolean;
    /**
     * Checks if the current browser supports setting codec preferences on the transceiver.
     * @returns {boolean}
     */
    supportsCodecPreferences(): boolean;
    /**
     * Checks if the current browser support the device change event.
     * @return {boolean}
     */
    supportsDeviceChangeEvent(): boolean;
    /**
     * Checks if the current browser supports RTT statistics for srflx local
     * candidates through the legacy getStats() API.
     */
    supportsLocalCandidateRttStatistics(): any;
    /**
     * Checks if the current browser supports the Long Tasks API that lets us observe
     * performance measurement events and be notified of tasks that take longer than
     * 50ms to execute on the main thread.
     */
    supportsPerformanceObserver(): boolean;
    /**
     * Checks if the current browser supports audio level stats on the receivers.
     */
    supportsReceiverStats(): boolean;
    /**
     * Checks if the current browser reports round trip time statistics for
     * the ICE candidate pair.
     * @return {boolean}
     */
    supportsRTTStatistics(): boolean;
    /**
     * Checks if the browser uses plan B.
     *
     * @returns {boolean}
     */
    usesPlanB(): boolean;
    /**
     * Checks if the browser uses SDP munging for turning on simulcast.
     *
     * @returns {boolean}
     */
    usesSdpMungingForSimulcast(): boolean;
    /**
     * Checks if the browser uses unified plan.
     *
     * @returns {boolean}
     */
    usesUnifiedPlan(): boolean;
    /**
     * Returns whether or not the current browser should be using the new
     * getUserMedia flow, which utilizes the adapter shim. This method should
     * be temporary and used while migrating all browsers to use adapter and
     * the new getUserMedia.
     *
     * @returns {boolean}
     */
    usesNewGumFlow(): boolean;
    /**
     * Checks if the browser uses webrtc-adapter. All browsers using the new
     * getUserMedia flow.
     *
     * @returns {boolean}
     */
    usesAdapter(): boolean;
    /**
     * Checks if the browser uses RIDs/MIDs for siganling the simulcast streams
     * to the bridge instead of the ssrcs.
     */
    usesRidsForSimulcast(): boolean;
    /**
     * Checks if the browser supports getDisplayMedia.
     * @returns {boolean} {@code true} if the browser supports getDisplayMedia.
     */
    supportsGetDisplayMedia(): boolean;
    /**
     * Checks if the browser supports insertable streams, needed for E2EE.
     * @returns {boolean} {@code true} if the browser supports insertable streams.
     */
    supportsInsertableStreams(): boolean;
    /**
     * Whether the browser supports the RED format for audio.
     */
    supportsAudioRed(): boolean;
    /**
     * Checks if the browser supports the "sdpSemantics" configuration option.
     * https://webrtc.org/web-apis/chrome/unified-plan/
     *
     * @returns {boolean}
     */
    supportsSdpSemantics(): boolean;
    /**
     * Returns the version of a Chromium based browser.
     *
     * @returns {Number}
     */
    _getChromiumBasedVersion(): number;
}
