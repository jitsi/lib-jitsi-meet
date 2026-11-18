import { getLogger } from '@jitsi/logger';

const logger = getLogger('rtc:CcfbProbe');

/**
 * The SDP attribute which offers RTCP feedback for congestion control (RFC 8888). RFC 8888 requires the wildcard
 * payload type.
 */
const CCFB_ATTRIBUTE = 'a=rtcp-fb:* ack ccfb';

/**
 * Matches the attribute in an answer. Browsers may answer with one line for each payload type instead of the wildcard.
 */
const CCFB_REGEX = /^a=rtcp-fb:(\*|\d+) ack ccfb\s*$/m;

/**
 * The constructor of the peer connections used for the probe.
 */
type PeerConnectionConstructor = new () => RTCPeerConnection;

let probeResult: Promise<boolean> | undefined;

/**
 * Adds the offer of RTCP feedback for congestion control (RFC 8888) to every media section of an SDP.
 *
 * @param {string} sdp - The SDP.
 * @returns {string} The SDP with the attribute added to each media section.
 */
export function addCcfbToSdp(sdp: string): string {
    const lineEnding = sdp.includes('\r\n') ? '\r\n' : '\n';
    const [ session, ...mediaSections ] = sdp.split(/^(?=m=)/m);

    return session + mediaSections
        .map(section => `${section.endsWith(lineEnding) ? section : section + lineEnding}${CCFB_ATTRIBUTE}${lineEnding}`)
        .join('');
}

/**
 * Tells whether an SDP contains RTCP feedback for congestion control (RFC 8888).
 *
 * @param {string} sdp - The SDP.
 * @returns {boolean}
 */
export function sdpHasCcfb(sdp: string): boolean {
    return CCFB_REGEX.test(sdp);
}

/**
 * Finds out whether the browser accepts RTCP feedback for congestion control (RFC 8888) when it is offered.
 *
 * No API tells: the browser's capabilities do not list RTCP feedback types, and a browser may accept the feedback
 * without offering it itself. So one peer connection makes an ordinary offer, the feedback is added to it, and a
 * second peer connection is asked to answer it. Nothing is captured, gathered or sent.
 *
 * @param {PeerConnectionConstructor} PeerConnection - The constructor of the peer connections to use.
 * @returns {Promise<boolean>} Whether the answer contains the feedback. False if the probe fails.
 */
export async function runCcfbProbe(PeerConnection: PeerConnectionConstructor): Promise<boolean> {
    let offerer: RTCPeerConnection | undefined;
    let answerer: RTCPeerConnection | undefined;

    try {
        offerer = new PeerConnection();
        answerer = new PeerConnection();

        offerer.addTransceiver('audio');
        offerer.addTransceiver('video');

        const offer = await offerer.createOffer();

        await answerer.setRemoteDescription({
            sdp: addCcfbToSdp(offer.sdp),
            type: 'offer'
        });

        const answer = await answerer.createAnswer();

        return sdpHasCcfb(answer.sdp);
    } catch (error) {
        logger.debug('Probing for RFC 8888 feedback support failed', error);

        return false;
    } finally {
        offerer?.close();
        answerer?.close();
    }
}

/**
 * Tells whether the browser supports RTCP feedback for congestion control (RFC 8888). The browser is probed the first
 * time this is called, see {@link runCcfbProbe}.
 *
 * @returns {Promise<boolean>}
 */
export function isCcfbSupported(): Promise<boolean> {
    if (!probeResult) {
        probeResult = typeof RTCPeerConnection === 'undefined'
            ? Promise.resolve(false)
            : runCcfbProbe(RTCPeerConnection);
    }

    return probeResult;
}
