# End-to-End Encryption using Insertable Streams

## Overview

**NOTE** e2ee is work in progress.

This document describes some of the high-level concepts and outlines the design.
Please refer to the source code for details.

This library implements End-to-End Encryiption (E2EE) on supported endpopints (currently just browsers with support
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
every participant can derive it by ratchetting themselves.

Unlike described in [SFrame 4.3.5.1](https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1)
we attempt to ratchet the key forward when we do not find a valid authentication tag. Note that we only update
the set of keys when we find a valid signature which avoids a denial of service attack with invalid signatures.

## Media

### Packet format

We are using a variant of [SFrame](https://tools.ietf.org/html/draft-omara-sframe-00)
that uses a trailer instead of a header. We call it JFrame.
`
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
