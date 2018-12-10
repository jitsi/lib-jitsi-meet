import { getLogger } from 'jitsi-meet-logger';
import { BrowserDetection } from 'js-utils';

const logger = getLogger(__filename);

// TODO: Move this code to js-utils.

// NOTE: Now we are extending BrowserDetection in order to preserve
// RTCBrowserType interface but maybe it worth exporting BrowserCapabilities
// and BrowserDetection as separate objects in future.

/**
 * Implements browser capabilities for lib-jitsi-meet.
 */
export default class BrowserCapabilities extends BrowserDetection {
    /**
     * Creates new BrowserCapabilities instance.
     */
    constructor() {
        super();
        logger.info(
            `This appears to be ${this.getName()}, ver: ${this.getVersion()}`);
    }

    /**
     * Tells whether or not the <tt>MediaStream/tt> is removed from
     * the <tt>PeerConnection</tt> and disposed on video mute (in order to turn
     * off the camera device).
     * @return {boolean} <tt>true</tt> if the current browser supports this
     * strategy or <tt>false</tt> otherwise.
     */
    doesVideoMuteByStreamRemove() {
        return !(
            this.isFirefox()
            || this.isEdge()
            || this.isReactNative()
            || this.isSafariWithWebrtc()
        );
    }

    /**
     * Check whether or not the current browser support peer to peer connections
     * @return {boolean} <tt>true</tt> if p2p is supported or <tt>false</tt>
     * otherwise.
     */
    supportsP2P() {
        return !this.isEdge() && !this.isFirefox();
    }

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
    isChromiumBased() {
        return this.isChrome()
            || this.isElectron()
            || this.isNWJS()
            || this.isOpera();
    }

    /**
     * Checks if current browser is a Safari and a version of Safari that
     * supports native webrtc.
     *
     * @returns {boolean}
     */
    isSafariWithWebrtc() {
        return this.isSafari()
            && !this.isVersionLessThan('11');
    }

    /**
     * Checks if the current browser is supported.
     *
     * @returns {boolean} true if the browser is supported, false otherwise.
     */
    isSupported() {
        return this.isChromiumBased()
            || this.isEdge()
            || this.isFirefox()
            || this.isReactNative()
            || this.isSafariWithWebrtc();
    }

    /**
     * Checks if the current browser triggers 'onmute'/'onunmute' events when
     * user's connection is interrupted and the video stops playback.
     * @returns {*|boolean} 'true' if the event is supported or 'false'
     * otherwise.
     */
    supportsVideoMuteOnConnInterrupted() {
        return this.isChromiumBased() || this.isReactNative();
    }

    /**
     * Checks if the current browser reports upload and download bandwidth
     * statistics.
     * @return {boolean}
     */
    supportsBandwidthStatistics() {
        // FIXME bandwidth stats are currently not implemented for FF on our
        // side, but not sure if not possible ?
        return !this.isFirefox() && !this.isEdge()
            && !this.isSafariWithWebrtc();
    }

    /**
     * Checks if the current browser supports WebRTC datachannels.
     * @return {boolean}
     */
    supportsDataChannels() {
        // NOTE: Edge does not yet implement DataChannel.
        return !this.isEdge();
    }

    /**
     * Checks if the current browser support the device change event.
     * @return {boolean}
     */
    supportsDeviceChangeEvent() {
        return navigator.mediaDevices
            && typeof navigator.mediaDevices.ondevicechange !== 'undefined'
            && typeof navigator.mediaDevices.addEventListener !== 'undefined';
    }

    /**
     * Checks if the current browser supports the MediaStream constructor as
     * defined by https://www.w3.org/TR/mediacapture-streams/#constructors. In
     * cases where there is no support, it maybe be necessary to get audio
     * and video in two distinct GUM calls.
     * @return {boolean}
     */
    supportsMediaStreamConstructor() {
        return !this.isReactNative();
    }

    /**
     * Checks if the current browser supports RTP statictics collecting.
     * Required by {@link RTPStatsCollector}.
     *
     * @returns {boolean} true if they are supported, false otherwise.
     */
    supportsRtpStatistics() {
        return this.isChromiumBased()
            || this.isEdge()
            || this.isFirefox()
            || this.isReactNative()
            || this.isSafariWithWebrtc();
    }

    /**
     * Checks if the current browser supports RTT statistics for srflx local
     * candidates through the legacy getStats() API.
     */
    supportsLocalCandidateRttStatistics() {
        return this.isChromiumBased() || this.isReactNative();
    }

    /**
     * Checks if the current browser reports round trip time statistics for
     * the ICE candidate pair.
     * @return {boolean}
     */
    supportsRTTStatistics() {
        // Firefox does not seem to report RTT for ICE candidate pair:
        // eslint-disable-next-line max-len
        // https://www.w3.org/TR/webrtc-stats/#dom-rtcicecandidatepairstats-currentroundtriptime
        // It does report mozRTT for RTP streams, but at the time of this
        // writing it's value does not make sense most of the time
        // (is reported as 1):
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1241066
        // For Chrome and others we rely on 'googRtt'.
        return !this.isFirefox() && !this.isEdge();
    }

    /**
     * Checks whether the browser supports RTPSender.
     *
     * @returns {boolean}
     */
    supportsRtpSender() {
        return this.isFirefox();
    }

    /**
     * Checks whether the browser supports RTX.
     *
     * @returns {boolean}
     */
    supportsRtx() {
        return !this.isFirefox();
    }

    /**
     * Whether jitsi-meet supports simulcast on the current browser.
     * @returns {boolean}
     */
    supportsSimulcast() {
        return this.isChromiumBased()
            || this.isFirefox() || this.isReactNative();
    }

    /**
     * Returns whether or not the current browser can support capturing video,
     * be it camera or desktop, and displaying received video.
     *
     * @returns {boolean}
     */
    supportsVideo() {
        // FIXME: Check if we can use supportsVideoOut and supportsVideoIn. I
        // leave the old implementation here in order not to brake something.

        // Currently Safari using webrtc/adapter does not support video due in
        // part to Safari only supporting H264 and the bridge sending VP8.
        return !this.isSafariWithWebrtc();
    }

    /**
     * Checks if the browser uses plan B.
     *
     * @returns {boolean}
     */
    usesPlanB() {
        return !this.usesUnifiedPlan();
    }

    /**
     * Checks if the browser uses unified plan.
     *
     * @returns {boolean}
     */
    usesUnifiedPlan() {
        return this.isFirefox();
    }

    /**
     * Returns whether or not the current browser should be using the new
     * getUserMedia flow, which utilizes the adapter shim. This method should
     * be temporary and used while migrating all browsers to use adapter and
     * the new getUserMedia.
     *
     * @returns {boolean}
     */
    usesNewGumFlow() {
        const REQUIRED_CHROME_VERSION = 61;

        if (this.isChrome()) {
            return !this.isVersionLessThan(REQUIRED_CHROME_VERSION);
        }

        if (this.isFirefox() || this.isSafariWithWebrtc()) {
            return true;
        }

        if (this.isChromiumBased()) {
            return this._getChromiumBasedVersion() >= REQUIRED_CHROME_VERSION;
        }

        return false;
    }

    /**
     * Checks if the browser uses webrtc-adapter. All browsers using the new
     * getUserMedia flow and Edge.
     *
     * @returns {boolean}
     */
    usesAdapter() {
        return this.usesNewGumFlow() || this.isEdge();
    }

    /**
     * Checks if the browser supposrts getDisplayMedia.
     * @returns {boolean} {@code true} if the browser supposrts getDisplayMedia.
     */
    supportsGetDisplayMedia() {
        return navigator.mediaDevices
            && navigator.mediaDevices.getDisplayMedia !== undefined;
    }

    /**
     * Checks if the browser supports the "sdpSemantics" configuration option.
     * https://webrtc.org/web-apis/chrome/unified-plan/
     *
     * @returns {boolean}
     */
    supportsSdpSemantics() {
        return this.isChromiumBased() && this._getChromiumBasedVersion() >= 65;
    }

    /**
     * Returns the version of a Chromium based browser.
     *
     * @returns {Number}
     */
    _getChromiumBasedVersion() {
        if (this.isChromiumBased()) {
            // NW.JS doesn't expose the Chrome version in the UA string.
            if (this.isNWJS()) {
                // eslint-disable-next-line no-undef
                return Number.parseInt(process.versions.chromium, 10);
            }

            // Here we process all browsers which use the Chrome engine but
            // don't necessarily identify as Chrome. We cannot use the version
            // comparing functions because the Electron, Opera and NW.JS
            // versions are inconsequential here, as we need to know the actual
            // Chrome engine version.
            const ua = navigator.userAgent;

            if (ua.match(/Chrome/)) {
                const version
                    = Number.parseInt(ua.match(/Chrome\/([\d.]+)/)[1], 10);

                return version;
            }
        }

        return -1;
    }
}
