# traffic — watching BEYOND talk to an FB4

A small CLI toolkit for capturing and reverse-engineering the network traffic
between Pangolin BEYOND and Pangolin laser hardware (an FB4), built on
Wireshark's command-line tools.

**Passive, with one deliberate exception.** Everything here lists interfaces,
reads the neighbour table, captures and analyses files on disk. The exception is
`bin/replay`, which sends BEYOND's own plaintext live-control lines — and only
when given `--transmit` and a `--host`; without them it prints the bytes it would
send and exits. Nothing here ever fabricates frame-stream traffic.

Nothing in the Wavegrid app depends on these tools being installed — the app
only looks for them when you open the Traffic tab (Advanced → Traffic), which
is also where you choose the directory captures are written to.

## Requirements

- `tshark`, `dumpcap`, `capinfos`, `editcap`, `mergecap` — all ship with
  Wireshark. On macOS they live inside `Wireshark.app`, and the scripts look
  there, so a plain drag-to-Applications install works without touching `PATH`.
- `python3` (macOS and Linux both have it) for `compare`, `decode`, `rgba` and
  `replay`.
- Permission to capture. `./bin/doctor` says whether you have it and prints the
  exact privileged command if you do not — it never runs it for you.

```
./bin/doctor            # OS, tool paths and versions, capture permission, capture dir
```

## Finding the hardware

```
./bin/interfaces                    # capture devices with their addresses
./bin/interfaces --host 10.0.0.42   # marks the interface on the FB4's subnet
./bin/discover                      # listen 10s, rank the peers we exchange packets with
./bin/discover --iface en7 --seconds 20
```

`discover` ranks by what the traffic looks like rather than by port numbers: an
FB4 taking frames is a steady, two-way, high-rate UDP conversation. Confirm a
candidate by starting laser output in BEYOND and re-running — the FB4 is the peer
whose packet rate jumps.

## Capturing

```
./bin/capture --iface en7 --host 10.0.0.42 --label idle --seconds 20
./bin/capture --iface en7 --host 10.0.0.42 --label output-on --background
./bin/capture --status
./bin/capture --stop
```

Captures land in the capture directory as `<timestamp>-<label>.pcapng` next to a
`.json` sidecar recording the interface, host filter and tool version — without
that, two captures taken a week apart are not comparable. `--host` becomes a
capture filter (`host <ip>`), so nothing else reaches the disk; that matters when
a laser is streaming frames.

The directory is, in order of precedence: `--dir`, `$TRAFFIC_CAPTURE_DIR`,
`captureDir` in `~/.wavegrid/traffic.json` (what the Traffic tab writes), or
`./captures` here.

## Analysing

```
./bin/analyze captures/20250101-120000-output-on.pcapng
./bin/analyze captures/… --host 10.0.0.42 --hex 8 --bytes 128
```

Endpoints, conversations, per-flow packet counts/bytes/rate, packet size
distribution, inter-packet gaps (a fixed gap means a stream; bursty gaps mean
request/reply), and hex dumps of the first payloads.

```
./bin/extract captures/big.pcapng --host 10.0.0.42     # smaller capture, same packets
./bin/extract captures/big.pcapng --port 7765
```

## Decoding

`analyze` treats a capture as bytes; `decode` treats it as Pangolin:

```
./bin/decode captures/20250101-120000-output-on.pcapng
./bin/decode captures/… --timeline --hex 16
```

It lists the FB4s that announced themselves (id, MAC, model tag), what BEYOND's
live control held per zone, and the framing/type mix/rate of the frame stream to
each FB4. `--timeline` prints every live-control change with its timestamp, which
is how you line a capture up against what you were doing at the time.

For watching that live instead of after the fact:

```
./bin/rgba              # every live-control change BEYOND broadcasts, as it happens
./bin/rgba --zone 3
```

This is the only confirmation OSC can give you: BEYOND broadcasts what its live
control holds (while its RGBA panel is open), so send a message and watch the
value move. Silence means nothing is arriving. This listener only receives.

## Guided experiments

```
./bin/session --list                      # what each experiment answers
./bin/session handshake                   # BEYOND's connection setup, incl. the TCP SYN
./bin/session osc-rgba                    # our OSC and BEYOND's echo, in one file
./bin/session replay --host 169.254.53.5  # does anything act on the 16062 lines? (transmits)
```

Each one starts the capture, tells you what to do at the machine, stops the
capture, decodes it, and says what the result means — so the answer doesn't
depend on remembering the right `tshark` filter at 2am. These are the open
questions from [PROTOCOL.md](PROTOCOL.md), one command each.

## Sending live-control lines

```
./bin/replay --zone all --colour amber --sweep              # dry run: print the bytes
./bin/replay --zone 1 --sweep --transmit --host 169.254.53.5
```

The format BEYOND broadcasts is understood; what nobody has tested is whether
anything *listens*. The captures suggest not (16062 has only ever been seen
going host → network), but it is a ten-minute experiment with an unambiguous
result. Run it with BEYOND closed — otherwise a change in the room proves nothing
about what caused it — someone watching the heads, and the E-stop in reach.

`./bin/decode <capture> --repeats` answers the companion question, from captures
we already have: BEYOND never sends the same frame body twice, not even for a
static scene, so a captured frame cannot be replayed.

[PROTOCOL.md](PROTOCOL.md) is the full report on what the captures so far
actually say: every port and message type, the header layout byte by byte, the
device inventory, what is confirmed against what is inferred, a diagnostic
playbook for a silent show, and the exact captures that would close each
remaining gap. Read it before a show day.

## Controlled experiments

```
./bin/experiment --host 10.0.0.42 --iface en7 --seconds 10
```

You drive BEYOND; this only records. It prompts for each state — idle, output on,
static frame, change X, change Y, brightness/colour, output off — captures while
you hold that state, and stops before the next one, so each file holds exactly
one state. `--list` shows the steps, `--steps a,b,c` picks your own.

## Comparing

```
./bin/compare captures/idle.pcapng captures/output-on.pcapng --host 10.0.0.42
```

Packets are grouped by flow *and* payload length before anything is compared —
two lengths usually mean two message types, and lining those up by offset would
be noise. Within a group, every byte offset is classified:

| mark | meaning |
| --- | --- |
| `.` | same fixed value in both captures |
| `C` | fixed in each capture, **different between them** — the field you changed |
| `V` | varies inside both captures (frame data, counters, timestamps) |
| `B` | fixed in one capture, varying in the other |

The `C` offsets are the answer: capture a state, change exactly one thing in
BEYOND, capture again, and compare. For example, moving a static frame along X
in a synthetic test isolates a single byte:

```
127.0.0.1:45001 → 127.0.0.1:7765  UDP  32B   A:394 packets  B:394 packets
  1 differing offsets, 1 of them fixed-value changes
    0000  ....C..~ ~~~~~~~~ ~~~~~~~~ ~~~~~~~~
    byte    4  changed         0x40 (64) → 0x90 (144)
```

Add `--json` to `doctor`, `interfaces`, `discover`, `capture`, `extract` and
`compare` for machine-readable output (this is what the Traffic tab consumes).

## Layout

```
bin/doctor       tool + permission check
bin/interfaces   capture devices and their addresses
bin/discover     passive peer ranking + neighbour table
bin/capture      start/stop/status, timestamped .pcapng + sidecar
bin/analyze      summarise a capture
bin/extract      cut a capture down to a host/port/filter
bin/experiment   guided one-state-per-file capture run
bin/compare      byte-level diff of two captures
bin/decode       read a capture as Pangolin protocols
bin/rgba         live view of BEYOND's live-control values
bin/session      run one open question end to end: capture, guide, decode
bin/replay       send BEYOND's live-control lines (the only tool that transmits)
lib/common.sh    tool discovery, capture directory, JSON helpers
lib/compare.py   the diff itself
lib/pangolin.py  the protocol decoder
lib/rgba_listen.py  the live listener
lib/replay.py    the datagrams, and the sending
```

The decoder and the replay builder have tests, run from the repo root:

```
python3 -m unittest discover -s tools/traffic/lib -p '*_test.py'
```

Captures are git-ignored: they contain your network's traffic, and they are big.
