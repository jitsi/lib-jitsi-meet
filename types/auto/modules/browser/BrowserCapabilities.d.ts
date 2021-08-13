/**
 * Implements browser capabilities for lib-jitsi-meet.
 */
export default class BrowserCapabilities {
    /**
     * Tells whether or not the <tt>MediaStream/tt> is removed from the <tt>PeerConnection</tt> and disposed on video
     * mute (in order to turn off the camera device). This is needed on Firefox because of the following bug
     * https://bugzilla.mozilla.org/show_bug.cgi?id=1735951
     *
     * @return {boolean} <tt>true</tt> if the current browser supports this strategy or <tt>false</tt> otherwise.
     */
    doesVideoMuteByStreamRemove(): boolean;
    /**
     * Checks if the current browser is Chromium based, i.e., it's either Chrome / Chromium or uses it as its engine,
     * but doesn't identify as Chrome.
     *
     * This includes the following browsers:
     * - Chrome and Chromium.
     * - Other browsers which use the Chrome engine, but are detected as Chrome, such as Brave and Vivaldi.
     * - Browsers which are NOT Chrome but use it as their engine, and have custom detection code: Opera, Electron
     *   and NW.JS.
     * This excludes
     * - Chrome on iOS since it uses WKWebView.
     */
    isChromiumBased(): boolean;
    /**
     * Checks if the current platform is iOS.
     *
     * @returns {boolean}
     */
    isIosBrowser(): boolean;
    /**
     * Checks if the current browser is WebKit based. It's either
     * Safari or uses WebKit as its engine.
     *
     * This includes Chrome and Firefox on iOS
     *
     * @returns {boolean}
     */
    isWebKitBased(): boolean;
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
     * Returns whether the browser is supported for Android
     * @returns {boolean} true if the browser is supported for Android devices
     */
    isSupportedAndroidBrowser(): boolean;
    /**
     * Returns whether the browser is supported for iOS
     * @returns {boolean} true if the browser is supported for iOS devices
     */
    isSupportedIOSBrowser(): boolean;
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
     * Returns true if VP9 is supported by the client on the browser. VP9 is currently disabled on Firefox and Safari
     * because of issues with rendering. Please check https://bugzilla.mozilla.org/show_bug.cgi?id=1492500,
     * https://bugs.webkit.org/show_bug.cgi?id=231071 and https://bugs.webkit.org/show_bug.cgi?id=231074 for details.
     */
    supportsVP9(): any;
    /**
     * Checks if the browser uses SDP munging for turning on simulcast.
     *
     * @returns {boolean}
     */
    usesSdpMungingForSimulcast(): boolean;
    /**
     * Checks if the browser uses webrtc-adapter. All browsers except React Native do.
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
     * Checks if the browser supports WebRTC Encoded Transform, an alternative
     * to insertable streams.
     *
     * NOTE: At the time of this writing the only browser supporting this is
     * Safari / WebKit, behind a flag.
     *
     * @returns {boolean} {@code true} if the browser supports it.
     */
    supportsEncodedTransform(): boolean;
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
     * Checks if the browser supports unified plan.
     *
     * @returns {boolean}
     */
    supportsUnifiedPlan(): boolean;
    /**
     * Checks if the browser supports voice activity detection via the @type {VADAudioAnalyser} service.
     *
     * @returns {boolean}
     */
    supportsVADDetection(): boolean;
    /**
     * Check if the browser supports the RTP RTX feature (and it is usable).
     *
     * @returns {boolean}
     */
    supportsRTX(): boolean;
    /**
     * Returns the version of a Chromium based browser.
     *
     * @returns {Number}
     */
    _getChromiumBasedVersion(): number;
    /**
     * Returns the version of a Safari browser.
     *
     * @returns {Number}
     */
    _getSafariVersion(): number;
    /**
     * Returns the version of an ios browser.
     *
     * @returns {Number}
     */
    _getIOSVersion(): number;
}
