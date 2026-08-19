#!/usr/bin/env python3
"""Tests for the live-control replay builder.

This is the one tool that transmits, so what it puts on the wire is pinned here
byte for byte — against the lines BEYOND itself broadcast in the paint capture.
Nothing here opens a socket.
"""

from __future__ import annotations

import unittest

from replay import build_datagrams, build_sweep, datagram, parse_colour


class ColourTest(unittest.TestCase):
    def test_amber_is_the_value_beyond_held_at_grace(self):
        self.assertEqual(parse_colour('amber'), (255, 219, 59))

    def test_explicit_triples_are_allowed(self):
        self.assertEqual(parse_colour('12,34,56'), (12, 34, 56))

    def test_rejects_a_channel_out_of_range(self):
        with self.assertRaises(ValueError):
            parse_colour('0,0,300')

    def test_rejects_something_that_is_neither(self):
        with self.assertRaises(ValueError):
            parse_colour('puce')


class DatagramTest(unittest.TestCase):
    def test_matches_beyonds_own_framing(self):
        # Byte for byte what BEYOND broadcast on UDP 16062.
        self.assertEqual(datagram(3, 'RGBA 0, 229'),
                         b'ControlZone 3\r\nRGBA 0, 229\r\n')

    def test_brightness_is_its_own_line(self):
        self.assertEqual(datagram(1, 'Brightness 97'),
                         b'ControlZone 1\r\nBrightness 97\r\n')


class BuildDatagramsTest(unittest.TestCase):
    def test_colour_then_alpha_then_brightness(self):
        self.assertEqual(
            build_datagrams([2], rgb=(1, 2, 3), alpha=255, brightness=50),
            [
                b'ControlZone 2\r\nRGBA 0, 1\r\n',
                b'ControlZone 2\r\nRGBA 1, 2\r\n',
                b'ControlZone 2\r\nRGBA 2, 3\r\n',
                b'ControlZone 2\r\nRGBA 3, 255\r\n',
                b'ControlZone 2\r\nBrightness 50\r\n',
            ])

    def test_each_zone_is_addressed_in_turn(self):
        out = build_datagrams([1, 2], brightness=0)
        self.assertEqual(out, [b'ControlZone 1\r\nBrightness 0\r\n',
                               b'ControlZone 2\r\nBrightness 0\r\n'])

    def test_omitted_values_are_left_alone(self):
        self.assertEqual(build_datagrams([1], rgb=(0, 0, 0)),
                         [b'ControlZone 1\r\nRGBA 0, 0\r\n',
                          b'ControlZone 1\r\nRGBA 1, 0\r\n',
                          b'ControlZone 1\r\nRGBA 2, 0\r\n'])


class SweepTest(unittest.TestCase):
    def test_ramps_up_then_back_down(self):
        levels = [
            int(d.split(b'Brightness ')[1].rstrip(b'\r\n'))
            for d in build_sweep([1], (255, 219, 59), 3)
            if b'Brightness' in d
        ]
        self.assertEqual(levels, [0, 50, 100, 50, 0])

    def test_sets_the_colour_and_override_before_ramping(self):
        first = build_sweep([1], (255, 219, 59), 2)[:4]
        self.assertEqual(first[-1], b'ControlZone 1\r\nRGBA 3, 255\r\n')


if __name__ == '__main__':
    unittest.main()
