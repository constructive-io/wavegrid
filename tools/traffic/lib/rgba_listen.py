#!/usr/bin/env python3
"""Watch BEYOND's live-control values as it broadcasts them.

With its RGBA panel open, BEYOND broadcasts every live-control change as text on
UDP 16062 (`ControlZone 3` / `RGBA 0, 229` / `Brightness 97`). Since OSC is UDP
and never acknowledges anything, this broadcast is the only way to see whether a
message we sent actually reached BEYOND's live control — and what it did with it.

Passive: binds and receives, never sends.
"""

from __future__ import annotations

import argparse
import socket
import sys
import time

sys.path.insert(0, __file__.rsplit('/', 1)[0])

from pangolin import BEYOND_RGBA_PORT, parse_rgba_panel  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--port', type=int, default=BEYOND_RGBA_PORT)
    parser.add_argument('--zone', help='only print this zone')
    parser.add_argument('--raw', action='store_true', help='print the datagrams verbatim')
    args = parser.parse_args()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(('', args.port))
    except OSError as err:
        sys.exit(f'cannot listen on {args.port}: {err}')

    # Line-buffered throughout: this is watched live and often piped to a log.
    print(f'listening on udp/{args.port} — BEYOND broadcasts here only while its '
          f'RGBA panel is open (BEYOND.ini ShowRGBAPanel=1)', flush=True)
    print('nothing below means nothing is reaching BEYOND\'s live control\n', flush=True)
    started = time.monotonic()
    while True:
        data, addr = sock.recvfrom(2048)
        stamp = time.monotonic() - started
        if args.raw:
            print(f'{stamp:8.3f}  {addr[0]}  {data!r}', flush=True)
            continue
        for zone, key, value in parse_rgba_panel(data):
            if args.zone and zone != args.zone:
                continue
            print(f'{stamp:8.3f}  {addr[0]:<15} zone {zone:<3} {key:<10} {value}', flush=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print()
