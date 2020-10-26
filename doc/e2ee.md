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

At a high level the encrypted frame format looks like this:
```
     +------------+------------------------------------------+^+
     |unencrypted payload header (variable length)           | |
   +^+------------+------------------------------------------+ |
   | |                                                       | |
   | |                                                       | |
   | |                                                       | |
   | |                                                       | |
   | |                  Encrypted Frame                      | |
   | |                                                       | |
   | |                                                       | |
   | |                                                       | |
   | |                                                       | |
   +^+-------------------------------------------------------+ +
   | |                 Authentication Tag                    | |
   | +---------------------------------------+-+-+-+-+-+-+-+-+ |
   | |    CTR... (length=LEN + 1)            |S|LEN  |KID    | |
   | +---------------------------------------+-+-+-+-+-+-+-+-+^|
   |                                                           |
   +----+Encrypted Portion            Authenticated Portion+---+
```

We do not encrypt the first few bytes of the packet that form the
[VP8 payload](https://tools.ietf.org/html/rfc6386#section-9.1) (10 bytes for key frames, 3 bytes for interframes) nor
the [Opus TOC byte](https://tools.ietf.org/html/rfc6716#section-3.1)
This allows the decoder to understand the frame a bit more and makes it decode the fun looking garbage we see in the
video. This also means the SFU does not know (ideally) that the content is end-to-end encrypted and there are no
changes in the SFU required at all.

If the signature bit is set on the frame trailer, there is an additional fixed-length signature that is located
between the counter and the trailing bit:
```
     +------------+------------------------------------------+^+
     |unencrypted payload header (variable length)           | |
   +^+------------+------------------------------------------+ |
   | |                                                       | |
   | |                                                       | |
   | |                                                       | |
   | |                                                       | |
   | |                  Encrypted Frame                      | |
   | |                                                       | |
   | |                                                       | |
   | |                                                       | |
   | |                                                       | |
   +^+-------------------------------------------------------+ +
   | |                 Authentication Tag                    | |
   | +---------------------------------------+-+-+-+-+-+-+-+-+ |
   | |    CTR... (length=LEN + 1)            |  SIGNATURE    | |
   | +---------------------------------------+-+-+-+-+-+-+-+-+ |
   | |    SIGNATURE (fixed length)           |1|LEN  |KID    | |
   | +---------------------------------------+-+-+-+-+-+-+-+-+^|
   |                                                           |
   +----+Encrypted Portion            Authenticated Portion+---+
```

The signature is generated as
  Signature = Sign(signatureKey, Authentication Tag)
and covers the current frame. Not every frame is signed but there will be periodic
signatures on all SSRCs and streams. This prevents the impersonation attacks described in
  https://tools.ietf.org/html/draft-omara-sframe-00#section-4.4
We currently sign every frame, despite the overhead this incurs.

We currently use ECDSA with curve P-521 as described on
  https://developer.mozilla.org/en-US/docs/Web/API/EcKeyGenParams
and sign/verify with SHA-256:
  https://developer.mozilla.org/en-US/docs/Web/API/EcdsaParams
This results in a fixed length signature of 132 bytes.
We plan to make these options negotiable by exchanging them along with the key as a JWK:
  https://tools.ietf.org/html/rfc7517

### Using Web Workers

Insertable Streams are transferable and can be sent from the main JavaScript context to a
[Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker).
We are using a named worker (E2EEworker) which allows very easy inspection in Chrome DevTools.
