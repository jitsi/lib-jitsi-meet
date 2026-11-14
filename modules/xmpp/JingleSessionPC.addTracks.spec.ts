import transform from 'sdp-transform';

import { MediaDirection } from '../../service/RTC/MediaDirection';
import { MediaType } from '../../service/RTC/MediaType';
import JitsiLocalTrack from '../RTC/JitsiLocalTrack';
import TraceablePeerConnection from '../RTC/TraceablePeerConnection';
import AsyncQueue from '../util/AsyncQueue';

import JingleSessionPC from './JingleSessionPC';

interface ITestTransceiver {
    currentDirection: MediaDirection;
    direction: MediaDirection;
    mid: string;
    receiver: { track: MediaStreamTrack; };
    sender: {
        replaceTrack: (track: MediaStreamTrack) => Promise<void>;
        track: Nullable<MediaStreamTrack>;
    };
    stopped: boolean;
}

/**
 * Creates only the local-track properties read by the real attachment methods.
 *
 * @param {number} index - Track identity.
 * @param {MediaType} mediaType - Track kind.
 * @returns {JitsiLocalTrack}
 */
function localTrack(index: number, mediaType: MediaType = MediaType.VIDEO): JitsiLocalTrack {
    const track = { id: `${mediaType}-${index}`, kind: mediaType } as MediaStreamTrack;

    return {
        getSourceName: () => `endpoint-${mediaType[0]}${index}`,
        getTrack: () => track,
        getType: () => mediaType,
        rtcId: index
    } as JitsiLocalTrack;
}

/**
 * Builds a minimal remote SDP with one template m-line for each media kind.
 *
 * @param {ITestTransceiver[]} transceivers - Negotiated slots.
 * @returns {string}
 */
function remoteSdp(transceivers: ITestTransceiver[]): string {
    const session = [
        'v=0',
        'o=- 1 1 IN IP4 0.0.0.0',
        's=-',
        't=0 0',
        `a=group:BUNDLE ${transceivers.map(t => t.mid).join(' ')}`
    ];
    const media = transceivers.map(t => [
        `m=${t.receiver.track.kind} 9 UDP/TLS/RTP/SAVPF ${t.receiver.track.kind === MediaType.AUDIO ? 111 : 100}`,
        'c=IN IP4 0.0.0.0',
        `a=mid:${t.mid}`,
        `a=${t.direction}`,
        t.receiver.track.kind === MediaType.AUDIO ? 'a=rtpmap:111 opus/48000/2' : 'a=rtpmap:100 VP8/90000'
    ].join('\r\n'));

    return `${[ ...session, ...media ].join('\r\n')}\r\n`;
}

/**
 * Exercises real addTracks, replaceTrack, SDP m-line creation and AsyncQueue.
 * Only browser sender completion and the offer/answer boundary are simulated.
 *
 * @param {boolean} isP2P - Whether slots can be reused.
 * @param {number} reusable - Number of existing receive-only video slots.
 * @returns {Object}
 */
function attachmentSession(isP2P: boolean, reusable: number) {
    const microphone = localTrack(0, MediaType.AUDIO);
    const camera = localTrack(1);
    const transceivers: ITestTransceiver[] = [];
    const events: string[] = [];
    const failure = new Error('native replaceTrack failed');
    let failedTrack: Nullable<MediaStreamTrack> = null;
    let pending = 0;
    let maxPending = 0;

    /**
     * Adds a slot whose sender replacement completes on a later microtask.
     *
     * @param {MediaType} mediaType - Receiver kind.
     * @param {MediaDirection} currentDirection - Last negotiated direction.
     * @param {Nullable<MediaStreamTrack>} track - Initially attached track.
     * @returns {ITestTransceiver}
     */
    function addSlot(mediaType: MediaType, currentDirection: MediaDirection, track: Nullable<MediaStreamTrack> = null) {
        const sender = {
            replaceTrack: (newTrack: MediaStreamTrack) => {
                pending++;
                maxPending = Math.max(maxPending, pending);
                events.push(`begin:${newTrack.id}`);

                return Promise.resolve().then(() => {
                    pending--;
                    if (newTrack === failedTrack) {
                        throw failure;
                    }
                    sender.track = newTrack;
                    events.push(`end:${newTrack.id}`);
                });
            },
            track
        };
        const slot: ITestTransceiver = {
            currentDirection,
            direction: track ? MediaDirection.SENDRECV : MediaDirection.RECVONLY,
            mid: String(transceivers.length),
            receiver: { track: { kind: mediaType } as MediaStreamTrack },
            sender,
            stopped: false
        };

        transceivers.push(slot);

        return slot;
    }

    const microphoneSlot = addSlot(MediaType.AUDIO, MediaDirection.SENDRECV, microphone.getTrack());
    const cameraSlot = addSlot(MediaType.VIDEO, MediaDirection.SENDRECV, camera.getTrack());

    for (let i = 0; i < reusable; i++) {
        addSlot(MediaType.VIDEO, MediaDirection.RECVONLY);
    }
    const description = { sdp: remoteSdp(transceivers) };
    const peerconnection = {
        _midsWithSentTrack: new Set<string>(),
        _sendRtcStatsEvent: jasmine.createSpy('_sendRtcStatsEvent'),
        audioTransferActive: true,
        getLocalTracks: TraceablePeerConnection.prototype.getLocalTracks,
        isP2P,
        localSSRCs: new Map(),
        localTrackTransceiverMids: new Map([ [ 0, '0' ], [ 1, '1' ] ]),
        localTracks: new Map([ [ 0, microphone ], [ 1, camera ] ]),
        peerconnection: { getTransceivers: () => transceivers },
        remoteDescription: description,
        replaceTrack: TraceablePeerConnection.prototype.replaceTrack,
        toString: () => 'TPC[secondary-track-test]',
        videoTransferActive: true
    };
    const renegotiate = jasmine.createSpy('_renegotiate').and.callFake(async (sdp?: string) => {
        events.push(sdp ? 'prepare' : 'final');
        if (sdp) {
            // Apply only newly negotiated m-lines; existing slots retain their identities.
            for (const media of transform.parse(sdp).media) {
                if (!transceivers.some(t => t.mid === String(media.mid))) {
                    addSlot(media.type as MediaType, MediaDirection.INACTIVE);
                }
            }
            description.sdp = sdp;
        } else {
            description.sdp = remoteSdp(transceivers);
        }
    });
    const queue = new AsyncQueue();
    const session = Object.assign(Object.create(JingleSessionPC.prototype), {
        _renegotiate: renegotiate,
        isP2P,
        modificationQueue: queue,
        peerconnection,
        toString: () => 'JingleSessionPC[secondary-track-test]'
    });

    return {
        camera,
        cameraSlot,
        events,
        failOn: (track: JitsiLocalTrack) => {
            failedTrack = track.getTrack();
        },
        failure,
        maxPending: () => maxPending,
        microphone,
        microphoneSlot,
        peerconnection,
        queue,
        renegotiate,
        session,
        transceivers
    };
}

describe('JingleSessionPC secondary track attachment', () => {
    let h: ReturnType<typeof attachmentSession>;

    afterEach(() => h?.queue.shutdown());

    ([ [ false, 0 ], [ true, 0 ], [ true, 1 ], [ true, 2 ] ] as const).forEach(([ isP2P, reusable ]) => {
        it(`assigns distinct MIDs to secondary tracks (${isP2P ? 'P2P' : 'JVB'}, ${reusable} reusable slots)`, async () => {
            h = attachmentSession(isP2P, reusable);
            const tracks = [ localTrack(2), localTrack(3) ];
            const originalSlotCount = h.transceivers.length;

            await h.session.addTracks(tracks);

            const mids = tracks.map(track => h.peerconnection.localTrackTransceiverMids.get(track.rtcId));

            expect(new Set(mids).size).toBe(tracks.length);
            for (const [ i, track ] of tracks.entries()) {
                expect(h.transceivers.find(t => t.mid === mids[i]).sender.track).toBe(track.getTrack());
            }
            expect(h.maxPending()).toBe(1);
            expect(h.transceivers.length - originalSlotCount).toBe(isP2P ? Math.max(0, tracks.length - reusable) : tracks.length);
            expect(h.microphoneSlot.sender.track).toBe(h.microphone.getTrack());
            expect(h.cameraSlot.sender.track).toBe(h.camera.getTrack());
            expect(h.events.filter(event => event === 'prepare' || event === 'final')).toEqual([ 'prepare', 'final' ]);
            expect(h.events.indexOf(`end:${tracks[0].getTrack().id}`))
                .toBeLessThan(h.events.indexOf(`begin:${tracks[1].getTrack().id}`));
        });
    });

    it('preserves the native flow when adding one secondary track', async () => {
        h = attachmentSession(true, 1);
        const track = localTrack(2);
        const slot = h.transceivers[2];

        await h.session.addTracks([ track ]);

        expect(slot.sender.track).toBe(track.getTrack());
        expect(h.peerconnection.localTrackTransceiverMids.get(track.rtcId)).toBe(slot.mid);
        expect(h.transceivers.length).toBe(3);
        expect(h.renegotiate).toHaveBeenCalledTimes(2);
    });

    it('rejects on native failure without starting later attachments or final renegotiation', async () => {
        h = attachmentSession(false, 0);
        const tracks = [ localTrack(2), localTrack(3), localTrack(4) ];

        h.failOn(tracks[1]);

        await expectAsync(h.session.addTracks(tracks)).toBeRejectedWith(h.failure);

        expect(h.events).not.toContain(`begin:${tracks[2].getTrack().id}`);
        expect(h.events).not.toContain('final');
        expect(h.peerconnection.localTrackTransceiverMids.has(tracks[0].rtcId)).toBeTrue();
        expect(h.peerconnection.localTrackTransceiverMids.has(tracks[1].rtcId)).toBeFalse();
    });

    it('does not consume an existing video-only P2P slot for an audio addition', async () => {
        h = attachmentSession(true, 1);
        const track = localTrack(2, MediaType.AUDIO);
        const videoSlot = h.transceivers[2];

        await h.session.addTracks([ track ]);

        expect(videoSlot.sender.track).toBeNull();
        expect(h.transceivers.length).toBe(4);
        expect(h.transceivers[3].receiver.track.kind).toBe(MediaType.AUDIO);
        expect(h.transceivers[3].sender.track).toBe(track.getTrack());
        expect(h.microphoneSlot.sender.track).toBe(h.microphone.getTrack());
    });

    it('retains native queue ordering across overlapping batches', async () => {
        h = attachmentSession(false, 0);
        const tracks = [ localTrack(2), localTrack(3), localTrack(4), localTrack(5) ];

        await Promise.all([ h.session.addTracks(tracks.slice(0, 2)), h.session.addTracks(tracks.slice(2)) ]);

        const mids = tracks.map(track => h.peerconnection.localTrackTransceiverMids.get(track.rtcId));

        expect(new Set(mids).size).toBe(tracks.length);
        expect(h.maxPending()).toBe(1);
        expect(h.events.filter(event => event === 'prepare' || event === 'final'))
            .toEqual([ 'prepare', 'final', 'prepare', 'final' ]);
    });
});
