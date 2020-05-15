# End-to-end encryption using Insertable Streams

**NOTE** e2ee is work in progress.
This document describes some of the high-level concepts and outlines the design.
Please refer to the source code for details.

## Deriving the key from the e2eekey url hash
We take the key from the url hash.  Unlike query parameters this does not get
sent to the server so it is the right place for it. We use
the window.location.onhashchange event to listen for changes in the e2ee
key property.

It is important to note that this key should not get exchanged via the server.
There needs to be some other means of exchanging it.

From this key we derive a 128bit key using PBKDF2. We use the room name as a salt in this key generation. This is a bit weak but we need to start with information that is the same for all participants so we can not yet use a proper random salt.
We add the participant id to the salt when deriving the key which allows us to use per-sender keys. This is done to prepare the ground for the actual architecture and does not change the cryptographic properties.

We plan to rotate the key whenever a participant joins or leaves. However, we need end-to-end encrypted signaling to exchange those keys so we are not doing this yet.

## The encrypted frame
The derived key is used in the transformations of the Insertable Streams API.
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

We do not encrypt the first few bytes of the packet that form the VP8 payload
  https://tools.ietf.org/html/rfc6386#section-9.1
nor the Opus TOC byte
  https://tools.ietf.org/html/rfc6716#section-3.1

This allows the decoder to understand the frame a bit more and makes it generate the fun looking garbage we see in the video.
This also means the SFU does not know (ideally) that the content is end-to-end encrypted and there are no changes in the SFU required at all.

## Using workers

Insertable Streams are transferable and can be sent from the main javascript context to a Worker
  https://developer.mozilla.org/en-US/docs/Web/API/Worker
We are using a named worker (E2EEworker) which allows very easy inspection in Chrome Devtools.
It also makes the keys very self-contained.
