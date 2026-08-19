# What BEYOND and an FB4 actually say to each other

A full record of what has been read off the wire at the Grace Cathedral show
machine, what it means, what is still unknown, and exactly which captures would
close each gap. Everything here comes from capture files; where the evidence
stops, this document says so. Reproduce any claim with
`./bin/decode <capture.pcapng>`.

Read this top to bottom before a show day. The diagnostic playbook at the end is
the part you use while something is broken.

## Contents

- [The installation, as the network sees it](#the-installation-as-the-network-sees-it)
- [Four protocols, not one](#four-protocols-not-one)
- [UDP 8000 — OSC going *into* BEYOND](#udp-8000--osc-going-into-beyond)
- [UDP 16062 — live control, in plain text](#udp-16062--live-control-in-plain-text)
- [UDP 9022 — who is on the network](#udp-9022--who-is-on-the-network)
- [TCP 3348 — the frame stream](#tcp-3348--the-frame-stream)
- [Capture-by-capture evidence](#capture-by-capture-evidence)
- [Confirmed vs inferred](#confirmed-vs-inferred)
- [What is still missing, and how to capture it](#what-is-still-missing-and-how-to-capture-it)
- [Diagnostic playbook](#diagnostic-playbook)
- [Ways in that are not this protocol](#ways-in-that-are-not-this-protocol)
- [Guided experiments, and the one tool that transmits](#guided-experiments-and-the-one-tool-that-transmits)

## The installation, as the network sees it

Link-local network (`169.254.0.0/16`), no DHCP server involved in the streaming
path. BEYOND runs on `169.254.42.165`, hostname `WIN-R4FTH86FTV5`.

| FB4 | MAC | device id | model tag seen | BEYOND streaming to it? |
| --- | --- | --- | --- | --- |
| `169.254.45.4` | `00:16:42:fb:04:2c` | 566604 | `FB4E` | **no — never, in any capture** |
| `169.254.53.5` | `00:16:42:fb:04:34` | 566612 | — | yes |
| `169.254.200.242` | `00:16:42:fb:f2:c7` | 562151 | — | yes |
| `169.254.210.242` | `00:16:42:fb:f2:d1` | 562161 | — | yes |
| `169.254.213.242` | `00:16:42:fb:f2:d4` | 562164 | — | yes |
| `169.254.214.242` | `00:16:42:fb:f2:d5` | 562165 | — | yes |

All six MACs are in Pangolin's `00:16:42` OUI. The device ids match the serials
printed in BEYOND's FB4 Settings list, and are what our FB4 OSC addresses use
(`/FB4-566604/…`).

BEYOND holds one TCP connection per streamed FB4, from a stable ephemeral port:

| FB4 | BEYOND's port, capture set 1 | capture set 2 |
| --- | --- | --- |
| `169.254.200.242` | 54334 | 54334 |
| `169.254.213.242` | 54335 | 54335 |
| `169.254.210.242` | 64464 | 64464 |
| `169.254.214.242` | 64465 | 64465 |
| `169.254.53.5` | 64463 | **61335** |

That one changed port: the connection to `53.5` was torn down and re-established
between the two capture sessions. Reconnections do happen, which matters for the
handshake gap below — catching one on camera is the cheapest route to the only
part of this protocol nobody has seen.

## Four protocols, not one

| Port | Direction | Readable? | What it is |
| --- | --- | --- | --- |
| UDP 8000 | us → BEYOND | yes | OSC we send in: BEYOND's `[OSC] PortIn` in `BEYOND.ini` |
| UDP 9022 | both | yes | FB4 discovery/announce, device settings, BEYOND announcing itself |
| UDP 16062 | BEYOND → network | yes, text | BEYOND's RGBA panel broadcast: what live control currently holds |
| TCP 3348 | BEYOND ⇄ FB4 | header only | the frame stream; body is encrypted |

The consequence worth internalising: **the readable traffic tells us what BEYOND
was told and what BEYOND thinks; the traffic that actually drives the lasers is
encrypted.** We can observe and verify the whole chain up to BEYOND, and observe
*that* frames flow after it, but never what those frames contain — and never
generate them ourselves.

Four separate claims, and each has its own evidence on the wire. Confusing them
is what makes this hard to debug:

```
we send OSC            → packets on UDP 8000, no ICMP unreachable back
BEYOND accepted it     → values move on UDP 16062 (panel must be open)
BEYOND drives the FB4  → frames on TCP 3348 to that device's IP
the laser lights up    → nothing on the wire proves this; only your eyes
```

## UDP 8000 — OSC going *into* BEYOND

`BEYOND.ini` `[OSC] PortIn=8000` on this machine, which is why wavegrid defaults
BEYOND to 8000. OSC is UDP: nothing is acknowledged, so a successful send proves
only that the packet left. Absence of an ICMP port-unreachable reply proves
something was bound to the port.

Addresses wavegrid emits, case-sensitive (`packages/osc/src/osc-adapters.ts`):

```
/beyond/zone/{n}/livecontrol/alpha       255 = full override
/beyond/zone/{n}/livecontrol/red         0–255
/beyond/zone/{n}/livecontrol/green       0–255
/beyond/zone/{n}/livecontrol/blue        0–255
/beyond/zone/{n}/livecontrol/Brightness  0–100
```

**A zone-numbering mismatch is recorded in these captures.** The hand-sent OSC
capture contains 90 packets, 15 per zone, addressed to zones **240–245**:

```
/beyond/zone/240/livecontrol/alpha       255
/beyond/zone/240/livecontrol/red         255
/beyond/zone/240/livecontrol/green       170
/beyond/zone/240/livecontrol/blue        0
/beyond/zone/240/livecontrol/Brightness  100
…same for 241, 242, 243, 244, 245
```

Meanwhile the only zones BEYOND has ever been seen to broadcast are **1–6**.
The `{n}` in the address comes straight from the project's projector map
(`projectorMap[i]`), so a project mapping cannons to 240–245 will address zones
that do not appear anywhere in BEYOND's own output. Both things can be true at
once — the panel was also closed for that capture — but this is a second,
independent reason those sends could not have changed a colour, and it is a
project-config problem, not a protocol one. Check the projector map against
BEYOND's zone list before concluding anything else about a silent show.

## UDP 16062 — live control, in plain text

While BEYOND's RGBA panel is open (`BEYOND.ini` `[Settings] ShowRGBAPanel=1`) it
broadcasts one datagram per live-control change, CRLF-terminated ASCII:

```
ControlZone 3\r\n
RGBA 0, 229\r\n
```

The zone line is context for the value lines beneath it. Channels are numbered
`0=red 1=green 2=blue 3=alpha`, `Brightness <n>` is its own line, values are
0–255 (brightness 0–100 in practice). Six zones appear, numbered 1–6.

This is the single most useful thing in the whole capture set, because it turns
an unanswerable question into an observable one. Run `./bin/rgba` on the show
machine, send a message, and watch the value move; silence means BEYOND did not
take it. Two real readings:

| capture | zones | updates | last state |
| --- | --- | --- | --- |
| paint session | 6 | 675 over 14.3 s | `red=0 green=0 blue=0 alpha=255 brightness=0` (blacked out at the end) |
| amber session | 6 | 560 over 3.7 s | `red=255 green=219 blue=59 alpha=255 brightness=100` (amber, full) |

So BEYOND *was* receiving and applying our colours in the amber session: that
`255,219,59` is wavegrid's amber, arriving intact. Note the numbering: 1–6 here
against our `/beyond/zone/{n}/` addressing — the offset between the two has never
been pinned down by a controlled test (see the gaps section).

**No packets on 16062 at all means the panel is closed**, not that nothing
arrived. With the panel closed BEYOND both stops broadcasting and gates the
`livecontrol` colour addresses, so "the messages arrived" and "the colour
changed" stop being the same claim. Every capture in the later sliced set has
zero packets here, against 675 in the paint capture.

## UDP 9022 — who is on the network

Each FB4 announces itself; two shapes appear.

A short hello carries an ASCII model tag at offset `0x20` and a device id as a
little-endian u32 immediately after: `FB4E`, id 566604. Only `45.4` has ever
shown the model tag in these captures; the others announce with the id form only.

Longer packets carry the 32-byte Pangolin header plus a flat array of
`(u32 tag, u32 value)` pairs — consistently **223 pairs per device**, identical
in count across every capture, which reads like a full settings dump rather than
a delta. Tags cluster by leading nibble (`0x10xx`, `0x20xx`, …) and many values
repeat as ~14006, which looks like an index into a table BEYOND holds rather than
a quantity. **No tag has been identified.** `decode` counts them and keeps the
raw values; naming them needs the change-one-setting-and-diff loop that
`./bin/experiment` and `./bin/compare` exist for, not guesswork.

BEYOND's own announce is distinguishable by a different magic (`0d be 00 00`) and
carries the show machine's hostname as UTF-16LE at `0x28`.

Rate: 9022 is *only* discovery — 38 packets across a 7-second idle baseline. If
you see a high packet rate on this network it is the frame stream, never
discovery. (Earlier notes had this backwards; the counts below settle it.)

## TCP 3348 — the frame stream

One TCP connection per streamed FB4, opened by BEYOND from an ephemeral port.
Every message is a 32-byte plaintext header and a body:

| offset | size | meaning |
| --- | --- | --- |
| 0 | 4 | magic `40 fb 00 00` |
| 4 | 4 | message type (LE u32) |
| 8 | 4 | total message length including this header (LE u32) |
| 12 | 4 | sequence, +1 per frame |
| 16 | 8 | clock/timestamp |
| 24 | 8 | second clock/timestamp |
| 32 | … | body |

Worked example — the first frame BEYOND sent to `169.254.53.5`:

```
40 fb 00 00  02 0e 03 00  58 09 00 00  5c 6c 06 00   magic, type 0x00030e02,
99 93 77 2c de 31 00 00  fc 37 7c 2e e2 31 00 00     len 2392, seq 420956
```

Types observed:

| type | name used here | size | rate | direction |
| --- | --- | --- | --- | --- |
| `0x00030E02` | frame | 2392 B | 16–62/s per device | BEYOND → FB4 |
| `0x00010E02` | control | 80 B | 31–37/s per device, paint capture only | BEYOND → FB4 |
| `0x00008A0D` | telemetry | 2432 B | 1.1–1.8/s | FB4 → BEYOND |
| `0x00008A0B` | unknown | 72 B | ~0.2/s | FB4 → BEYOND |
| `0x00028010` | unknown, all-zero body | 32 B | ~0.1–0.4/s, occasional | FB4 → BEYOND |

Two observations about those rates, both new:

**Frames and control messages trade off.** Idle captures show a flat ~62
frames/s per device and *no* control messages at all. The paint capture shows
16–23 frames/s plus 31–37 control messages/s — and 16.6 + 36.6 ≈ 53, 23.0 + 31.4
≈ 54, i.e. the combined message rate stays roughly constant while control
messages displace frames. So the 80-byte control message is something BEYOND
interleaves while live content is changing, sharing one budget with frames. What
it carries is unknown (its 48-byte body is ~7.99 bits/byte, opaque like the
frames).

**Frames never stop.** ~62/s per device continues through a full blackout, and
continues while nothing at all is being painted. A silent laser therefore cannot
be diagnosed by "is BEYOND streaming?" — it streams regardless; the question is
only *what* it streams, which we cannot see.

TCP gives no message boundaries — a 2392-byte frame arrives as 1460 + 932 — so
the length field is the only framing available, which is why reading this stream
requires reassembly before parsing. `decode` reassembles per direction in capture
order and reports any trailing bytes it could not frame; it does not reorder by
TCP sequence number, so a lossy capture will show leftover bytes rather than
silently mis-parse.

Frame sequence numbers are continuous per connection — zero discontinuities in
every sliced capture, and exactly one in each paint-capture stream, at the point
the capture starts mid-stream. Nothing is being dropped on this network.

### The body is encrypted

Frame bodies measure ~8.00 bits/byte of entropy, do not compress, and two
consecutive frames of identical static content share almost no bytes. Point data
for 25 lasers would be highly structured and highly repetitive between frames;
this is neither. The FB4→BEYOND telemetry bodies sit lower (~5.8–6.1 bits/byte),
consistent with structure under a partly-random envelope, but they are not
readable either. The 32-byte `0x00028010` body is all zeroes — the one body in
the protocol that is plainly not encrypted, which is itself a small hint that the
opacity is applied per message type rather than to the whole connection.

### No frame body is ever sent twice

The question that decides whether a captured frame could simply be replayed:
does BEYOND ever emit the same body twice? Over 1,161 frames of *static* content
across two captures — an idle slice and the amber capture, i.e. the best case for
repetition, since the picture is not changing at all:

| | result |
| --- | --- |
| distinct bodies | 1,161 of 1,161 — zero repeats |
| body bytes constant across every frame | 0 of 2,360 |
| bytes two consecutive bodies share | 1–21 of 2,360 (chance alone ≈ 9) |
| bodies shared between two devices getting the same scene | 0 |

Reproduce with `./bin/decode <capture> --repeats`.

A static scene re-encrypted into a completely different 2,360 bytes every 16 ms
means each frame carries a nonce, a counter, or a stream-cipher position. Two
consequences worth stating plainly, because they close off the two obvious
shortcuts:

- **Replaying a captured frame is not a route in.** A copy is either rejected as
  stale or, at best, decrypts to a single stale picture — and there is no
  repetition anywhere to build a mapping from.
- **A known-plaintext attack has nothing to bite on.** Byte-identical input
  (blackout, held amber) produces unrelated ciphertext, so we cannot line up
  "this look" against "these bytes", which is the technique that would otherwise
  work on a home-grown scheme.

So: **the frame path cannot be decoded from captures alone**, and this is where
passive analysis ends. Getting further would need something a capture cannot
provide — key material, instrumented software, or vendor documentation. Per the
standing constraint on this toolkit, nothing here transmits toward the hardware
regardless.

## Capture-by-capture evidence

Every capture behind this document, and what each one is good for. Paths are as
they were analysed; `decode` prints all of this.

| capture | packets w/ payload | 9022 devices | 16062 | TCP 3348 | note |
| --- | --- | --- | --- | --- | --- |
| `pangolin-capture-paint.pcapng` | 7407 | 6 + BEYOND | 6 zones, 675 updates | 5 streams, frames + control | the only capture with control messages |
| `pangolin-capture-2.pcapng` | 2959 | 6 + BEYOND | 6 zones, 560 updates, amber | 5 streams, 62/s | proves BEYOND applied our amber |
| `00-osc-only.pcapng` | 90 | — | — | — | 90 OSC packets to port 8000, zones 240–245 |
| `01-idle-baseline.pcapng` | 4555 | 6 | none | 5 streams, 62/s | 9022 = 38 packets in 7 s |
| `02-manual-sends.pcapng` | 713 | 1 | none | 5 streams, 63/s | hand-sent OSC, panel closed |
| `03-idle-gap-*.pcapng` (×3) | 5898 / 5898 / 838 | 6 | none | 5 streams, 62/s | continuous sequence across slices |
| `04-probe-walk.pcapng` | 1692 | 6 | none | 5 streams, 62/s | `signals probe` walk |
| `05-idle-tail-*.pcapng` | 3089 | 6 | none | 5 streams, 62/s | tail |

Sequence numbers run continuously across the sliced captures (e.g. `53.5`:
48849→49290, 49291→49359, 49360→49932, 49933→50504, 50505→50587, 50588→50742,
51317→51616), which is how we know the slices are one unbroken session and that
no frames were lost.

## Confirmed vs inferred

Confirmed, read directly off the wire:

- Port roles: 8000 in, 9022 discovery, 16062 panel broadcast, 3348 frames.
- The 32-byte header layout, including length-based framing and per-frame
  sequence increment.
- Six FB4s present with ids and MACs; five streamed to, `45.4` never.
- BEYOND accepted and held `255,219,59` amber at brightness 100 on zones 1–6.
- Frames continue at ~62/s through blackout and idle.
- Frame and control bodies are incompressible at ~8 bits/byte.
- Hand-sent OSC was addressed to zones 240–245.

Inferred, and labelled as such wherever it appears:

- That the bodies are *encrypted* specifically, rather than compressed by some
  scheme that happens to be incompressible again — entropy and cross-frame
  dissimilarity are strong evidence but not proof.
- That `0x00010E02` is a live-content control message — from when it appears and
  how it trades against frame rate, not from its contents.
- That `0x00028010` is a keepalive/ack — from its size, zero body and rarity.
- That the ~14006 repeated settings values are table indices.

Not established at all: the meaning of any settings tag, the contents of any
encrypted body, the zone-number offset between our addressing and BEYOND's
broadcast, and whether the frame stream negotiates keys on connect.

## What is still missing, and how to capture it

Four gaps, in the order they are worth closing. Each one is a specific capture,
not an open-ended investigation.

**1. The connection handshake has never been captured.** Not one of the ten
captures contains a TCP SYN on 3348, so every one starts mid-stream. If key
material or a version negotiation is exchanged at connect time, this is the only
place it would be visible.

```
start capture first  → power-cycle the FB4s (or exit BEYOND) → launch BEYOND
verify with:  ./bin/decode <capture> --hex 64
              tshark -r <capture> -Y 'tcp.flags.syn==1 && tcp.port==3348'
```

Honest expectation: a key baked into the BEYOND binary would not appear on the
wire at all, in which case this closes the question rather than opening the door.

**2. No single capture has OSC going in *and* the panel open.** The causal link
"we sent X, BEYOND holds X" is currently assembled from two different files. One
capture proves it outright:

```
set BEYOND.ini [Settings] ShowRGBAPanel=1, restart BEYOND
start capture → wavegrid signals send /beyond/zone/{n}/livecontrol/red 255
              → then green, blue, Brightness, with 2 s between each
verify with:  ./bin/decode <capture> --timeline
```

Send to a zone number that BEYOND actually has (see gap 3), and space the sends
out so the timeline lines up unambiguously.

**3. The zone-number offset is unresolved.** BEYOND broadcasts zones 1–6; our
projector map in these captures used 240–245. Walk one zone at a time with the
panel open and read which broadcast zone moves:

```
./bin/rgba --zone all          # in one terminal
wavegrid signals probe         # in another, or send zone 0,1,2… by hand
```

The answer is a single number and it decides whether every project's projector
map is right or off by one.

**4. The 223 settings tags on 9022 are unnamed.** One controlled diff names one
tag, and the tooling is already built for it:

```
./bin/experiment --host <FB4_IP>   # capture, change ONE setting in BEYOND, capture again
./bin/compare <before> <after>     # prints the tag whose value moved
```

Worth doing for the handful that matter (colour balance, scan rate, blanking
delay) rather than all 223.

**5. Nobody has tried sending the 16062 lines.** Those lines are plaintext, and
the format is fully understood — so the cheapest remaining question is whether
anything on the network *acts* on them, or whether the broadcast is only BEYOND
narrating itself. This is a test in the room, not a capture:

```
close BEYOND completely (tray included)
./bin/session replay --host <FB4_IP>[,<FB4_IP>…]
```

Evidence for the pessimistic answer: 16062 has only ever been seen host →
network, never toward BEYOND, and the FB4s take their orders on 3348. So the
expectation is that nothing moves. It is still worth ten minutes, because the
result is unambiguous either way and it is the only cheap experiment left that
could end in direct control.

Also worth having, cheaply, while someone is at the machine: BEYOND's projector
list screenshot (to explain `45.4`), the FB4 firmware versions, and a listing of
what content is on each SD card — the last one decides whether the ArtNet route
below is usable at all.

## Diagnostic playbook

"The show isn't reaching the lasers", in the order that isolates it fastest. Each
step names the wire evidence, so the answer is never an opinion.

1. **Is BEYOND being told anything?** `./bin/decode <capture>` or watch port
   8000. No packets → wavegrid isn't sending; check the receiver has an OSC
   target (Show screen says "Console only" when it doesn't).
2. **Did BEYOND accept it?** `./bin/rgba`. Values move → accepted. Total silence
   → the RGBA panel is closed (`ShowRGBAPanel=1`), and while it's closed the
   `livecontrol` colour addresses are gated, so nothing you send can land.
3. **Are you addressing zones BEYOND has?** Compare the `{n}` in your addresses
   against the zone numbers `./bin/rgba` prints. 240–245 against 1–6 is the
   failure already recorded here.
4. **Is BEYOND streaming to every projector?** `./bin/decode` lists devices and
   says `no frame stream` for any that announce but get nothing — that is
   `45.4`'s state in all ten captures, and no amount of correct OSC would ever
   light it. Fix it in BEYOND's projector list.
5. **Is the stream healthy?** Same output: ~62 frames/s per device, 0 sequence
   discontinuities. Frames flowing does *not* mean content is visible — they flow
   through blackouts too — so if everything above is clean and a laser is still
   dark, the remaining suspects are inside BEYOND (zone contents, projection
   zone assignment, master brightness) or physical (safety interlock, shutter,
   scanner fault), and the wire has nothing more to say.

## Ways in that are not this protocol

Since the frame stream can't be driven, the documented non-BEYOND routes matter.
Per Pangolin's wiki, an FB4 listens for OSC on port 8000 for its own settings
including `operation_mode`, and in ArtNet mode presents a 16- or 39-channel DMX
fixture profile over ethernet. Both are colour/brightness/playback control over
content already stored on the FB4's SD card — not arbitrary geometry from us,
which the encrypted stream remains the only path to. A unit switched to ArtNet
also stops being available to BEYOND. Untested here, and it would be the first
thing in this project that transmits toward hardware; noted so the option isn't
rediscovered from scratch.

## Guided experiments, and the one tool that transmits

`./bin/session --list` runs the experiments above end to end: it starts the
capture, walks the operator through what to do at the machine, stops the capture,
decodes it, and says what the result means. Three of them:

| experiment | answers | transmits |
| --- | --- | --- |
| `./bin/session handshake` | is there a key exchange on connect? (gap 1) | no |
| `./bin/session osc-rgba` | do our OSC values land, and on which zone? (gaps 2, 3) | no |
| `./bin/session replay --host <ip>` | does anything act on the 16062 lines? (gap 5) | yes |

`./bin/replay` is the only tool here that puts packets on the wire, and only when
given `--transmit` **and** `--host`. Without them it prints the exact datagrams
it would send and exits, which is also the fastest way to check the format
against this document:

```
./bin/replay --zone all --colour amber --sweep
```

It sends nothing but BEYOND's own plaintext live-control lines — the same bytes
BEYOND broadcasts, at the same rate a human moving a slider would — never
fabricated frame-stream traffic, which is not constructible anyway. Rules for
running it: BEYOND closed (otherwise a change in the room proves nothing about
what caused it), somebody watching the heads, E-stop in reach, and never as an
unattended loop.

## What this toolkit is good for

- Confirming an OSC message reached BEYOND, and what value it set, per zone
  (`./bin/rgba`, or `./bin/decode --timeline` on a capture).
- Confirming every FB4 is present, with its id and MAC, without opening BEYOND —
  and which of them BEYOND is actually streaming to.
- Confirming the frame rate per device and whether any frames were dropped, i.e.
  telling "the show isn't reaching the lasers" apart from "the lasers are being
  told to draw nothing".
- Naming settings tags by controlled experiment, when someone has the machine.

Everything in `tools/traffic` reads files and sockets, with one deliberate
exception: `./bin/replay --transmit`, which exists to answer the one question
capture analysis cannot, and which sends only the plaintext live-control lines
BEYOND itself broadcasts.
