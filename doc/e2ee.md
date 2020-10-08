# End-to-end encryption using Insertable Streams

**NOTE** e2ee is work in progress.
This document describes some of the high-level concepts and outlines the design.
Please refer to the source code for details.

## Packet format
We are using a variant of
  https://tools.ietf.org/html/draft-omara-sframe-00
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

We do not encrypt the first few bytes of the packet that form the VP8 payload
  https://tools.ietf.org/html/rfc6386#section-9.1
(10 bytes for key frames, 3 bytes for interframes) nor the Opus TOC byte
  https://tools.ietf.org/html/rfc6716#section-3.1
This allows the decoder to understand the frame a bit more and makes it decode the fun looking garbage we see in the video.
This also means the SFU does not know (ideally) that the content is end-to-end encrypted and there are no changes in the SFU required at all.

## Key Ratcheting
Unlike described in
  https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
we attempt to ratchet the key forward when we do not find a valid
authentication tag. Note that we only update the set of keys when
we find a valid signature which avoids a denial of service attack with invalid signatures.

TODO: if a frame ratchets the key forward it should be signed with the senders private key.

## Using workers

Insertable Streams are transferable and can be sent from the main javascript context to a Worker
  https://developer.mozilla.org/en-US/docs/Web/API/Worker
We are using a named worker (E2EEworker) which allows very easy inspection in Chrome Devtools.
It also makes the keys very self-contained.
