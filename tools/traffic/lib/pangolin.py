#!/usr/bin/env python3
"""Decode the Pangolin protocols found in a capture.

Three separate things share a network in a BEYOND install, and only two of them
are readable:

  UDP 9022   FB4 discovery/announce and device settings. Plaintext, and the
             only place a device's id and firmware settings appear on the wire
             without asking BEYOND.
  UDP 16062  BEYOND's RGBA panel broadcast: a text line per live-control change
             ("ControlZone 3", "RGBA 0, 229", "Brightness 97"). This is BEYOND
             telling the network what its live control *currently holds*, which
             makes it the only confirmation that an OSC message we sent landed.
  TCP 3348   the frame stream, BEYOND → FB4. A 32-byte plaintext header (magic,
             type, length, sequence, two clocks) wrapping an opaque body: byte
             entropy ~8.0 and incompressible, i.e. encrypted. The bodies are not
             decodable from a capture, so this decoder reports the framing and
             the rate, not the points.

Read-only: this parses files, it never transmits.
"""

from __future__ import annotations

import argparse
import hashlib
import math
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field

FB4_DISCOVERY_PORT = 9022
BEYOND_RGBA_PORT = 16062
FB4_STREAM_PORT = 3348

# Every FB4-side message starts with this, on both the UDP and TCP sides.
PANGOLIN_MAGIC = bytes.fromhex('40fb0000')
# BEYOND's own discovery broadcast (host → network) uses a different one.
BEYOND_MAGIC = bytes.fromhex('0dbe0000')

HEADER_LEN = 32
# Frame-stream message types seen so far, as the little-endian u32 at [4:8].
STREAM_TYPE_CONTROL = 0x00010E02
STREAM_TYPE_FRAME = 0x00030E02
STREAM_TYPE_TELEMETRY = 0x00008A0D

# The RGBA panel numbers its channels; BEYOND's own OSC uses names.
RGBA_CHANNELS = {0: 'red', 1: 'green', 2: 'blue', 3: 'alpha'}


def u32(b: bytes, off: int) -> int:
    return int.from_bytes(b[off:off + 4], 'little')


def u64(b: bytes, off: int) -> int:
    return int.from_bytes(b[off:off + 8], 'little')


def entropy(b: bytes) -> float:
    """Bits per byte. ~8.0 means encrypted or already compressed."""
    if not b:
        return 0.0
    counts = Counter(b)
    return -sum(c / len(b) * math.log2(c / len(b)) for c in counts.values())


@dataclass
class Header:
    """The 32 bytes in front of every message on TCP 3348 and most on UDP 9022."""

    kind: int
    length: int
    sequence: int
    clock_a: int
    clock_b: int

    @classmethod
    def parse(cls, b: bytes) -> Header | None:
        if len(b) < HEADER_LEN or b[0:4] != PANGOLIN_MAGIC:
            return None
        return cls(u32(b, 4), u32(b, 8), u32(b, 12), u64(b, 16), u64(b, 24))


def split_messages(stream: bytes) -> list[bytes]:
    """Cut a reassembled TCP stream into messages using the header's length.

    TCP gives us no message boundaries — a 2392-byte frame arrives as 1460 + 932
    — so the length field is the only framing available.
    """
    out: list[bytes] = []
    at = 0
    while at + HEADER_LEN <= len(stream):
        header = Header.parse(stream[at:at + HEADER_LEN])
        if header is None or header.length < HEADER_LEN or at + header.length > len(stream):
            break
        out.append(stream[at:at + header.length])
        at += header.length
    return out


@dataclass
class Device:
    """One FB4, as it describes itself on UDP 9022."""

    ip: str
    mac: str = ''
    tag: str = ''
    device_id: int = 0
    settings: dict[int, int] = field(default_factory=dict)


def parse_announce(payload: bytes) -> tuple[str, int] | None:
    """The short hello: an ASCII model tag then the device id.

    e.g. `... 46 42 34 45 4c a5 08 00` → tag `FB4E`, id 566604. The tag's exact
    width is unconfirmed (only one model has been observed), so it is reported
    verbatim rather than interpreted.
    """
    if len(payload) < 0x28:
        return None
    tag = payload[0x20:0x24].decode('ascii', 'replace')
    if not tag.startswith('FB4'):
        return None
    return tag, u32(payload, 0x24)


def parse_settings(payload: bytes) -> dict[int, int]:
    """The long announce bodies are flat (u32 tag, u32 value) pairs.

    Tags group by leading nibble (0x10xx, 0x20xx, …) and many values repeat as
    ~14006, which reads like an id into a table BEYOND holds rather than a
    quantity — so values are reported raw, unnamed.
    """
    body = payload[HEADER_LEN:]
    settings: dict[int, int] = {}
    for at in range(0, len(body) - 7, 8):
        tag = u32(body, at)
        if tag == 0 and u32(body, at + 4) == 0:
            continue
        settings[tag] = u32(body, at + 4)
    return settings


@dataclass
class ZoneState:
    """What BEYOND's live control holds for one zone, per its own broadcast."""

    updates: int = 0
    values: dict[str, int] = field(default_factory=dict)


def parse_rgba_panel(payload: bytes) -> list[tuple[str, str, int]]:
    """`ControlZone 3\\r\\nRGBA 0, 229\\r\\n` → [('3', 'red', 229)].

    A datagram carries the zone it applies to followed by one value, so the zone
    line is context for the line under it.
    """
    text = payload.decode('ascii', 'replace')
    zone = ''
    out: list[tuple[str, str, int]] = []
    for line in text.replace('\r\n', '\n').split('\n'):
        parts = line.split()
        if not parts:
            continue
        if parts[0] == 'ControlZone' and len(parts) > 1:
            zone = parts[1]
        elif parts[0] == 'RGBA' and len(parts) > 2:
            channel = RGBA_CHANNELS.get(int(parts[1].rstrip(',')), parts[1].rstrip(','))
            out.append((zone, str(channel), int(parts[2])))
        elif parts[0] == 'Brightness' and len(parts) > 1:
            out.append((zone, 'brightness', int(parts[1])))
    return out


FIELDS = [
    'frame.time_relative', 'ip.src', 'ip.dst', 'eth.src',
    'udp.srcport', 'udp.dstport', 'tcp.srcport', 'tcp.dstport', 'tcp.stream',
    'udp.payload', 'tcp.payload',
]


@dataclass
class Packet:
    time: float
    src: str
    dst: str
    eth_src: str
    proto: str
    sport: int
    dport: int
    stream: str
    payload: bytes


def read_packets(tshark: str, path: str) -> list[Packet]:
    args = [tshark, '-r', path, '-n', '-T', 'fields', '-E', 'separator=|', '-E', 'occurrence=f']
    for f in FIELDS:
        args += ['-e', f]
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0 and not proc.stdout:
        sys.exit(f'tshark failed on {path}: {proc.stderr.strip()}')

    packets: list[Packet] = []
    for line in proc.stdout.splitlines():
        cols = line.split('|')
        if len(cols) < len(FIELDS):
            continue
        (time, src, dst, eth, usp, udp_, tsp, tdp, stream, upay, tpay) = cols[:11]
        if upay:
            proto, sport, dport, raw = 'udp', usp, udp_, upay
        elif tpay:
            proto, sport, dport, raw = 'tcp', tsp, tdp, tpay
        else:
            continue
        try:
            payload = bytes.fromhex(raw.replace(':', ''))
        except ValueError:
            continue
        packets.append(Packet(float(time or 0), src, dst, eth, proto,
                              int(sport or 0), int(dport or 0), stream, payload))
    return packets


def streaming_ips(packets: list[Packet]) -> set[str]:
    """IPs BEYOND has a frame stream with, either direction."""
    return {
        ip
        for p in packets if p.proto == 'tcp' and FB4_STREAM_PORT in (p.sport, p.dport)
        for ip in (p.src, p.dst)
    }


def report_devices(packets: list[Packet]) -> None:
    devices: dict[str, Device] = {}
    host_names: set[str] = set()
    for p in packets:
        if p.proto != 'udp' or FB4_DISCOVERY_PORT not in (p.sport, p.dport):
            continue
        if p.payload[0:4] == BEYOND_MAGIC:
            # BEYOND announcing itself, with the show machine's hostname as UTF-16.
            name = p.payload[0x28:0x78].decode('utf-16-le', 'replace').split('\x00')[0]
            if name:
                host_names.add(f'{name} ({p.src})')
            continue
        device = devices.setdefault(p.src, Device(ip=p.src))
        device.mac = device.mac or p.eth_src
        hello = parse_announce(p.payload)
        if hello:
            device.tag, device.device_id = hello
        elif Header.parse(p.payload) and len(p.payload) > 200:
            device.settings.update(parse_settings(p.payload))
            device.device_id = device.device_id or u32(p.payload, 0x10)

    print('== devices (UDP 9022) ==')
    if host_names:
        print(f'  BEYOND host: {", ".join(sorted(host_names))}')
    streaming = streaming_ips(packets)
    for ip, d in sorted(devices.items()):
        label = f'{d.tag} ' if d.tag else ''
        print(f'  {ip:<16} {d.mac:<18} {label}id={d.device_id or "?"} '
              f'settings={len(d.settings)}')
        if streaming and ip not in streaming:
            # It is on the network and announcing, but BEYOND never opened a
            # frame stream to it: a projector that will stay dark.
            print('                   no frame stream — BEYOND is not sending to '
                  'this device')
    print()


def report_rgba(packets: list[Packet], timeline: bool) -> None:
    zones: dict[str, ZoneState] = {}
    first = last = None
    events: list[tuple[float, str, str, int]] = []
    for p in packets:
        if p.proto != 'udp' or p.dport != BEYOND_RGBA_PORT:
            continue
        for zone, key, value in parse_rgba_panel(p.payload):
            state = zones.setdefault(zone, ZoneState())
            state.updates += 1
            state.values[key] = value
            events.append((p.time, zone, key, value))
            first = p.time if first is None else first
            last = p.time
    print('== BEYOND live control, per its own broadcast (UDP 16062) ==')
    if not zones:
        print('  nothing — BEYOND only broadcasts this with its RGBA panel open')
        print('  (BEYOND.ini [Settings] ShowRGBAPanel=1)\n')
        return
    print(f'  {len(zones)} zones, {sum(z.updates for z in zones.values())} updates '
          f'over {(last or 0) - (first or 0):.1f}s')
    for zone in sorted(zones, key=lambda z: int(z) if z.isdigit() else 0):
        state = zones[zone]
        v = state.values
        shown = ' '.join(f'{k}={v[k]}' for k in ('red', 'green', 'blue', 'alpha', 'brightness')
                         if k in v)
        print(f'  zone {zone:<3} {state.updates:>4} updates, last {shown}')
    if timeline:
        print('  timeline:')
        for time, zone, key, value in events:
            print(f'    {time:8.3f}  zone {zone:<3} {key:<10} {value}')
    print()


def format_rate(count: int, span: float) -> str:
    """A rate needs two messages to mean anything.

    A single message spans whatever gap the neighbouring packets happen to
    have, which turns into an absurd figure — say it's unknown instead.
    """
    if count < 2 or span <= 0:
        return '—'
    return f'{count / span:.1f}/s'


def report_stream(packets: list[Packet], hex_bytes: int) -> None:
    streams: dict[str, list[Packet]] = defaultdict(list)
    for p in packets:
        if p.proto == 'tcp' and FB4_STREAM_PORT in (p.sport, p.dport):
            streams[f'{p.src}:{p.sport}->{p.dst}:{p.dport}'].append(p)

    print('== frame stream (TCP 3348) ==')
    if not streams:
        print('  none in this capture\n')
        return
    for key, ps in sorted(streams.items()):
        # One direction of one connection, in capture order. Loss or reordering
        # would desync the framing, which shows up as leftover bytes below.
        stream = b''.join(p.payload for p in ps)
        messages = split_messages(stream)
        if not messages:
            continue
        span = ps[-1].time - ps[0].time
        kinds = Counter(u32(m, 4) for m in messages)
        print(f'  {key}')
        for kind, count in kinds.most_common():
            sample = next(m for m in messages if u32(m, 4) == kind)
            name = {STREAM_TYPE_FRAME: 'frame', STREAM_TYPE_CONTROL: 'control',
                    STREAM_TYPE_TELEMETRY: 'telemetry'}.get(kind, 'unknown')
            body = b''.join(m[HEADER_LEN:] for m in messages if u32(m, 4) == kind)
            rate = format_rate(count, span)
            print(f'    type 0x{kind:08x} {name:<9} {count:>5} msgs  {len(sample)}B  '
                  f'{rate:<8} body entropy {entropy(body):.2f} bits/byte')
        seqs = [Header.parse(m).sequence for m in messages if u32(m, 4) == STREAM_TYPE_FRAME]
        if len(seqs) > 1:
            gaps = sum(1 for a, b in zip(seqs, seqs[1:]) if b != a + 1)
            print(f'    frame sequence {seqs[0]}..{seqs[-1]}, {gaps} discontinuities')
        leftover = len(stream) - sum(len(m) for m in messages)
        if leftover:
            print(f'    {leftover}B unframed at the end — capture cut mid-message, '
                  f'or packets were lost/reordered')
        if hex_bytes:
            head = messages[0][:HEADER_LEN + hex_bytes]
            print(f'    first message: {head.hex(" ")}')
    print('  bodies at ~8.0 bits/byte and incompressible: encrypted, not parseable here')
    print()


def stream_messages(packets: list[Packet]) -> dict[str, list[bytes]]:
    """Messages per direction of each TCP 3348 connection, in capture order."""
    streams: dict[str, list[Packet]] = defaultdict(list)
    for p in packets:
        if p.proto == 'tcp' and FB4_STREAM_PORT in (p.sport, p.dport):
            streams[f'{p.src}:{p.sport}->{p.dst}:{p.dport}'].append(p)
    return {
        key: split_messages(b''.join(p.payload for p in ps))
        for key, ps in sorted(streams.items())
    }


@dataclass
class Repeats:
    """Whether a stream's frame bodies ever say the same thing twice.

    The question this answers is whether the encryption is per-frame. Replaying a
    captured frame can only work if an identical body is ever legitimately sent
    twice — otherwise each one carries a nonce or a counter, and a copy is either
    rejected or (worse, silently) meaningless.
    """

    frames: int
    distinct: int
    body_len: int
    constant_offsets: int
    shared_min: int
    shared_max: int

    @property
    def repeated(self) -> int:
        return self.frames - self.distinct

    @property
    def chance(self) -> float:
        """Bytes two unrelated 256-value sequences would match on by luck."""
        return self.body_len / 256


def body_repeats(bodies: list[bytes]) -> Repeats | None:
    if len(bodies) < 2:
        return None
    width = min(len(b) for b in bodies)
    shared = [sum(1 for x, y in zip(a, b) if x == y) for a, b in zip(bodies, bodies[1:])]
    return Repeats(
        frames=len(bodies),
        distinct=len({hashlib.sha256(b).digest() for b in bodies}),
        body_len=width,
        constant_offsets=sum(
            1 for i in range(width) if all(b[i] == bodies[0][i] for b in bodies)
        ),
        shared_min=min(shared),
        shared_max=max(shared),
    )


def report_repeats(packets: list[Packet]) -> None:
    streams = stream_messages(packets)
    bodies_by_stream = {
        key: [m[HEADER_LEN:] for m in messages if u32(m, 4) == STREAM_TYPE_FRAME]
        for key, messages in streams.items()
    }
    bodies_by_stream = {k: v for k, v in bodies_by_stream.items() if v}

    print('== do frame bodies ever repeat? (TCP 3348) ==')
    if not bodies_by_stream:
        print('  no frames in this capture\n')
        return

    for key, bodies in bodies_by_stream.items():
        r = body_repeats(bodies)
        if r is None:
            print(f'  {key}: {len(bodies)} frame — need two to compare')
            continue
        print(f'  {key}')
        print(f'    {r.frames} frames, {r.distinct} distinct bodies, '
              f'{r.repeated} repeated')
        print(f'    bytes identical across every frame: {r.constant_offsets}/{r.body_len}')
        print(f'    consecutive bodies share {r.shared_min}–{r.shared_max} bytes '
              f'(chance alone ≈ {r.chance:.0f})')

    # The same scene goes to several projectors at once. If two devices ever got
    # byte-identical bodies, the encryption would be per-scene, not per-frame and
    # per-connection — so this is worth asking even when repeats within one
    # stream come up empty.
    keys = list(bodies_by_stream)
    for i, left in enumerate(keys):
        for right in keys[i + 1:]:
            a = {hashlib.sha256(b).digest() for b in bodies_by_stream[left]}
            same = sum(1 for b in bodies_by_stream[right] if hashlib.sha256(b).digest() in a)
            print(f'  {left.split("->")[-1]} vs {right.split("->")[-1]}: '
                  f'{same} bodies in common')
    print('  identical bodies are what a replayable stream looks like; none means\n'
          '  every frame is encrypted afresh and a captured frame cannot be reused')
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('capture')
    parser.add_argument('--tshark', default='tshark')
    parser.add_argument('--hex', type=int, default=0,
                        help='also print this many body bytes of the first stream message')
    parser.add_argument('--timeline', action='store_true',
                        help='print every live-control change, to line up with what you did')
    parser.add_argument('--repeats', action='store_true',
                        help='ask whether any frame body is ever sent twice (replayability)')
    args = parser.parse_args()

    packets = read_packets(args.tshark, args.capture)
    print(f'{len(packets)} packets with payload in {args.capture}\n')
    report_devices(packets)
    report_rgba(packets, args.timeline)
    report_stream(packets, args.hex)
    if args.repeats:
        report_repeats(packets)


if __name__ == '__main__':
    main()
