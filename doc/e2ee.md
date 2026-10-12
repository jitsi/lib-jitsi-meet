# End-to-End Encryption using Insertable Streams

## Overview

**NOTE** e2ee is work in progress.

This document describes some of the high-level concepts and outlines the design.
Please refer to the source code for details.

This library implements End-to-End Encryption (E2EE) on supported endpoints (currently just browsers with support
for [insertable streams](https://github.com/w3c/webrtc-insertable-streams)).

This implementation follows the model outlined in [SFrame](https://tools.ietf.org/html/draft-omara-sframe-00) with
slight changes.

## Signaling

Each participant will have a randomly generated key which is used to encrypt the media. The key is distributed with
other participants (so they can decrypt the media) via an E2EE channel which
is established with [Olm](https://gitlab.matrix.org/matrix-org/olm).

### Key rotation

Each participant's key is rotated (a new random one is generated) every time a participant leaves. This new key is
then sent to every other participant over the E2EE Olm channel.

### Key ratcheting

Each participant ratchets their key when another participant joins. The new resulting key is not distributed since
every participant can derive it by ratcheting themselves.

Unlike described in [SFrame 4.3.5.1](https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1)
we attempt to ratchet the key forward when we do not find a valid authentication tag. Note that we only update
the set of keys when we find a valid signature which avoids a denial of service attack with invalid signatures.

## Media

### Packet format

We are using a variant of [SFrame](https://tools.ietf.org/html/draft-omara-sframe-00)
that uses a trailer instead of a header. We call it JFrame.

These transformations use AES-GCM (with a 128 bit key; we could have used
256 bits but since the keys are short-lived decided against it) and the
webcrypto API:
  https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt

AES-GCM needs a 96 bit initialization vector which we construct
based on the SSRC, the rtp timestamp and a frame counter which is similar to
how the IV is constructed in SRTP with GCM
  https://tools.ietf.org/html/rfc7714#section-8.1

This IV gets sent along with the packet, adding 12 bytes of overhead. The GCM
tag length is the default 128 bits or 16 bytes. For video this overhead is ok but
for audio (where the opus frames are much, much smaller) we are considering shorter
authentication tags.

At a high level the encrypted frame format looks like this:
```
     +------------+--------------------------------------+^+
     |unencrypted payload header (variable length)       | |
   +^+------------+--------------------------------------+ |
   | |                                                   | |
   | |                                                   | |
   | |                                                   | |
   | |                                                   | |
   | |              Encrypted Frame                      | |
   | |                                                   | |
   | |                                                   | |
   | |                                                   | |
   | |                                                   | |
   | | ---------+-------------------------+-+---------+----
   | | payload  |IV...(length = IV_LENGTH)|R|IV_LENGTH|KID |
   | | ---------+-------------------------+-+---------+----
   |                                                       |
   +--+Encrypted Portion        Authenticated Portion+---+
```

We do not encrypt the first few bytes of the packet that form the
[VP8 payload](https://tools.ietf.org/html/rfc6386#section-9.1) (10 bytes for key frames, 3 bytes for interframes) nor
the [Opus TOC byte](https://tools.ietf.org/html/rfc6716#section-3.1).

This allows the decoder to understand the frame a bit more and makes it decode the fun looking garbage we see in the
video. This also means the SFU does not know (ideally) that the content is end-to-end encrypted and there are no
changes in the SFU required at all.

### Using Web Workers

Insertable Streams are transferable and can be sent from the main JavaScript context to a
[Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker).
We are using a named worker (E2EEworker) which allows very easy inspection in Chrome DevTools.


## Native managed E2EE (draft)

The experimental `e2ee.nativeManaged` profile routes the existing automatic
`ManagedKeyHandler` and `OlmAdapter` through a native conference key store.
The browser frame format, Olm messages, key generation, rotation, and ratcheting
remain the upstream implementations. Applications do not supply media keys.

This is a dependent integration: stock React Native WebRTC binaries do not
implement the native methods below. A matching native frame-cryptor backend,
React Native bridge, secure entropy, and the original Olm runtime must be
available before the SDK registers the provider. The initial platform contract
accepts iOS and Android; that alone does not establish device or media support.
No provider is installed by lib-jitsi-meet itself. Without explicit opt-in,
browser and ordinary native conferences retain the existing paths.

### Initialization and join

Register the platform once through `JitsiMeetJS.registerNativeE2EE` with
`platform`, the actual `RTCPeerConnection` constructor, the matching
`nativeModule`, and the narrow `crypto.importKey` / `crypto.ratchet` operations.
Registration requires `RTCPeerConnection.isNativeManagedE2EESupported()` and the
complete bridge API. It cannot be replaced with another provider while the
library is loaded.

The caller must await initial protection before joining:

```ts
const conference = connection.initJitsiConference(room, {
    e2ee: { nativeManaged: true },
    p2p: { enabled: false }
});

await conference.setE2EEEnabled(true);
conference.join();
```

`nativeManaged` is an immutable, protected-conference profile in this draft,
not a general in-call toggle. A join before readiness throws. Disabling native
E2EE terminally revokes the key store and closes its peer connections; re-enable
requires a new conference. The SDK needs its own pre-join integration and must
not expose this profile as a normal disable/re-enable UI until that lifecycle is
implemented and tested. Stock native binaries, missing Olm, disabled E2EE,
externally managed keys, lite mode, and SSRC rewriting reject the opt-in rather
than fall back to plaintext. The initial validated topology is JVB with Opus
and VP8, simulcast and SSRC rewriting disabled; P2P transitions and reconnects
remain validation work.

### Native bridge contract

All asynchronous bridge operations return `true` only after native state has
accepted the change. Failure closes the protected conference. Method names are
proposed integration boundaries and remain subject to review.

| Method | Responsibility |
| --- | --- |
| `jitsiE2EEConferenceCreate(localId)` | Synchronously return an opaque native key-store ID. |
| `jitsiE2EEConferenceSetKey(store, participant, bytes, index)` | Install automatic key material; reject retired participants. |
| `jitsiE2EEConferenceRemoveParticipant(store, participant)` | Tombstone the participant and remove its media keys. |
| `jitsiE2EEConferenceClose(store)` | Revoke keys and all owned media contexts terminally. |
| `jitsiE2EEBindReceiver(store, pc, receiver, participant)` | Bind the exact receiver to its authenticated signaling owner. |
| `jitsiE2EEVerifySender(store, pc, sender, kind, participant)` | Verify creation-time protection and local sender ownership. |
| `jitsiE2EERetirePeer(store, pc)` | Retire one peer connection without destroying the conference key store. |
| `jitsiE2EERatchet(bytes)` | Return the existing JFrame HKDF ratchet result. |

Peer connections are created with `jitsiE2EE: true` and the opaque
`jitsiE2EEConference` ID. Protection must exist before any sender, receiver, or
SDP operation. SDP creation waits for the acknowledged initial local key.
Native acknowledgments are also observed when legacy key-handler calls do not
await promises. Foreign endpoints and unexpected receiver-owner changes are
rejected.

On departure, key removal begins synchronously before the original `USER_LEFT`
listeners run. Pending work for that participant drains before original Olm
session disposal and key rotation. Conference leave revokes native media first,
cancels owned requests and debounces, drains callbacks, and frees Olm resources.
`leave()` and peer/session `close()` expose cleanup completion.

### Evidence and remaining work

The conference tests exercise the real `JitsiConference`, RTC construction,
managed key handlers, and lifecycle with native acknowledgment doubles. They do
not claim native encryption or live interoperability. The proof-of-concept
predecessor was exercised with a full iOS SDK simulator, a physical Apple TV,
and a browser over JVB, including six directed audio/video paths and participant
join/departure. This draft is rebased onto newer upstream Olm authentication
changes and requires fresh matched-version live testing. Android device media,
physical iPhone capture, in-call transitions, reconnects, and packaging against
maintainer-approved native artifacts are still required before release.
