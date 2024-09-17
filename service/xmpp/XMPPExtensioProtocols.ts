
export enum XEP {
    /**
     * XEP-0338 - Signals the usage of bundled media, i.e., allows the use of a single set of ICE candidates for
     * multiple media descriptions.
     * https://xmpp.org/extensions/attic/xep-0338-1.0.0.html
     */
    BUNDLE_MEDIA = 'urn:xmpp:jingle:apps:grouping:0',

    /**
     * XEP-0320 - Signals the use of DTLS-SRTP in Jingle session.
     * https://xmpp.org/extensions/xep-0320.html
     */
    DTLS_SRTP = 'urn:xmpp:jingle:apps:dtls:0',

    /**
     * XEP-0176 - Signaling ICE-UDP transport method.
     * https://xmpp.org/extensions/xep-0176.html
     */
    ICE_UDP_TRANSPORT = 'urn:xmpp:jingle:transports:ice-udp:1',

    /**
     * XEP-0166 - Jingle.
     * https://xmpp.org/extensions/xep-0166.html
     */
    JINGLE = 'urn:xmpp:jingle:1',

    /**
     * XEP-0327 - Rayo for allowing third-party control over media sessions.
     */
    RAYO = 'urn:xmpp:rayo:client:1',

    /**
     * XEP-0167 - Signals support for RTP audio.
     * https://xmpp.org/extensions/xep-0167.html#support
     */
    RTP_AUDIO = 'urn:xmpp:jingle:apps:rtp:audio',

    /**
     * XEP-0293 - Signals the use of RTP Feedback Negotiation.
     * https://xmpp.org/extensions/xep-0293.html
     */
    RTP_FEEDBACK = 'urn:xmpp:jingle:apps:rtp:rtcp-fb:0',

    /**
     * XEP-0167 - Signals support for RTP video.
     * https://xmpp.org/extensions/xep-0167.html#support
     */
    RTP_VIDEO = 'urn:xmpp:jingle:apps:rtp:video',

    /**
     * XEP-0294 - Signals the use of RTP Header Extensions.
     * https://xmpp.org/extensions/xep-0294.html
     */
    RTP_HEADER_EXTENSIONS = 'urn:xmpp:jingle:apps:rtp:rtp-hdrext:0',

    /**
     * XEP-0167 - Signals parameters necessary for media sessions using RTP.
     * https://xmpp.org/extensions/xep-0167.html
     */
    RTP_MEDIA = 'urn:xmpp:jingle:apps:rtp:1',

    /**
     * XEP-0343 - Signaling WebRTC datachannels (bridge channel) in Jingle that uses DTLS/SCTP on top of ICE.
     * https://xmpp.org/extensions/xep-0343.html
     */
    SCTP_DATA_CHANNEL = 'urn:xmpp:jingle:transports:dtls-sctp:1',

    /**
     * XEP-0339 - Signals Source-Specific Media Attributes in Jingle.
     * https://xmpp.org/extensions/xep-0339.html
     */
    SOURCE_ATTRIBUTES = 'urn:xmpp:jingle:apps:rtp:ssma:0'
}
