# Delta Frames Tests — Minimal Spec

## 1. What is a "delta frame"?

A **delta (inter) frame** is a VP8 video frame that only stores *changes* since the last key-frame (not the full picture).

From [Context.ts](../e2ee/Context.ts):
```
UNENCRYPTED_BYTES = {
    delta: 3,    // <- 3 bytes of VP8 header kept UNENCRYPTED (SFU needs this)
    key:   10,   // <- 10 bytes kept for full key-frame headers
    undefined: 1 // <- 1 byte Opus TOC for audio
}
```

Real-world path (in production):
> Browser `RTCEncodedVideoFrame.type === 'delta'`
> → [Worker.ts](../e2ee/Worker.ts#L48-L56) pipes through `Context.encodeFunction` / `decodeFunction`
> → `.type` is used directly by [Context.ts](../e2ee/Context.ts)

**Current status:** No existing test covers `type: 'delta'`. The TODO at
[Context.spec.ts L20-L27](./Context.spec.ts#L20-L27) lists it first.

---

## 2. Encode: Input → Output (delta, 12-byte videoBytes)

### Input
```
encodedFrame = {
    data:        [0xde,0xad,0xbe,0xef,0xde,0xad,0xbe,0xef,0xde,0xad,0xbe,0xef]  (12B)
    type:        'delta'
    timestamp:   <RTP ts>
    getMetadata: () => ({ synchronizationSource: 321 })
}
```

### Early-exit gate ([Context.ts L298](../e2ee/Context.ts#L298))
```
if (byteLength < 3) → passthrough (short/empty frame, like DTX for audio)
```
12 < 3 → FALSE → encrypts normally.

### Key differences from `type:'key'`

| Property              | type:'key' | type:'delta' |
|-----------------------|-----------:|-------------:|
| UNENCRYPTED_BYTES     |        10  |          3   |
| frameHeader (AAD) len |        10  |          3   |
| AES-GCM plaintext     |     12-10=2|      12-3=9  |

### Output size (ALWAYS 30 bytes overhead regardless of type)
```
frameHeader (3) + ciphertext(9) + GCM tag(16) + IV(12) + trailer(2)
= 3 + 25 + 12 + 2 = 42 bytes
= 12 (original) + 30
```

### Output byte layout (delta, 42 bytes total)
```
Offset  Size  Content
------  ----  --------
0-2      3B   frameHeader = INPUT[0..2]  (IN CLEAR — checked by TODO #2)
3-11     9B   AES ciphertext (scrambled INPUT[3..11])
12-27   16B   AES-GCM authentication tag
28-39   12B   IV = SSRC(4) ‖ RTP-ts(4) ‖ sendCount(4)
40       1B   IV_LENGTH = 12 (0x0C)
41       1B   KID = keyIndex (0 in our tests)
```

---

## 3. Decode + Round-Trip (delta)

### Decode re-uses the same `type:'delta'` on the frame object
The **caller** (Worker.ts + browser API) sets `.type` on the decoded frame before
it reaches decode. Nothing inside the encrypted buffer says "delta" — it's on the
outer frame object.

### `_decryptFrame` delta math ([Context.ts L107-L132](../e2ee/Context.ts#L107-L132))
```
frameHeader      = first 3 bytes  (AAD input — must match encode EXACTLY)
cipherTextStart  = 3
cipherTextLength = 42 - (3 + 12 + 2) = 25 bytes  (9 payload + 16 tag)
reassembled      = 3 header + decrypted 9 bytes  = 12 bytes original
```

### Round-trip success condition
```
Array.from(output.data) === [0xde,0xad,0xbe,0xef,0xde,0xad,0xbe,0xef,0xde,0xad,0xbe,0xef]
```

---

## 4. Edge Cases Specific to Delta Frames

| #  | Scenario                           | Threshold used     | Expected behavior |
|----|------------------------------------|--------------------|-------------------|
| A  | `byteLength === 3` (header only)   | `3 < 3` → FALSE    | Encrypts 0 bytes payload + 16B tag → 3+30=33B out. No throw. |
| B  | `byteLength === 2` (degenerate)    | `2 < 3` → TRUE     | Passthrough. Same ref. Like audio DTX. |
| C  | `B` then real frame in a TransformStream | —         | Stream stays usable; second frame encrypts normally. |
| D  | Unencrypted-header check           | bytes 0..2         | Output[0..2] === Input[0..2] EXACT. |
| E  | Ratchet-forward (5 times) + delta  | RATCHET_WINDOW=8   | Decoder auto-ratchets 5x → success. |

---

## 5. Impact Radius (which files are touched?)

| File                               | Touched?  | Reason |
|------------------------------------|-----------|--------|
| `Context.spec.ts`                  | ✅ ONLY   | New helper `makeDeltaVideoFrame()` + 6 new `it(...)` blocks. |
| `Context.ts`                       | ❌        | Code already exists. Only patch if tests *find a bug*. |
| `crypto-utils.ts`, `Worker.ts`, …  | ❌        | Unrelated / type-agnostic. |
| `karma.conf.js`, `package.json`    | ❌        | `./modules/**/*.spec.ts` glob already picks it up. |

**Risk: LOW** — tests are additive; beforeEach already creates fresh contexts.

---

## 6. Concrete Test Plan (6 core tests)

### Helper to add
```ts
function makeDeltaVideoFrame(customData?: ArrayBuffer) {
    return {
        data: customData ?? new Uint8Array(videoBytes).buffer,
        type: 'delta',
        getMetadata: () => ({ synchronizationSource: 321 })
    };
}
```

### (E1) Encode — 'with a video delta frame'
→ `expect(output.byteLength).toBe(12 + 30)` → 42 bytes.

### (E2) Encode — 'leaves first 3 bytes unencrypted for delta'
→ For i in 0,1,2:  `output[i] === videoBytes[i]`.  (Combines TODO #1 + #2.)

### (E3) Encode — 'passes 2-byte degenerate delta frame through'
→ No throw; enqueues same reference; byteLength still 2.

### (D1) Decode — 'passes 2-byte degenerate delta frame through'
→ Passthrough symmetric with encode; no await-reject.

### (ET1) End-to-end — 'with a video delta frame'
→ `Array.from(output) === videoBytes`; byteLength === 12.  (Smoke test.)

### (ET2) End-to-end — 'receiver ratchets forward on delta'
→ Sender ratchets key once, encodes delta; receiver auto-recounters.
(Combines TODO #1 + #5.)

### Nice-to-have (after core 6 pass)
- (N1) 3-byte delta round-trips (edge-case A above)
- (N2) 2-byte + 12-byte delta inside TransformStream (analog of L142 test)
