import { getLogger } from '@jitsi/logger';

import { TransportCost, getSelectedCandidatePair, getTransportCost } from '../../service/RTC/TransportCost';

import { IIceServer } from './PreCallTest';

const logger = getLogger('stats:IceConnectivityCheck');

/**
 * How long the check waits for the connection by default, in milliseconds.
 */
export const DEFAULT_ICE_CHECK_TIMEOUT = 10000;

export interface IIceConnectivityResult {

    // Whether the browser connected to itself through a TURN server.
    connected: boolean;
    durationMs: number;

    // The transport between the browser and the TURN server, when connected. TLS is reported as TCP.
    relayProtocol?: 'tcp' | 'udp';
}

/**
 * Checks whether the browser can reach the TURN servers, and over which transport. Two PeerConnections in the page
 * exchange only their relay candidates, so they can connect only through a TURN server; ICE prefers UDP and falls back
 * to TCP. Only the ICE and DTLS handshakes are sent, and both connections are closed at the end.
 *
 * @param {Array<IIceServer>} iceServers - The STUN and TURN servers, as passed to the PeerConnection constructor.
 * @param {number} [timeout] - How long to wait for the connection, in milliseconds.
 * @returns {Promise<IIceConnectivityResult>} Resolves with the result; never rejects.
 */
export default async function runIceConnectivityCheck(
        iceServers: IIceServer[], timeout = DEFAULT_ICE_CHECK_TIMEOUT): Promise<IIceConnectivityResult> {
    const startedAt = Date.now();
    const pcs: RTCPeerConnection[] = [];
    let timer: Optional<ReturnType<typeof setTimeout>>;

    try {
        pcs.push(new RTCPeerConnection({ iceServers }), new RTCPeerConnection({ iceServers }));

        const [ offerer, answerer ] = pcs;

        pcs.forEach((pc, index) => {
            const other = pcs[1 - index];

            pc.onicecandidate = ({ candidate }) => {
                / typ relay( |$)/.test(candidate?.candidate ?? '')
                    && other.addIceCandidate(candidate).catch(error => logger.debug('Failed to add a candidate', error));
            };
        });
        offerer.createDataChannel('ice-check');

        // The descriptions are passed before any candidates are in them, so that only relay candidates get across.
        const offer = await offerer.createOffer();

        await offerer.setLocalDescription(offer);
        await answerer.setRemoteDescription(offer);

        const answer = await answerer.createAnswer();

        await answerer.setLocalDescription(answer);
        await offerer.setRemoteDescription(answer);

        const connected = await new Promise<boolean>(resolve => {
            timer = setTimeout(() => resolve(false), timeout);
            offerer.onconnectionstatechange = () => {
                offerer.connectionState === 'connected' && resolve(true);
                offerer.connectionState === 'failed' && resolve(false);
            };
        });
        const cost = connected ? getTransportCost(getSelectedCandidatePair(await offerer.getStats())?.local) : null;
        const result: IIceConnectivityResult = {
            connected,
            durationMs: Date.now() - startedAt
        };

        if (cost === TransportCost.RELAY_UDP || cost === TransportCost.RELAY_TCP) {
            result.relayProtocol = cost === TransportCost.RELAY_UDP ? 'udp' : 'tcp';
        }

        return result;
    } catch (error) {
        logger.warn('The ICE connectivity check could not run', error);

        return {
            connected: false,
            durationMs: Date.now() - startedAt
        };
    } finally {
        clearTimeout(timer);
        pcs.forEach(pc => pc.close());
    }
}
