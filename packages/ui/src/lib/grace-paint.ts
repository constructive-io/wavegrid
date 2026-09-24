/**
 * GracePaint: one receiver pattern in which colour and brightness are separate
 * layers, so the operator can paint the hue of any pane while a brightness
 * choreography keeps running underneath.
 *
 * Colour of a pane comes from its painted [hue, sat] if it has one, otherwise
 * from a slowly moving gradient (a "flow"). Brightness comes from a ring
 * choreography (an "anim"). Everything the operator changes is a pattern
 * parameter, so painting or switching animations never reloads the pattern —
 * no jolt, and the painted colours survive on the receiver if the iPad drops.
 */

import type { Gradient } from './grace-rings';

export const GRACE_PAINT_ID = 'grace-paint';

export interface Choice {
  key: string;
  name: string;
  hint: string;
}

/** Brightness choreographies. All slow; the header speed slider scales them. */
export const ANIMS: Choice[] = [
  { key: 'still', name: 'Still', hint: 'Everything on, no motion' },
  { key: 'breathe', name: 'Breathe', hint: 'The whole window swells and settles' },
  { key: 'ringBreathe', name: 'Ring Breathe', hint: 'Each ring breathes in its own time' },
  { key: 'collapse', name: 'Collapse', hint: 'Outer ring fades, then middle; centre stays; they return in reverse' },
  { key: 'collapsePanes', name: 'Collapse Panes', hint: 'Same, but each ring goes and returns one pane at a time' },
  { key: 'unwind', name: 'Unwind', hint: 'One pane at a time from outer to centre and back, in a spiral' },
  { key: 'droplet', name: 'Droplet', hint: 'Light ripples from the centre outward' },
  { key: 'sink', name: 'Sink', hint: 'Light ripples inward toward the centre' },
  { key: 'beacon', name: 'Beacon', hint: 'Centre pulses; a wave of light follows it out' },
  { key: 'swap', name: 'Swap', hint: 'Outer and middle rings take turns' },
  { key: 'chase', name: 'Chase', hint: 'A soft head of light runs around each ring' },
  { key: 'counter', name: 'Counter', hint: 'Chases run opposite ways on the two rings' },
  { key: 'comet', name: 'Comet', hint: 'Bright head with a long fading tail' },
  { key: 'spokes', name: 'Spokes', hint: 'Three slow spokes turn across both rings' },
  { key: 'sweep', name: 'Sweep', hint: 'A straight band of light turns across the window' },
  { key: 'pendulum', name: 'Pendulum', hint: 'Brightness swings side to side like a bell' },
  { key: 'twinkle', name: 'Twinkle', hint: 'Each pane glimmers gently on its own' },
  { key: 'vortex', name: 'Vortex', hint: 'Rings turn opposite ways with the centre breathing' },
  { key: 'rainfall', name: 'Rainfall', hint: 'Panes fall dark one by one, then refill' },
  { key: 'halo', name: 'Halo', hint: 'Only one ring lit at a time, handed inward and out again' }
];

/** How the gradient moves across the unpainted panes. */
export const FLOWS: Choice[] = [
  { key: 'wheel', name: 'Wheel', hint: 'Gradient wrapped round the window, turning' },
  { key: 'counter', name: 'Counter', hint: 'Outer ring turns one way, inside the other' },
  { key: 'sweep', name: 'Sweep', hint: 'A band of gradient rotating across' },
  { key: 'spiral', name: 'Spiral', hint: 'Gradient winding toward the centre' },
  { key: 'rings', name: 'Rings', hint: 'A colour per ring, cycling inward' },
  { key: 'tide', name: 'Tide', hint: 'The whole window drifts through the loop together' },
  { key: 'pendulum', name: 'Pendulum', hint: 'The wheel swings instead of turning' },
  { key: 'still', name: 'Still', hint: 'The gradient laid round the window, not moving' }
];

export interface GracePaintParams {
  anim: string;
  flow: string;
  /** [hue, saturation] gradient stops for unpainted panes. */
  stops: [number, number][];
  /** Flat [h0, s0, h1, s1, …]; a negative hue means "not painted". */
  paint: number[];
  /** Brightness ceiling 0..100. */
  level: number;
}

export function emptyPaint(count: number): number[] {
  const out = new Array<number>(count * 2);
  for (let i = 0; i < count; i++) {
    out[i * 2] = -1;
    out[i * 2 + 1] = 0;
  }
  return out;
}

export function defaultParams(count: number, gradient: Gradient): GracePaintParams {
  return {
    anim: 'still',
    flow: 'wheel',
    stops: gradient.stops.map(([h, s]) => [h, s] as [number, number]),
    paint: emptyPaint(count),
    level: 100
  };
}

export function paintPane(paint: number[], index: number, hue: number, sat: number): number[] {
  const next = paint.slice();
  while (next.length < (index + 1) * 2) next.push(-1, 0);
  next[index * 2] = ((hue % 360) + 360) % 360;
  next[index * 2 + 1] = Math.max(0, Math.min(100, sat));
  return next;
}

/**
 * Paint every pane by ring: outer panes take `pair.outer`, the middle ring
 * `pair.inner`, and the centre `pair.inner` too (the centre is always on, so it
 * reads as the heart of the inner colour). Uses the same radius split as the
 * pattern itself.
 */
export function ringPaint(radii: number[], pair: { outer: [number, number]; inner: [number, number] }): number[] {
  let next = emptyPaint(radii.length);
  radii.forEach((r, i) => {
    const c = r >= 0.8 ? pair.outer : pair.inner;
    next = paintPane(next, i, c[0], c[1]);
  });
  return next;
}

/** True when at least one pane holds a painted colour. */
export function hasPaint(paint: number[]): boolean {
  for (let i = 0; i < paint.length; i += 2) if (paint[i] >= 0) return true;
  return false;
}

const CODE = `(function(){
var RING_SPLIT = 0.8;
var CENTRE_MAX = 0.45;
var TAU = Math.PI * 2;
// One lap of the gradient at 1x takes LAP seconds; one full cycle of a
// choreography takes CYCLE seconds.
var LAP = 60;
var CYCLE = 36;

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
function ss(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
// Ease 0..1 over [a, a + w] of a 0..1 phase.
function rise(x, a, w) { return ss((x - a) / w); }
function fract(v) { return v - Math.floor(v); }
function lerpHue(a, b, t) {
  var d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return ((a + d * t) % 360 + 360) % 360;
}
function ring(ctx, i) {
  var r = ctx.polar(i)[0];
  if (r <= CENTRE_MAX) return -1;
  return r >= RING_SPLIT ? 1 : 0;
}
function rad(ctx, i) { return ctx.polar(i)[0]; }
// 0..1 position around the ring, clockwise from 12 o'clock.
function pos(ctx, i) {
  var ang = ctx.polar(i)[1] + Math.PI / 2;
  return fract(ang / TAU);
}
function gap(a, b) {
  var d = Math.abs(a - b);
  return d > 0.5 ? 1 - d : d;
}
var geomCount = -1;
var slots = [];
var counts = [];
function geometry(ctx) {
  if (geomCount === ctx.count) return;
  geomCount = ctx.count;
  slots = [];
  counts = [];
  var n = [0, 0, 0];
  for (var i = 0; i < ctx.count; i++) n[ring(ctx, i) + 1]++;
  for (var k = 0; k < ctx.count; k++) {
    var c = n[ring(ctx, k) + 1] || 1;
    counts[k] = c;
    slots[k] = Math.floor(pos(ctx, k) * c + 1e-6) % c;
  }
}
// Colour at 0..1 around the loop, the last stop blending back into the first.
function grad(stops, u) {
  var n = stops.length;
  if (!n) return [0, 0];
  var x = fract(u) * n;
  var k = Math.floor(x);
  var t = x - k;
  var a = stops[k % n];
  var b = stops[(k + 1) % n];
  return [lerpHue(a[0], b[0], t), a[1] + (b[1] - a[1]) * t];
}

var FLOWS = {
  wheel: function(ctx, i, t) { return pos(ctx, i) - t / LAP; },
  counter: function(ctx, i, t) { return pos(ctx, i) + (rad(ctx, i) >= RING_SPLIT ? -1 : 1) * t / LAP; },
  sweep: function(ctx, i, t) {
    var p = ctx.polar(i);
    return (p[0] * Math.cos(p[1] - t / LAP * TAU) + 1) / 2 * 0.5;
  },
  spiral: function(ctx, i, t) { return pos(ctx, i) + (1 - rad(ctx, i)) * 0.5 - t / LAP; },
  rings: function(ctx, i, t) { return rad(ctx, i) * 0.6 + t / LAP; },
  tide: function(ctx, i, t) { return t / (LAP * 1.5) - (1 - rad(ctx, i)) * 0.12; },
  pendulum: function(ctx, i, t) { return pos(ctx, i) + 0.25 * Math.sin(t / LAP * TAU); },
  still: function(ctx, i) { return pos(ctx, i); }
};

// Whole-ring collapse: outer out, middle out, centre alone, middle back,
// outer back, all on. Six equal beats of the cycle; centre never dims.
function collapseLevel(r, x) {
  if (r === -1) return 1;
  if (r === 1) return 1 - rise(x, 0, 1 / 6) + rise(x, 4 / 6, 1 / 6);
  return 1 - rise(x, 1 / 6, 1 / 6) + rise(x, 3 / 6, 1 / 6);
}
// Pane-by-pane collapse: within a ring's beat the panes go clockwise from 12
// o'clock, each fading over the width of one pane; they come back the same way.
function collapsePanesLevel(r, x, s, n) {
  if (r === -1) return 1;
  var outAt = r === 1 ? 0 : 1 / 6;
  var inAt = r === 1 ? 4 / 6 : 3 / 6;
  var w = 1 / 6 / n;
  return 1 - rise(x, outAt + s * w, w) + rise(x, inAt + s * w, w);
}

var ANIMS = {
  still: function() { return 1; },
  breathe: function(ctx, i, t) { return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * TAU / 9)); },
  ringBreathe: function(ctx, i, t) {
    var r = ring(ctx, i);
    var ph = r === 1 ? 0 : r === 0 ? TAU / 3 : 2 * TAU / 3;
    return 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * TAU / 11 + ph));
  },
  collapse: function(ctx, i, t) { return collapseLevel(ring(ctx, i), fract(t / CYCLE)); },
  collapsePanes: function(ctx, i, t) {
    return collapsePanesLevel(ring(ctx, i), fract(t / CYCLE), slots[i], counts[i]);
  },
  unwind: function(ctx, i, t) {
    // One path: outer ring clockwise, then middle ring clockwise, then the
    // centre. Light drains along it one pane at a time, then refills from the
    // outside again.
    var r = ring(ctx, i);
    var order = r === 1 ? slots[i] : r === 0 ? counts[i] + slots[i] : 2 * counts[i];
    var total = 0;
    for (var k = 0; k < ctx.count; k++) if (ring(ctx, k) !== -1) total = Math.max(total, counts[k]);
    total = total * 2 + 1;
    var x = fract(t / CYCLE);
    var w = 0.45 / total;
    var off = 1 - rise(x, order * w, w);
    var on = rise(x, 0.5 + order * w, w);
    return r === -1 ? Math.max(0.35, off + on) : clamp01(off + on);
  },
  droplet: function(ctx, i, t) {
    var d = fract(t / 8) - (rad(ctx, i) * 0.7);
    var pulse = Math.exp(-Math.pow((fract(d + 0.5) - 0.5) * 6, 2));
    return 0.15 + 0.85 * pulse;
  },
  sink: function(ctx, i, t) {
    var d = fract(t / 8) + (rad(ctx, i) * 0.7);
    var pulse = Math.exp(-Math.pow((fract(d + 0.5) - 0.5) * 6, 2));
    return 0.15 + 0.85 * pulse;
  },
  beacon: function(ctx, i, t) {
    var x = fract(t / 10);
    var r = ring(ctx, i);
    var at = r === -1 ? 0 : r === 0 ? 0.25 : 0.5;
    var d = Math.abs(fract(x - at + 0.5) - 0.5);
    return 0.2 + 0.8 * Math.exp(-Math.pow(d * 7, 2));
  },
  swap: function(ctx, i, t) {
    var r = ring(ctx, i);
    if (r === -1) return 1;
    var s = 0.5 + 0.5 * Math.sin(t * TAU / 14);
    return 0.1 + 0.9 * (r === 1 ? s : 1 - s);
  },
  chase: function(ctx, i, t) {
    if (ring(ctx, i) === -1) return 0.7;
    var head = fract(t / 12);
    return 0.15 + 0.85 * Math.exp(-Math.pow(gap(pos(ctx, i), head) * 5, 2));
  },
  counter: function(ctx, i, t) {
    var r = ring(ctx, i);
    if (r === -1) return 0.7;
    var head = fract((r === 1 ? 1 : -1) * t / 12);
    return 0.15 + 0.85 * Math.exp(-Math.pow(gap(pos(ctx, i), head) * 5, 2));
  },
  comet: function(ctx, i, t) {
    if (ring(ctx, i) === -1) return 0.6;
    var head = fract(t / 14);
    var behind = fract(head - pos(ctx, i));
    return 0.08 + 0.92 * Math.exp(-behind * 5);
  },
  spokes: function(ctx, i, t) {
    if (ring(ctx, i) === -1) return 1;
    var a = pos(ctx, i) - t / 40;
    return 0.15 + 0.85 * Math.pow(0.5 + 0.5 * Math.cos(a * TAU * 3), 2);
  },
  sweep: function(ctx, i, t) {
    var p = ctx.polar(i);
    var d = p[0] * Math.cos(p[1] - t / 30 * TAU);
    return 0.2 + 0.8 * ss((d + 0.6) / 1.2);
  },
  pendulum: function(ctx, i, t) {
    var p = ctx.polar(i);
    var x = p[0] * Math.cos(p[1]);
    var swing = Math.sin(t * TAU / 12);
    return 0.25 + 0.75 * ss((x * swing + 0.8) / 1.6);
  },
  twinkle: function(ctx, i, t) {
    var p = pos(ctx, i);
    var g = Math.sin(t * 0.9 + p * 13 + rad(ctx, i) * 7) * 0.6 + Math.sin(t * 0.55 + p * 29) * 0.4;
    return 0.55 + 0.45 * g;
  },
  vortex: function(ctx, i, t) {
    var r = ring(ctx, i);
    if (r === -1) return 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * TAU / 9));
    var head = fract((r === 1 ? 1 : -1.6) * t / 16);
    return 0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.cos((pos(ctx, i) - head) * TAU * 2), 2);
  },
  rainfall: function(ctx, i, t) {
    if (ring(ctx, i) === -1) return 1;
    var x = fract(t / CYCLE);
    var order = fract(slots[i] * 0.618 + rad(ctx, i) * 0.31);
    var w = 0.08;
    return 1 - rise(x, order * 0.42, w) + rise(x, 0.5 + order * 0.42, w);
  },
  halo: function(ctx, i, t) {
    // Only one ring at a time: outer, middle, centre, middle, outer …
    var x = fract(t / 20) * 4;
    var r = ring(ctx, i);
    var at = r === 1 ? 0 : r === 0 ? 1 : 2;
    var d = Math.abs(x - at);
    d = Math.min(d, Math.abs(x - (4 - at)), Math.abs(x - 4 - at));
    return 0.08 + 0.92 * ss(1 - d);
  }
};

return {
  render: function(ctx) {
    geometry(ctx);
    var p = ctx.p || {};
    var paint = p.paint || [];
    var stops = p.stops || [[220, 90]];
    var anim = ANIMS[p.anim] || ANIMS.still;
    var flow = FLOWS[p.flow] || FLOWS.wheel;
    var level = p.level === undefined ? 100 : p.level;
    var t = ctx.t;
    for (var i = 0; i < ctx.count; i++) {
      var h = paint[i * 2];
      var c = (h === undefined || h < 0) ? grad(stops, flow(ctx, i, t)) : [h, paint[i * 2 + 1]];
      var b = clamp01(anim(ctx, i, t)) * level;
      ctx.set(i, c[0], c[1], b < 0 ? 0 : (b > 100 ? 100 : b));
    }
  },
  meta: { name: 'grace-paint' }
};
})()`;

/** The single pattern behind the GracePaint tab. */
export function gracePaintPattern(): string {
  return CODE;
}
