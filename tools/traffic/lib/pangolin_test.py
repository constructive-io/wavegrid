#!/usr/bin/env python3
"""Tests for the Pangolin decoder: python3 -m unittest discover tools/traffic/lib -p '*_test.py'

The fixtures here are byte-for-byte excerpts of real BEYOND ⇄ FB4 captures, so a
change that breaks framing or the live-control parse fails here rather than
silently mis-reporting a capture.
"""

from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout

from pangolin import (
    BEYOND_RGBA_PORT,
    FB4_DISCOVERY_PORT,
    FB4_STREAM_PORT,
    HEADER_LEN,
    PANGOLIN_MAGIC,
    STREAM_TYPE_CONTROL,
    STREAM_TYPE_FRAME,
    Header,
    Packet,
    entropy,
    parse_announce,
    parse_rgba_panel,
    parse_settings,
    report_devices,
    report_rgba,
    report_stream,
    split_messages,
)


def message(kind: int, body: bytes, sequence: int = 0) -> bytes:
    """Build a framed message the way BEYOND does, for framing tests."""
    header = (PANGOLIN_MAGIC
              + kind.to_bytes(4, 'little')
              + (HEADER_LEN + len(body)).to_bytes(4, 'little')
              + sequence.to_bytes(4, 'little')
              + bytes(16))
    return header + body


def udp(payload: bytes, *, sport: int, dport: int, src: str = '169.254.45.4',
        time: float = 0.0, eth: str = '00:16:42:fb:04:2c') -> Packet:
    return Packet(time, src, '169.254.42.165', eth, 'udp', sport, dport, '', payload)


def tcp(payload: bytes, *, time: float = 0.0) -> Packet:
    return Packet(time, '169.254.42.165', '169.254.45.4', '', 'tcp',
                  64463, FB4_STREAM_PORT, '0', payload)


class HeaderTest(unittest.TestCase):
    def test_parses_a_real_frame_header(self):
        # First 32 bytes of a frame BEYOND sent to 169.254.53.5.
        raw = bytes.fromhex('40fb0000020e0300580900005c6c0600'
                            '9993772cde310000fc377c2ee2310000')
        header = Header.parse(raw)
        self.assertIsNotNone(header)
        self.assertEqual(header.kind, STREAM_TYPE_FRAME)
        self.assertEqual(header.length, 2392)
        self.assertEqual(header.sequence, 420956)

    def test_rejects_foreign_bytes(self):
        self.assertIsNone(Header.parse(b'GET / HTTP/1.1\r\n' + bytes(32)))

    def test_rejects_a_truncated_header(self):
        self.assertIsNone(Header.parse(PANGOLIN_MAGIC + bytes(4)))


class SplitMessagesTest(unittest.TestCase):
    def test_splits_regardless_of_tcp_segmentation(self):
        stream = message(STREAM_TYPE_FRAME, bytes(2360), 1) + \
            message(STREAM_TYPE_CONTROL, bytes(48), 2)
        self.assertEqual([len(m) for m in split_messages(stream)], [2392, 80])

    def test_stops_at_a_message_the_capture_cut_in_half(self):
        stream = message(STREAM_TYPE_CONTROL, bytes(48)) + \
            message(STREAM_TYPE_FRAME, bytes(2360))[:100]
        messages = split_messages(stream)
        self.assertEqual(len(messages), 1)
        self.assertEqual(len(messages[0]), 80)

    def test_refuses_to_loop_on_a_nonsense_length(self):
        stream = PANGOLIN_MAGIC + bytes(4) + (4).to_bytes(4, 'little') + bytes(20)
        self.assertEqual(split_messages(stream), [])

    def test_no_messages_in_unframed_bytes(self):
        self.assertEqual(split_messages(b'hello there'), [])


class RgbaPanelTest(unittest.TestCase):
    def test_names_the_channel_numbers(self):
        self.assertEqual(
            parse_rgba_panel(b'ControlZone 3\r\nRGBA 0, 229\r\n'),
            [('3', 'red', 229)])
        self.assertEqual(
            parse_rgba_panel(b'ControlZone 6\r\nRGBA 3, 255\r\n'),
            [('6', 'alpha', 255)])

    def test_brightness_is_its_own_value(self):
        self.assertEqual(
            parse_rgba_panel(b'ControlZone 1\r\nBrightness 97\r\n'),
            [('1', 'brightness', 97)])

    def test_keeps_an_unknown_channel_number_verbatim(self):
        self.assertEqual(
            parse_rgba_panel(b'ControlZone 2\r\nRGBA 9, 12\r\n'),
            [('2', '9', 12)])

    def test_several_values_share_the_zone_above_them(self):
        payload = b'ControlZone 4\r\nRGBA 0, 1\r\nRGBA 1, 2\r\nBrightness 3\r\n'
        self.assertEqual(parse_rgba_panel(payload),
                         [('4', 'red', 1), ('4', 'green', 2), ('4', 'brightness', 3)])

    def test_ignores_traffic_that_is_not_the_panel(self):
        self.assertEqual(parse_rgba_panel(b'\x00\x01\x02\x03'), [])


class AnnounceTest(unittest.TestCase):
    def test_reads_the_model_tag_and_device_id(self):
        payload = bytes(0x20) + b'FB4E' + (566604).to_bytes(4, 'little')
        self.assertEqual(parse_announce(payload), ('FB4E', 566604))

    def test_ignores_a_packet_without_a_model_tag(self):
        self.assertIsNone(parse_announce(bytes(0x20) + b'....' + bytes(4)))

    def test_ignores_a_short_packet(self):
        self.assertIsNone(parse_announce(bytes(8)))


class SettingsTest(unittest.TestCase):
    def test_reads_tag_value_pairs_and_skips_padding(self):
        body = ((0x1001).to_bytes(4, 'little') + (14006).to_bytes(4, 'little')
                + bytes(8)
                + (0x2003).to_bytes(4, 'little') + (7).to_bytes(4, 'little'))
        self.assertEqual(parse_settings(bytes(HEADER_LEN) + body),
                         {0x1001: 14006, 0x2003: 7})

    def test_no_body_no_settings(self):
        self.assertEqual(parse_settings(bytes(HEADER_LEN)), {})


class EntropyTest(unittest.TestCase):
    def test_one_repeated_byte_carries_nothing(self):
        self.assertEqual(entropy(b'\x00' * 64), 0.0)

    def test_every_byte_value_once_is_eight_bits(self):
        self.assertEqual(entropy(bytes(range(256))), 8.0)

    def test_empty(self):
        self.assertEqual(entropy(b''), 0.0)


class ReportTest(unittest.TestCase):
    """The reports must say 'nothing here' rather than crash on a quiet capture."""

    def render(self, fn, *args) -> str:
        out = io.StringIO()
        with redirect_stdout(out):
            fn(*args)
        return out.getvalue()

    def test_empty_capture_reports_each_protocol_as_absent(self):
        self.assertIn('devices', self.render(report_devices, []))
        self.assertIn('RGBA panel', self.render(report_rgba, [], False))
        self.assertIn('none in this capture', self.render(report_stream, [], 0))

    def test_devices_are_listed_with_mac_and_id(self):
        payload = bytes(0x20) + b'FB4E' + (566604).to_bytes(4, 'little')
        text = self.render(report_devices, [
            udp(payload, sport=FB4_DISCOVERY_PORT, dport=FB4_DISCOVERY_PORT)])
        self.assertIn('169.254.45.4', text)
        self.assertIn('00:16:42:fb:04:2c', text)
        self.assertIn('id=566604', text)

    def test_zone_state_is_the_last_value_seen(self):
        packets = [
            udp(b'ControlZone 2\r\nRGBA 0, 10\r\n', sport=5000,
                dport=BEYOND_RGBA_PORT, time=0.0),
            udp(b'ControlZone 2\r\nRGBA 0, 200\r\n', sport=5000,
                dport=BEYOND_RGBA_PORT, time=1.0),
        ]
        text = self.render(report_rgba, packets, False)
        self.assertIn('red=200', text)
        self.assertIn('2 updates', text)

    def test_timeline_prints_every_change(self):
        packets = [
            udp(b'ControlZone 2\r\nRGBA 0, 10\r\n', sport=5000,
                dport=BEYOND_RGBA_PORT, time=0.0),
            udp(b'ControlZone 2\r\nBrightness 55\r\n', sport=5000,
                dport=BEYOND_RGBA_PORT, time=0.5),
        ]
        text = self.render(report_rgba, packets, True)
        self.assertIn('timeline', text)
        self.assertIn('brightness 55', text)

    def test_stream_report_counts_types_and_flags_the_opaque_body(self):
        frames = message(STREAM_TYPE_FRAME, bytes(range(256)) * 9 + bytes(56), 1) + \
            message(STREAM_TYPE_FRAME, bytes(range(256)) * 9 + bytes(56), 2)
        text = self.render(report_stream, [tcp(frames, time=0.0),
                                           tcp(b'', time=1.0)], 0)
        self.assertIn('frame', text)
        self.assertIn('2 msgs', text)
        self.assertIn('encrypted', text)

    def test_stream_report_notices_a_gap_in_the_frame_sequence(self):
        stream = message(STREAM_TYPE_FRAME, bytes(16), 1) + \
            message(STREAM_TYPE_FRAME, bytes(16), 9)
        text = self.render(report_stream, [tcp(stream)], 0)
        self.assertIn('1..9, 1 discontinuities', text)

    def test_stream_report_reports_bytes_it_could_not_frame(self):
        stream = message(STREAM_TYPE_FRAME, bytes(16), 1) + b'\x40\xfb\x00\x00'
        text = self.render(report_stream, [tcp(stream)], 0)
        self.assertIn('4B unframed', text)


if __name__ == '__main__':
    unittest.main()
