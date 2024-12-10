import { BrowserDetection } from '@jitsi/js-utils';

/* Minimum required Chrome / Chromium version. This applies also to derivatives. */
const MIN_REQUIRED_CHROME_VERSION = 72;
const MIN_REQUIRED_FIREFOX_VERSION = 91;
const MIN_REQUIRED_SAFARI_VERSION = 14;
const MIN_REQUIRED_IOS_VERSION = 14;

// Starting with iPadOS 13 the actual Safari / iPadOS version is concealed from the UA string and
// the system pretends to be macOS 10.15.7. Yeah, you read that right.
const FROZEN_MACOS_VERSION = '10.15.7';

// TODO: Move this code to js-utils.

// NOTE: Now we are extending BrowserDetection in order to preserve
// RTCBrowserType interface but maybe it worth exporting BrowserCapabilities
// and BrowserDetection as separate objects in future.

/**
 * Implements browser capabilities for lib-jitsi-meet.
 */
export default class BrowserCapabilities extends BrowserDetection {
    /**
     * Tells whether or not the <tt>MediaStream/tt> is removed from the <tt>PeerConnection</tt> and disposed on video
     * mute (in order to turn off the camera device). This is needed on Firefox because of the following bug
     * https://bugzilla.mozilla.org/show_bug.cgi?id=1735951
     *
     * @return {boolean} <tt>true</tt> if the current browser supports this strategy or <tt>false</tt> otherwise.
     */
    doesVideoMuteByStreamRemove() {
        return this.isChromiumBased() || this.isWebKitBased() || this.isFirefox();
    }

    /**
     * Checks if the client is running on an Android browser.
     *
     * @returns {boolean}
     */
    isAndroidBrowser() {
        return !this.isReactNative() && this.getOS() === 'Android';
    }

    /**
     * Checks if the current platform is iOS.
     *
     * @returns {boolean}
     */
    isIosBrowser() {
        return !this.isReactNative() && this.getOS() === 'iOS';
    }

    /**
     * Checks if the client is running on a mobile device.
     */
    isMobileDevice() {
        return this.isAndroidBrowser() || this.isIosBrowser() || this.isReactNative();
    }

    /**
     * Checks whether current running context is a Trusted Web Application.
     *
     * @returns {boolean} Whether the current context is a TWA.
     */
    isTwa() {
        return 'matchMedia' in window && window.matchMedia('(display-mode:standalone)').matches;
    }

    /**
     * Checks if the current browser is supported.
     *
     * @returns {boolean} true if the browser is supported, false otherwise.
     */
    isSupported() {
        // First check for WebRTC APIs because some "security" extensions are dumb.
        if (typeof RTCPeerConnection === 'undefined'
                || !navigator?.mediaDevices?.enumerateDevices || !navigator?.mediaDevices?.getUserMedia) {
            return false;
        }

        if (this.isSafari() && this._getSafariVersion() < MIN_REQUIRED_SAFARI_VERSION) {
            return false;
        }

        return (this.isChromiumBased() && this.isEngineVersionGreaterThan(MIN_REQUIRED_CHROME_VERSION - 1))
            || (this.isFirefox() && this.isVersionGreaterThan(MIN_REQUIRED_FIREFOX_VERSION - 1))
            || this.isReactNative()
            || this.isWebKitBased();
    }

    /**
     * Returns whether the browser is supported for Android
     * @returns {boolean} true if the browser is supported for Android devices
     */
    isSupportedAndroidBrowser() {
        return this.isChromiumBased() || this.isFirefox();
    }

    /**
     * Returns whether the browser is supported for iOS
     * @returns {boolean} true if the browser is supported for iOS devices
     */
    isSupportedIOSBrowser() {
        // After iPadOS 13 we have no way to know the Safari or iPadOS version, so YOLO.
        if (!this.isSafari() && this.isWebKitBased() && this.getOSVersion() === FROZEN_MACOS_VERSION) {
            return true;
        }

        return this._getSafariVersion() >= MIN_REQUIRED_IOS_VERSION
                || this._getIOSVersion() >= MIN_REQUIRED_IOS_VERSION;
    }

    /**
     * Returns whether or not the current environment needs a user interaction
     * with the page before any unmute can occur.
     *
     * @returns {boolean}
     */
    isUserInteractionRequiredForUnmute() {
        return this.isFirefox() && this.isVersionLessThan('68');
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
        return !this.isFirefox() && !this.isWebKitBased();
    }

    /**
     * Checks if the current browser supports setting codec preferences on the transceiver.
     * @returns {boolean}
     */
    supportsCodecPreferences() {
        return Boolean(window.RTCRtpTransceiver
            && 'setCodecPreferences' in window.RTCRtpTransceiver.prototype
            && window.RTCRtpReceiver
            && typeof window.RTCRtpReceiver.getCapabilities !== 'undefined')

            // this is not working on Safari because of the following bug
            // https://bugs.webkit.org/show_bug.cgi?id=215567
            && !this.isWebKitBased()

            // Calling this API on Firefox is causing freezes when the local endpoint is the answerer.
            // https://bugzilla.mozilla.org/show_bug.cgi?id=1917800
            && !this.isFirefox();
    }

    /**
     * Checks if the browser supports the new codec selection API, i.e., checks if dictionary member
     * RTCRtpEncodingParameters.codec as defined in
     * https://w3c.github.io/webrtc-extensions/#dom-rtcrtpencodingparameters-codec is supported by the browser. It
     * allows the application to change the current codec used by each RTCRtpSender without a renegotiation.
     *
     * @returns {boolean}
     */
    supportsCodecSelectionAPI() {
        return this.isChromiumBased() && this.isEngineVersionGreaterThan(125);
    }

    /**
     * Returns true if the browser supports Dependency Descriptor header extension.
     *
     * @returns {boolean}
     */
    supportsDDExtHeaders() {
        return !this.isFirefox();
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
     * Checks if the current browser supports the Long Tasks API that lets us observe
     * performance measurement events and be notified of tasks that take longer than
     * 50ms to execute on the main thread.
     */
    supportsPerformanceObserver() {
        return typeof window.PerformanceObserver !== 'undefined'
            && PerformanceObserver.supportedEntryTypes.indexOf('longtask') > -1;
    }

    /**
     * Checks if the current browser supports audio level stats on the receivers.
     */
    supportsReceiverStats() {
        return typeof window.RTCRtpReceiver !== 'undefined'
            && Object.keys(RTCRtpReceiver.prototype).indexOf('getSynchronizationSources') > -1;
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
        return !this.isFirefox();
    }

    /**
     * Returns true if the browser supports the new Scalability Mode API for VP9/AV1 simulcast and full SVC. H.264
     * simulcast will also be supported by the jvb for this version because the bridge is able to read the Dependency
     * Descriptor RTP header extension to extract layers information for H.264 as well.
     *
     * @returns {boolean}
     */
    supportsScalabilityModeAPI() {
        return this.isChromiumBased() && this.isEngineVersionGreaterThan(112);
    }

    /**
     * Returns true if the browser supports track based statistics for the local video track. Otherwise,
     * track resolution and framerate will be calculated based on the 'outbound-rtp' statistics.
     * @returns {boolean}
     */
    supportsTrackBasedStats() {
        return this.isChromiumBased() && this.isEngineVersionLessThan(112);
    }

    /**
     * Returns true if VP9 is supported by the client on the browser. VP9 is currently disabled on Firefox and Safari
     * because of issues with rendering. Please check https://bugzilla.mozilla.org/show_bug.cgi?id=1492500,
     * https://bugs.webkit.org/show_bug.cgi?id=231071 and https://bugs.webkit.org/show_bug.cgi?id=231074 for details.
     */
    supportsVP9() {
        return this.isChromiumBased() || this.isReactNative();
    }

    /**
     * Checks if the browser uses SDP munging for turning on simulcast.
     *
     * @returns {boolean}
     */
    usesSdpMungingForSimulcast() {
        return this.isChromiumBased() || this.isReactNative() || this.isWebKitBased();
    }

    /**
     * Checks if the browser uses RIDs/MIDs for siganling the simulcast streams
     * to the bridge instead of the ssrcs.
     */
    usesRidsForSimulcast() {
        return false;
    }

    /**
     * Checks if the browser supports getDisplayMedia.
     * @returns {boolean} {@code true} if the browser supports getDisplayMedia.
     */
    supportsGetDisplayMedia() {
        return typeof navigator.getDisplayMedia !== 'undefined'
            || (typeof navigator.mediaDevices !== 'undefined'
                && typeof navigator.mediaDevices.getDisplayMedia
                    !== 'undefined');
    }

    /**
     * Checks if the browser supports WebRTC Encoded Transform, an alternative
     * to insertable streams.
     *
     * NOTE: At the time of this writing the only browser supporting this is
     * Safari / WebKit, behind a flag.
     *
     * @returns {boolean} {@code true} if the browser supports it.
     */
    supportsEncodedTransform() {
        return Boolean(window.RTCRtpScriptTransform);
    }

    /**
     * Checks if the browser supports insertable streams, needed for E2EE.
     * @returns {boolean} {@code true} if the browser supports insertable streams.
     */
    supportsInsertableStreams() {
        if (!(typeof window.RTCRtpSender !== 'undefined'
            && window.RTCRtpSender.prototype.createEncodedStreams)) {
            return false;
        }

        // Feature-detect transferable streams which we need to operate in a worker.
        // See https://groups.google.com/a/chromium.org/g/blink-dev/c/1LStSgBt6AM/m/hj0odB8pCAAJ
        const stream = new ReadableStream();

        try {
            window.postMessage(stream, '*', [ stream ]);

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Whether the browser supports the RED format for audio.
     */
    supportsAudioRed() {
        return Boolean(window.RTCRtpSender
            && window.RTCRtpSender.getCapabilities
            && window.RTCRtpSender.getCapabilities('audio').codecs.some(codec => codec.mimeType === 'audio/red')
            && window.RTCRtpReceiver
            && window.RTCRtpReceiver.getCapabilities
            && window.RTCRtpReceiver.getCapabilities('audio').codecs.some(codec => codec.mimeType === 'audio/red'));
    }

    /**
     * Checks if the browser supports voice activity detection via the @type {VADAudioAnalyser} service.
     *
     * @returns {boolean}
     */
    supportsVADDetection() {
        return this.isChromiumBased();
    }

    /**
     * Check if the browser supports the RTP RTX feature (and it is usable).
     *
     * @returns {boolean}
     */
    supportsRTX() {
        // Disable RTX on Firefox up to 96 because we prefer simulcast over RTX
        // see https://bugzilla.mozilla.org/show_bug.cgi?id=1738504
        return !(this.isFirefox() && this.isVersionLessThan('96'));
    }

    /**
     * Returns the version of a Safari browser.
     *
     * @returns {Number}
     */
    _getSafariVersion() {
        if (this.isSafari()) {
            return Number.parseInt(this.getVersion(), 10);
        }

        return -1;
    }

    /**
     * Returns the version of an ios browser.
     *
     * @returns {Number}
     */
    _getIOSVersion() {
        if (this.isWebKitBased()) {
            return Number.parseInt(this.getOSVersion(), 10);
        }

        return -1;
    }
}
