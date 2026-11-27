import { addCcfbToSdp, runCcfbProbe, sdpHasCcfb } from './CcfbProbe';

const OFFER = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0 1',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=mid:0',
    'a=rtpmap:111 opus/48000/2',
    'a=rtcp-fb:111 transport-cc',
    'm=video 9 UDP/TLS/RTP/SAVPF 96 97',
    'a=mid:1',
    'a=rtpmap:96 VP8/90000',
    'a=rtcp-fb:96 transport-cc',
    'a=rtpmap:97 rtx/90000',
    ''
].join('\r\n');

/**
 * Builds a fake peer connection constructor.
 *
 * @param {Function} answer - Produces the SDP of the answer from the SDP of the offer it was given.
 * @param {Array<any>} created - Collects the peer connections which are constructed.
 * @returns {any}
 */
function fakePeerConnection(answer: (offer: string) => string, created: Array<any>): any {
    return class {
        closed = false;
        remoteDescription: { sdp: string; type: string; } | undefined;
        transceivers: Array<string> = [];

        /**
         * Records the peer connection.
         */
        constructor() {
            created.push(this);
        }

        /**
         * Records the kind of the transceiver.
         */
        addTransceiver(kind: string) {
            this.transceivers.push(kind);
        }

        /**
         * Closes the peer connection.
         */
        close() {
            this.closed = true;
        }

        /**
         * Answers the offer.
         */
        async createAnswer() {
            return {
                sdp: answer(this.remoteDescription.sdp),
                type: 'answer'
            };
        }

        /**
         * Offers.
         */
        async createOffer() {
            return {
                sdp: OFFER,
                type: 'offer'
            };
        }

        /**
         * Records the remote description.
         */
        async setRemoteDescription(description: { sdp: string; type: string; }) {
            this.remoteDescription = description;
        }
    };
}

describe('CcfbProbe', () => {
    describe('addCcfbToSdp', () => {
        it('adds the wildcard attribute at the end of every media section, and nowhere else', () => {
            const lines = addCcfbToSdp(OFFER).split('\r\n');

            expect(lines.filter(line => line === 'a=rtcp-fb:* ack ccfb').length).toBe(2);

            // The last line of the audio section, before the video section starts.
            expect(lines[lines.indexOf('m=video 9 UDP/TLS/RTP/SAVPF 96 97') - 1]).toBe('a=rtcp-fb:* ack ccfb');

            // The last line of the SDP.
            expect(lines.slice(-2)).toEqual([ 'a=rtcp-fb:* ack ccfb', '' ]);

            // Nothing else changed.
            expect(lines.filter(line => line !== 'a=rtcp-fb:* ack ccfb').join('\r\n')).toBe(OFFER);
        });

        it('handles an SDP which does not end with a line ending', () => {
            const sdp = addCcfbToSdp(OFFER.trimEnd());

            expect(sdp.endsWith('a=rtpmap:97 rtx/90000\r\na=rtcp-fb:* ack ccfb\r\n')).toBe(true);
        });
    });

    describe('sdpHasCcfb', () => {
        it('recognizes the attribute with the wildcard and with a payload type', () => {
            expect(sdpHasCcfb(addCcfbToSdp(OFFER))).toBe(true);
            expect(sdpHasCcfb(`${OFFER}a=rtcp-fb:96 ack ccfb\r\n`)).toBe(true);
        });

        it('does not mistake other feedback for it', () => {
            expect(sdpHasCcfb(OFFER)).toBe(false);
            expect(sdpHasCcfb(`${OFFER}a=rtcp-fb:96 ack rpsi\r\na=rtcp-fb:96 ccm fir\r\n`)).toBe(false);
        });
    });

    describe('runCcfbProbe', () => {
        it('offers the feedback in every media section and reports that it was accepted', async () => {
            const created: Array<any> = [];
            const PeerConnection = fakePeerConnection(offer => offer, created);

            expect(await runCcfbProbe(PeerConnection)).toBe(true);

            const [ offerer, answerer ] = created;

            expect(created.length).toBe(2);
            expect(offerer.transceivers).toEqual([ 'audio', 'video' ]);
            expect(answerer.remoteDescription.type).toBe('offer');
            expect(answerer.remoteDescription.sdp).toBe(addCcfbToSdp(OFFER));
            expect(created.every(pc => pc.closed)).toBe(true);
        });

        it('reports that the feedback was not accepted when the answer does not have it', async () => {
            const created: Array<any> = [];
            const PeerConnection = fakePeerConnection(() => OFFER, created);

            expect(await runCcfbProbe(PeerConnection)).toBe(false);
            expect(created.every(pc => pc.closed)).toBe(true);
        });

        it('reports no support, and closes the peer connections, when the probe fails', async () => {
            const created: Array<any> = [];
            const PeerConnection = fakePeerConnection(() => {
                throw new Error('createAnswer failed');
            }, created);

            expect(await runCcfbProbe(PeerConnection)).toBe(false);
            expect(created.length).toBe(2);
            expect(created.every(pc => pc.closed)).toBe(true);
        });

        it('gives an answer for the real browser', async () => {
            // The result depends on the browser and on how it was started, but the probe has to complete.
            expect(typeof await runCcfbProbe(RTCPeerConnection)).toBe('boolean');
        });
    });
});
