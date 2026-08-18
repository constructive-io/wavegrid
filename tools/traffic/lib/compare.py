#!/usr/bin/env python3
"""Compare two captures byte by byte and say which offsets changed.

The point is protocol archaeology: capture the laser idle, capture it again with
one thing different (output on, X moved, brightness up), and this prints the
offsets whose value is *constant within each capture but different between them*
— those are the bytes encoding the thing you changed. Offsets that vary inside a
capture are called out separately, because those are streams (frame data,
counters, timestamps), not the field you are hunting.

Packets are grouped by flow and payload length before comparing: two packets of
different lengths are usually different message types, and lining them up by
offset would be meaningless.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field

# Whole-capture work is bounded so a multi-gigabyte frame stream stays usable.
MAX_PACKETS_PER_BUCKET = 2000

FIELDS = [
    'ip.src', 'ip.dst', '_ws.col.Protocol',
    'udp.srcport', 'udp.dstport', 'tcp.srcport', 'tcp.dstport',
    'udp.payload', 'tcp.payload', 'data.data',
]


@dataclass
class Bucket:
    """Packets sharing a flow and a payload length."""

    payloads: list[bytes] = field(default_factory=list)

    def add(self, payload: bytes) -> None:
        if len(self.payloads) < MAX_PACKETS_PER_BUCKET:
            self.payloads.append(payload)

    def values_at(self, offset: int) -> set[int]:
        return {p[offset] for p in self.payloads}


def read_packets(tshark: str, path: str, display_filter: str | None) -> dict[tuple, Bucket]:
    # occurrence=f keeps one value per field even when a frame nests IP layers
    # (an ICMP error quoting the original packet, for instance).
    args = [tshark, '-r', path, '-n', '-T', 'fields', '-E', 'separator=|', '-E', 'occurrence=f']
    for f in FIELDS:
        args += ['-e', f]
    if display_filter:
        args += ['-Y', display_filter]

    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0 and not proc.stdout:
        sys.exit(f'tshark failed on {path}: {proc.stderr.strip()}')

    buckets: dict[tuple, Bucket] = defaultdict(Bucket)
    for line in proc.stdout.splitlines():
        cols = line.split('|')
        if len(cols) < len(FIELDS):
            continue
        src, dst, proto, usport, udport, tsport, tdport, upay, tpay, dpay = cols[:10]
        payload_hex = upay or tpay or dpay
        if not payload_hex or not src:
            continue
        # tshark writes a comma-separated list when a frame carries several
        # payload occurrences; the first is the one that lines up with the flow.
        payload_hex = payload_hex.split(',')[0].replace(':', '')
        try:
            payload = bytes.fromhex(payload_hex)
        except ValueError:
            continue
        sport = usport or tsport
        dport = udport or tdport
        buckets[(src, dst, proto, sport, dport, len(payload))].add(payload)
    return buckets


def key_label(key: tuple) -> str:
    src, dst, proto, sport, dport, length = key
    return f'{src}:{sport or "-"} → {dst}:{dport or "-"}  {proto}  {length}B'


@dataclass
class OffsetDiff:
    offset: int
    a: set[int]
    b: set[int]

    @property
    def kind(self) -> str:
        if len(self.a) == 1 and len(self.b) == 1:
            return 'changed'          # a fixed field with a new value
        if len(self.a) == 1 or len(self.b) == 1:
            return 'became-variable'  # fixed in one capture, streaming in the other
        return 'variable'             # streaming in both, values differ

    def describe(self) -> str:
        def show(values: set[int]) -> str:
            if len(values) == 1:
                v = next(iter(values))
                return f'0x{v:02x} ({v})'
            return f'{len(values)} values 0x{min(values):02x}–0x{max(values):02x}'
        return f'{show(self.a)} → {show(self.b)}'


def compare_bucket(a: Bucket, b: Bucket) -> list[OffsetDiff]:
    out = []
    for offset in range(len(a.payloads[0])):
        va, vb = a.values_at(offset), b.values_at(offset)
        if va != vb:
            out.append(OffsetDiff(offset, va, vb))
    return out


def stable_map(a: Bucket, b: Bucket, diffs: list[OffsetDiff]) -> str:
    """One character per byte offset, so the shape of the message is visible.

    '.' identical and constant, '~' identical but streaming, digits/letters mark
    a difference: 'C' changed constant, 'V' variable, 'B' became variable.
    """
    marks = {d.offset: {'changed': 'C', 'variable': 'V', 'became-variable': 'B'}[d.kind] for d in diffs}
    chars = []
    for offset in range(len(a.payloads[0])):
        if offset in marks:
            chars.append(marks[offset])
        elif len(a.values_at(offset)) == 1 and len(b.values_at(offset)) == 1:
            chars.append('.')
        else:
            chars.append('~')
    rows = []
    for start in range(0, len(chars), 32):
        rows.append(f'    {start:04d}  ' + ' '.join(''.join(chars[i:i + 8]) for i in range(start, min(start + 32, len(chars)), 8)))
    return '\n'.join(rows)


def hex_row(payload: bytes, limit: int) -> str:
    return ' '.join(f'{byte:02x}' for byte in payload[:limit])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('a')
    ap.add_argument('b')
    ap.add_argument('--tshark', default='tshark')
    ap.add_argument('--host', help='only compare traffic involving this address')
    ap.add_argument('--filter', dest='display_filter', help='extra tshark display filter')
    ap.add_argument('--max-offsets', type=int, default=24, help='differing offsets listed per bucket')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    display = args.display_filter
    if args.host:
        host_filter = f'ip.addr=={args.host}'
        display = f'({display}) && {host_filter}' if display else host_filter

    a_buckets = read_packets(args.tshark, args.a, display)
    b_buckets = read_packets(args.tshark, args.b, display)

    shared = sorted(set(a_buckets) & set(b_buckets), key=lambda k: -len(a_buckets[k].payloads))
    only_a = sorted(set(a_buckets) - set(b_buckets))
    only_b = sorted(set(b_buckets) - set(a_buckets))

    report = {
        'a': args.a,
        'b': args.b,
        'onlyInA': [key_label(k) for k in only_a],
        'onlyInB': [key_label(k) for k in only_b],
        'buckets': [],
    }

    for key in shared:
        a, b = a_buckets[key], b_buckets[key]
        diffs = compare_bucket(a, b)
        report['buckets'].append({
            'flow': key_label(key),
            'packetsA': len(a.payloads),
            'packetsB': len(b.payloads),
            'length': key[5],
            'diffs': [
                {'offset': d.offset, 'kind': d.kind, 'summary': d.describe()}
                for d in diffs[:args.max_offsets]
            ],
            'diffCount': len(diffs),
        })

    if args.json:
        print(json.dumps(report, indent=2))
        return

    print(f'A  {args.a}')
    print(f'B  {args.b}')
    if display:
        print(f'   filter {display}')

    if only_a or only_b:
        print('\nMessage types present in only one capture')
        for label in report['onlyInA']:
            print(f'  only in A   {label}')
        for label in report['onlyInB']:
            print(f'  only in B   {label}')

    if not shared:
        print('\nNo flow/length bucket appears in both captures — nothing to line up.')
        print('Capture both states on the same interface with the same --host filter.')
        return

    for key, entry in zip(shared, report['buckets']):
        a, b = a_buckets[key], b_buckets[key]
        print(f'\n{key_label(key)}   A:{len(a.payloads)} packets  B:{len(b.payloads)} packets')
        diffs = compare_bucket(a, b)
        if not diffs:
            print('  identical byte for byte')
            continue
        changed = [d for d in diffs if d.kind == 'changed']
        print(f'  {len(diffs)} differing offsets, {len(changed)} of them fixed-value changes')
        print(stable_map(a, b, diffs))
        print('    legend  . same   ~ streams in both   C changed constant   V differing stream   B constant→stream')
        for d in diffs[:args.max_offsets]:
            print(f'    byte {d.offset:>4}  {d.kind:<15} {d.describe()}')
        if len(diffs) > args.max_offsets:
            print(f'    … {len(diffs) - args.max_offsets} more (raise --max-offsets)')
        print(f'    A first packet  {hex_row(a.payloads[0], 32)}')
        print(f'    B first packet  {hex_row(b.payloads[0], 32)}')


if __name__ == '__main__':
    main()
