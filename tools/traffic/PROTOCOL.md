# What BEYOND and an FB4 actually say to each other

Findings from captures taken on the Grace Cathedral show machine
(`169.254.42.165`, hostname `WIN-R4FTH86FTV5`) with six FB4s on a link-local
network: `169.254.45.4`, `.53.5`, `.200.242`, `.210.242`, `.213.242`, `.214.242`.
One capture is idle-ish, one is a paint session, and a later set is sliced by
action (idle baseline, hand-sent OSC, `signals probe` walk, idle tail).

Everything below was read off the wire. Where the evidence stops, this document
says so — nothing here is inferred from how we imagine Pangolin works. Reproduce
it with `./bin/decode <capture.pcapng>`.

## Three protocols, not one

| Port | Direction | Readable? | What it is |
| --- | --- | --- | --- |
| UDP 9022 | both | yes | FB4 discovery/announce, device settings, BEYOND announcing itself |
| UDP 16062 | BEYOND → network | yes, text | BEYOND's RGBA panel broadcast: what live control currently holds |
| TCP 3348 | BEYOND → FB4 | header only | the frame stream; body is encrypted |

The important consequence: **the readable traffic tells us BEYOND's state, and
the traffic that actually drives the lasers is encrypted.** We can observe and
verify, but this is not a path to driving an FB4 ourselves.

## UDP 16062 — live control, in plain text

While BEYOND's RGBA panel is open (`BEYOND.ini` `[Settings] ShowRGBAPanel=1`) it
broadcasts one datagram per live-control change, CRLF-terminated ASCII:

```
ControlZone 3\r\n
RGBA 0, 229\r\n
```

The zone line is context for the value line beneath it. Channels are numbered
`0=red 1=green 2=blue 3=alpha`, and `Brightness <n>` is its own line. Values are
0–255. Six zones appeared, numbered 1–6.

This is worth more than it looks. OSC is UDP and acknowledges nothing, so until
now "did BEYOND receive that?" was unanswerable. This broadcast answers it:
`./bin/rgba` watches it live, so you send a message and see the value move.
Zone numbering here is 1-based, while our OSC addresses (`/beyond/zone/{n}/…`)
are what BEYOND's OSC handler consumes — check the offset before trusting a
mapping between the two.

## UDP 9022 — who is on the network

Each FB4 announces itself; two shapes appear.

A short hello carries an ASCII model tag at offset `0x20` and a device id as a
little-endian u32 right after: `FB4E`, id 566604. Those ids match the serials
printed in BEYOND's FB4 Settings list.

Longer packets carry the 32-byte Pangolin header plus a flat array of
`(u32 tag, u32 value)` pairs — 223 of them per device here. Tags cluster by
leading nibble (`0x10xx`, `0x20xx`, …) and many values repeat as ~14006, which
reads like an index into a table BEYOND holds rather than a quantity. **No tag
has been identified.** `decode` counts them and keeps the raw values; naming them
needs controlled experiments (change one setting in BEYOND, capture, diff — which
is what `./bin/experiment` and `./bin/compare` are for), not guesswork.

BEYOND's own announce is distinguishable by a different magic (`0d be 00 00`)
and carries the show machine's hostname as UTF-16LE at `0x28`.

## TCP 3348 — the frame stream

One TCP connection per FB4, opened by BEYOND from an ephemeral port. Every
message is a 32-byte plaintext header and a body:

| offset | size | meaning |
| --- | --- | --- |
| 0 | 4 | magic `40 fb 00 00` |
| 4 | 4 | message type (LE u32) |
| 8 | 4 | total message length including this header (LE u32) |
| 12 | 4 | sequence, +1 per frame |
| 16 | 8 | clock/timestamp |
| 24 | 8 | second clock/timestamp |
| 32 | … | body |

Types observed:

| type | name used here | size | rate | direction |
| --- | --- | --- | --- | --- |
| `0x00030E02` | frame | 2392 B | 16–62/s per device | BEYOND → FB4 |
| `0x00010E02` | control | 80 B | 31–37/s per device | BEYOND → FB4 |
| `0x00008A0D` | telemetry | 2432 B | ~1/s | FB4 → BEYOND |
| `0x00008A0B` | unknown | 72 B | ~0.2/s | FB4 → BEYOND |

TCP gives no message boundaries — a 2392-byte frame arrives as 1460 + 932 — so
the length field is the only framing available, which is why reading this stream
requires reassembly before parsing.

Sequence numbers are continuous per connection (one discontinuity per capture,
at the point the capture starts mid-stream), so nothing is being dropped.

### The body is encrypted

Frame bodies measure ~8.00 bits/byte of entropy, do not compress, and two
consecutive frames of the same static content share almost no bytes. Point data
for 25 lasers would be highly structured and highly repetitive between frames;
this is neither. The FB4→BEYOND telemetry bodies sit lower (~6.09 bits/byte),
consistent with structure under a partly-random envelope, but they are not
readable either.

So: **the frame path cannot be decoded from captures alone**, and this is where
passive analysis ends. Getting further would need something a capture cannot
provide (key material, instrumented software, or vendor documentation) — and
per the standing constraint on this toolkit, nothing here transmits toward the
hardware regardless.

## Two things the sliced capture set settled

**One FB4 was getting no frames at all.** `169.254.45.4` (`FB4E`, id 566604)
announced itself on 9022 in every capture, but has zero TCP 3348 traffic in any
of them: BEYOND was streaming to five devices, not six, so that projector could
only ever have been dark. `decode` now says so per device — being on the network
and being driven are different things, and only the second one lights a laser.

**A closed RGBA panel is why OSC can land and do nothing.** Those captures show
90 OSC packets delivered to port 8000 with no ICMP port-unreachable in reply —
delivery proven — and *zero* packets on 16062, where the earlier paint capture
had 675. With the panel closed BEYOND does not broadcast, and the `livecontrol`
colour addresses are gated, so "the messages arrived" and "the colour changed"
were never the same claim. Silence on 16062 is the signal to check
`ShowRGBAPanel` before debugging anything else.

What they did *not* settle: none of them contains a TCP SYN, so BEYOND's
connection setup has still never been captured. If key material is negotiated
there, it remains unseen — capture with the FB4s power-cycled and BEYOND started
afterwards to catch it.

## Ports, precisely

Worth stating because it is easy to get backwards from packet counts: 9022 is
*only* discovery — 38 packets across a 7-second idle baseline. The frames are
TCP 3348, ~62 messages/s per device, continuous even through a blackout. A high
packet rate on the wire is the frame stream, never discovery.

## Ways in that are not this protocol

Since the frame stream can't be driven, the documented non-BEYOND routes matter.
Per Pangolin's wiki, an FB4 listens for OSC on port 8000 for its own settings
including `operation_mode`, and in ArtNet mode presents a 16- or 39-channel DMX
fixture profile over ethernet. Both are colour/brightness/playback control over
content stored on the FB4's SD card — not arbitrary geometry from us, which the
encrypted stream is the only path to. Untested here; noted so the option isn't
rediscovered from scratch.

## What this is good for

- Confirming an OSC message reached BEYOND, and what value it set, per zone
  (`./bin/rgba`, or `./bin/decode --timeline` on a capture).
- Confirming every FB4 is present, with its id/MAC, without opening BEYOND —
  and which of them BEYOND is actually streaming to.
- Confirming BEYOND is streaming to each FB4, at what rate, and whether frames
  are being dropped — i.e. telling "the show isn't reaching the lasers" apart
  from "the lasers are being told to draw nothing".
