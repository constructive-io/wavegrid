#!/usr/bin/env python3
"""Send BEYOND's own plaintext live-control lines onto the network.

This is the one tool in this toolkit that transmits, and it exists to answer a
single question that no amount of capture analysis can: BEYOND broadcasts its
live-control state as text on UDP 16062 (`ControlZone 3` / `RGBA 0, 229` /
`Brightness 97`) — does *anything* act on those lines, or is that broadcast
purely BEYOND narrating itself to the network?

What the captures say, so nobody runs this expecting too much: 16062 has only
ever been seen going host → network, never toward BEYOND, and the FB4s take
their orders on TCP 3348 instead. So the honest prediction is that nothing
listens and the lasers do not move. That prediction is cheap to falsify and
expensive to assume, which is the whole point of the experiment: run it with
BEYOND closed, watch the heads, and record what happened either way.

Dry-run by default: it prints the exact bytes it would send and exits. Adding
--transmit is what puts packets on the wire, and it needs an explicit --host.

Safety: this points at laser hardware. Have someone watching the heads, keep the
E-stop in reach, and never run it as an unattended loop.
"""

from __future__ import annotations

import argparse
import socket
import sys
import time

sys.path.insert(0, __file__.rsplit('/', 1)[0])

from pangolin import BEYOND_RGBA_PORT, RGBA_CHANNELS  # noqa: E402

# Named colours in the terms the captures used: amber is the look Grace runs,
# and its exact values are the ones BEYOND held during the paint capture.
COLOURS = {
    'amber': (255, 219, 59),
    'white': (255, 255, 255),
    'black': (0, 0, 0),
    'red': (255, 0, 0),
    'green': (0, 255, 0),
    'blue': (0, 0, 255),
}

CHANNEL_NUMBERS = {name: number for number, name in RGBA_CHANNELS.items()}


def parse_colour(text: str) -> tuple[int, int, int]:
    if text in COLOURS:
        return COLOURS[text]
    parts = text.split(',')
    if len(parts) != 3:
        raise ValueError(f'colour must be one of {", ".join(COLOURS)}, or r,g,b')
    values = tuple(int(p) for p in parts)
    if any(v < 0 or v > 255 for v in values):
        raise ValueError('colour channels are 0–255')
    return values[0], values[1], values[2]


def datagram(zone: int, line: str) -> bytes:
    """One live-control update, framed exactly as BEYOND broadcasts it.

    Each datagram names its zone and then carries a single value; the zone line
    is context for the line under it, so they always travel together.
    """
    return f'ControlZone {zone}\r\n{line}\r\n'.encode('ascii')


def build_datagrams(
    zones: list[int],
    rgb: tuple[int, int, int] | None = None,
    alpha: int | None = None,
    brightness: int | None = None,
) -> list[bytes]:
    """The datagrams for one state, in the order BEYOND emits them.

    Colour first, then alpha (the live-control override), then brightness —
    matching the order the paint capture shows, so a listener that cares about
    ordering sees what it would have seen from BEYOND.
    """
    out: list[bytes] = []
    for zone in zones:
        if rgb is not None:
            for name, value in zip(('red', 'green', 'blue'), rgb):
                out.append(datagram(zone, f'RGBA {CHANNEL_NUMBERS[name]}, {value}'))
        if alpha is not None:
            out.append(datagram(zone, f'RGBA {CHANNEL_NUMBERS["alpha"]}, {alpha}'))
        if brightness is not None:
            out.append(datagram(zone, f'Brightness {brightness}'))
    return out


def build_sweep(zones: list[int], rgb: tuple[int, int, int], steps: int) -> list[bytes]:
    """A brightness ramp, so a response is unmistakable rather than a guess.

    A single value could coincide with whatever the heads already held; a ramp
    from dark to full and back cannot be mistaken for a coincidence by someone
    watching the room.
    """
    levels = [round(100 * i / (steps - 1)) for i in range(steps)] if steps > 1 else [100]
    out = build_datagrams(zones, rgb=rgb, alpha=255)
    for level in levels + list(reversed(levels[:-1])):
        out.extend(build_datagrams(zones, brightness=level))
    return out


def describe(datagrams: list[bytes]) -> str:
    return '\n'.join(
        f'  {d!r:<44} {d.hex(" ")}'
        for d in datagrams
    )


def send(host: str, port: int, datagrams: list[bytes], interval: float) -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    # A .255 target needs broadcast permission; harmless for a unicast host.
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    started = time.monotonic()
    for d in datagrams:
        sock.sendto(d, (host, port))
        print(f'{time.monotonic() - started:8.3f}  → {host}:{port}  {d!r}', flush=True)
        time.sleep(interval)
    sock.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__.split('\n')[0],
        epilog='Dry-run unless --transmit. Watch the heads; keep the E-stop in reach.',
    )
    parser.add_argument('--host', help='where to send: an FB4 IP, or a broadcast address')
    parser.add_argument('--port', type=int, default=BEYOND_RGBA_PORT)
    parser.add_argument('--zone', default='1',
                        help='zone number, a comma list, or "all" for 1–6')
    parser.add_argument('--colour', '--color', dest='colour', default='amber',
                        help=f'{", ".join(COLOURS)}, or r,g,b')
    parser.add_argument('--brightness', type=int, default=100, help='0–100')
    parser.add_argument('--sweep', action='store_true',
                        help='ramp brightness up and down instead of one value')
    parser.add_argument('--steps', type=int, default=11, help='steps in the sweep ramp')
    parser.add_argument('--interval', type=float, default=0.05,
                        help='seconds between datagrams')
    parser.add_argument('--transmit', action='store_true',
                        help='actually put these packets on the wire')
    args = parser.parse_args()

    try:
        rgb = parse_colour(args.colour)
    except ValueError as err:
        sys.exit(f'error: {err}')
    if not 0 <= args.brightness <= 100:
        sys.exit('error: brightness is 0–100')

    zones = list(range(1, 7)) if args.zone == 'all' else [
        int(z) for z in args.zone.split(',') if z.strip()
    ]

    if args.sweep:
        datagrams = build_sweep(zones, rgb, max(2, args.steps))
    else:
        datagrams = build_datagrams(zones, rgb=rgb, alpha=255, brightness=args.brightness)

    if not args.transmit:
        print(f'dry run — {len(datagrams)} datagrams for zones {zones}, '
              f'colour {rgb}, would go to udp/{args.port}:')
        print(describe(datagrams))
        print('\nadd --transmit --host <ip> to send them. Close BEYOND first, or you '
              'will not know\nwhich of the two moved the lasers.')
        return

    if not args.host:
        sys.exit('error: --transmit needs --host (an FB4 IP, or a broadcast address)')

    print(f'transmitting {len(datagrams)} datagrams to {args.host}:{args.port}')
    print('BEYOND should be closed for this to prove anything. Watch the heads.\n')
    send(args.host, args.port, datagrams, args.interval)
    print('\nsent. Nothing acknowledges UDP, so the result is what you saw in the room:')
    print('  heads changed  → something on the network acts on these lines')
    print('  heads still    → the 16062 broadcast is output only, as the captures suggest')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print()
