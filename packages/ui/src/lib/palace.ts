import { GRADIENTS, PAIRS } from './grace-rings';

/**
 * Palace: the show tab for the Palace of Fine Arts rig (a cannon row zippered
 * with a projector row). One receiver pattern, GracePaint's model: colour (a
 * gradient and how it flows along the line) and brightness (a motion) are
 * separate layers, every control is a pattern parameter, and touching a
 * fixture paints its hue without stopping the motion. Colour and brightness
 * only: no projector size/position/cue controls.
 */
export const PALACE_ID = 'palace';

export interface PalaceFixture {
  x: number;
  kind?: 'cannon' | 'projector';
}

export interface Choice {
  key: string;
  name: string;
  hint: string;
}

export const FLOWS: Choice[] = [
  { key: 'scroll', name: 'Scroll', hint: 'Gradient laid left to right, travelling right' },
  { key: 'mirror', name: 'Mirror', hint: 'Symmetric about the middle, travelling out to both ends' },
  { key: 'counter', name: 'Counter', hint: 'Cannons scroll one way, projectors the other' },
  { key: 'weave', name: 'Weave', hint: 'Neighbouring cannon and projector always contrast' },
  { key: 'duo', name: 'Duo', hint: 'All cannons one colour, all projectors the other' },
  { key: 'tide', name: 'Tide', hint: 'The whole rig nearly one colour, drifting' },
  { key: 'pendulum', name: 'Pendulum', hint: 'The gradient rocks left and right' },
  { key: 'still', name: 'Still', hint: 'The gradient held as a picture' }
];

export const ANIMS: Choice[] = [
  { key: 'solid', name: 'Solid', hint: 'Colour only' },
  { key: 'shimmer', name: 'Shimmer', hint: 'A soft ripple runs along the line; everything stays on' },
  { key: 'breathe', name: 'Breathe', hint: 'The whole rig dips and swells' },
  { key: 'duoBreathe', name: 'Duo Breathe', hint: 'Cannons and projectors breathe in opposite phase' },
  { key: 'trade', name: 'Trade', hint: 'Cannons on, then projectors on' },
  { key: 'pairs', name: 'Pairs', hint: 'Every other cannon-and-projector pair alternates' },
  { key: 'sweep', name: 'Sweep', hint: 'A bright head runs left to right' },
  { key: 'counter', name: 'Counter', hint: 'Cannon head runs right, projector head runs left' },
  { key: 'bounce', name: 'Bounce', hint: 'A band swings end to end' },
  { key: 'bloom', name: 'Bloom', hint: 'Light opens from the middle out' },
  { key: 'gather', name: 'Gather', hint: 'Light arrives from both ends and meets in the middle' },
  { key: 'beacon', name: 'Beacon', hint: 'The middle pulses and a wave follows it outward' },
  { key: 'bands', name: 'Bands', hint: 'Three bright bands travel along the line' },
  { key: 'curtain', name: 'Curtain', hint: 'Closes from the ends to the middle, then reopens' },
  { key: 'zipper', name: 'Zipper', hint: 'Fixtures go out one by one along the zigzag, then return' },
  { key: 'rainfall', name: 'Rainfall', hint: 'Fixtures drop out in scattered order, then return' },
  { key: 'twinkle', name: 'Twinkle', hint: 'Each fixture twinkles on its own' }
];

export const SPANS: { key: number; name: string }[] = [
  { key: 0.25, name: '¼' },
  { key: 0.5, name: '½' },
  { key: 1, name: '1' },
  { key: 2, name: '2' }
];

export const SPINS: { key: number; name: string }[] = [
  { key: 0, name: 'Still' },
  { key: 0.5, name: 'Slow' },
  { key: 1, name: 'Medium' },
  { key: 2, name: 'Fast' }
];

export type Who = 'both' | 'cannon' | 'projector';
export const WHO: { key: Who; name: string }[] = [
  { key: 'both', name: 'Both' },
  { key: 'cannon', name: 'Cannons' },
  { key: 'projector', name: 'Projectors' }
];

export interface Duo {
  name: string;
  /** [hue, sat] for the cannons, then the projectors. */
  stops: [[number, number], [number, number]];
}

export const DUOS: Duo[] = [
  { name: 'Gold / White', stops: [[40, 100], [0, 0]] },
  ...PAIRS.map((p) => ({ name: p.name, stops: [p.outer, p.inner] as Duo['stops'] }))
];

export interface PalaceParams {
  kind: 'palace';
  stops: [number, number][];
  flow: string;
  span: number;
  spin: number;
  anim: string;
  who: Who;
  level: number;
  cannon: number;
  projector: number;
  /** Flat [h0, s0, h1, s1, …]; a negative hue means not painted. */
  paint: number[];
}

/** The parts of PalaceParams a scene sets; paint is cleared and trims are kept. */
export type SceneParams = Pick<PalaceParams, 'stops' | 'flow' | 'span' | 'spin' | 'anim' | 'who'>;

export interface Scene {
  name: string;
  params: SceneParams;
}

function gradient(name: string): [number, number][] {
  const g = GRADIENTS.find((x) => x.name === name);
  if (!g) throw new Error(`Unknown gradient ${name}`);
  return g.stops.map(([h, s]) => [h, s] as [number, number]);
}

function scene(name: string, stops: [number, number][], flow: string, span: number, spin: number, anim: string, who: Who = 'both'): Scene {
  return { name, params: { stops, flow, span, spin, anim, who } };
}

export const SCENES: Scene[] = [
  scene('Monument', [[40, 100], [0, 0]], 'duo', 1, 0, 'trade'),
  scene('Golden Hour', gradient('Dawn'), 'tide', 1, 1, 'breathe'),
  scene('Lagoon', gradient('Ocean'), 'scroll', 0.5, 1, 'shimmer'),
  scene('Rotunda', gradient('Rose Gold'), 'mirror', 1, 1, 'bloom'),
  scene('Colonnade', [[40, 100], [40, 45]], 'duo', 1, 0, 'sweep', 'cannon'),
  scene('Aurora', gradient('Aurora'), 'scroll', 1, 1, 'twinkle'),
  scene('Ember', gradient('Ember'), 'mirror', 1, 0.5, 'beacon'),
  scene('Twilight', gradient('Twilight'), 'counter', 0.5, 1, 'solid'),
  scene('Stained Glass', gradient('Stained Glass'), 'weave', 1, 0.5, 'pairs'),
  scene('Moonlight', gradient('Moonlight'), 'tide', 1, 0.5, 'rainfall'),
  scene('Ice & Fire', [[200, 90], [20, 100]], 'duo', 1, 0, 'duoBreathe'),
  scene('Spectrum', gradient('Spectrum'), 'scroll', 1, 2, 'solid')
];

export function emptyPaint(count: number): number[] {
  const p = new Array<number>(count * 2);
  for (let i = 0; i < count; i++) {
    p[i * 2] = -1;
    p[i * 2 + 1] = 0;
  }
  return p;
}

export function hasPaint(paint: number[]): boolean {
  for (let i = 0; i < paint.length; i += 2) if (paint[i] >= 0) return true;
  return false;
}

export function paintFixture(paint: number[], index: number, hue: number, sat: number): number[] {
  if (index < 0 || index * 2 >= paint.length) return paint;
  const next = paint.slice();
  next[index * 2] = hue;
  next[index * 2 + 1] = sat;
  return next;
}

/** `paint` with every fixture of `kind` set to hue/sat; others untouched. */
export function kindPaint(paint: number[], fixtures: PalaceFixture[], kind: 'cannon' | 'projector', hue: number, sat: number): number[] {
  let next = paint;
  fixtures.forEach((f, i) => {
    if ((f.kind ?? 'cannon') === kind) next = paintFixture(next, i, hue, sat);
  });
  return next;
}

export function defaultParams(count: number): PalaceParams {
  return { kind: 'palace', ...SCENES[0].params, level: 100, cannon: 100, projector: 100, paint: emptyPaint(count) };
}

/** Params with a scene applied: paint cleared, trims kept. */
export function withScene(p: PalaceParams, s: Scene): PalaceParams {
  return { ...p, ...s.params, stops: s.params.stops.map(([h, sat]) => [h, sat] as [number, number]), paint: emptyPaint(p.paint.length / 2) };
}

function sameStops(a: [number, number][], b: [number, number][]): boolean {
  return a.length === b.length && a.every(([h, s], k) => b[k][0] === h && b[k][1] === s);
}

/** The scene the live params still equal, if any. */
export function activeScene(p: PalaceParams): Scene | undefined {
  if (hasPaint(p.paint)) return undefined;
  return SCENES.find(
    (s) =>
      sameStops(s.params.stops, p.stops) &&
      s.params.flow === p.flow &&
      s.params.anim === p.anim &&
      s.params.who === p.who &&
      s.params.spin === p.spin &&
      (s.params.span === p.span || !['scroll', 'mirror', 'counter', 'weave', 'pendulum', 'still'].includes(p.flow))
  );
}

/** A Palace param set from loosely-typed JSON (the brain's `ctx.p`, a saved Look), or null. */
export function coercePalaceParams(p: Record<string, unknown>, count: number): PalaceParams | null {
  if (p.kind !== 'palace') return null;
  if (typeof p.anim !== 'string' || typeof p.flow !== 'string' || !Array.isArray(p.stops)) return null;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const paint = emptyPaint(count);
  if (Array.isArray(p.paint)) for (let i = 0; i < Math.min(paint.length, p.paint.length); i++) paint[i] = num(p.paint[i], paint[i]);
  for (let i = 0; i < paint.length; i += 2) if (paint[i] >= 360) paint[i] %= 360;
  const who: Who = p.who === 'cannon' || p.who === 'projector' ? p.who : 'both';
  const stops = (p.stops as unknown[]).filter(
    (st): st is [number, number] => Array.isArray(st) && st.length >= 2 && Number.isFinite(st[0]) && Number.isFinite(st[1])
  ).map(([h, sat]) => [h, sat] as [number, number]);
  if (stops.length === 0) return null;
  return {
    kind: 'palace',
    stops,
    flow: p.flow,
    span: num(p.span, 1),
    spin: num(p.spin, 1),
    anim: p.anim,
    who,
    level: num(p.level, 100),
    cannon: num(p.cannon, 100),
    projector: num(p.projector, 100),
    paint
  };
}

/**
 * The pattern source. Geometry (position along the line and kind) is baked in
 * from the layout, so the same code runs identically in the brain's preview
 * engine, the receiver sandbox and MiniGridPreview, whose `ctx.xy` differ.
 * Only ctx.t, ctx.p, ctx.count and ctx.set are used.
 */
export function palacePattern(fixtures: PalaceFixture[]): string {
  const xs = fixtures.map((f) => f.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const X = xs.map((x) => (hi > lo ? +((x - lo) / (hi - lo)).toFixed(4) : 0.5));
  const order = fixtures.map((_, i) => i).sort((a, b) => xs[a] - xs[b] || a - b);
  const RANK: number[] = new Array(fixtures.length);
  order.forEach((i, r) => {
    RANK[i] = r;
  });
  const PROJ = fixtures.map((f) => (f.kind === 'projector' ? 1 : 0));
  return `(function(){
var X = ${JSON.stringify(X)};
var RANK = ${JSON.stringify(RANK)};
var PROJ = ${JSON.stringify(PROJ)};
var N = X.length;
var TAU = Math.PI * 2;
// One lap of the gradient at 1x takes LAP seconds; one full cycle of a
// start-to-finish choreography takes CYCLE seconds.
var LAP = 60;
var CYCLE = 36;
var KMAX = Math.floor((N - 1) / 2);
var P = [], M = [], K = [];
for (var q = 0; q < N; q++) {
  P[q] = RANK[q] / N;                        // 0..1 along the zigzag, as a loop
  M[q] = Math.abs(X[q] - 0.5) * 2;           // 0 centre .. 1 ends
  K[q] = Math.min(RANK[q], N - 1 - RANK[q]); // 0 outermost .. KMAX centre pair
}
function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
function ss(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
function rise(x, a, w) { return ss((x - a) / w); }
function fract(v) { return v - Math.floor(v); }
function gap(a, b) { var d = Math.abs(a - b); return d > 0.5 ? 1 - d : d; }
function lerpHue(a, b, t) {
  var d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return ((a + d * t) % 360 + 360) % 360;
}
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
// Same rule as GracePaint: a fixture that should read as "on" never sits below
// PRESENT, because a dim laser looks off. Levels are PRESENT..1 or 0.
var PRESENT = 0.8;
function lit(v) { return PRESENT + (1 - PRESENT) * clamp01(v); }
function dip(v) { v = clamp01(v); return 1 - 0.8 * v * v * v * v; }
function crisp(v) { return ss((v - 0.3) / 0.4); }

// Colour: where on the gradient loop (0..1, wraps) fixture i sits at time t.
var FLOWS = {
  scroll: function(i, t, span) { return X[i] * span - t / LAP; },
  mirror: function(i, t, span) { return M[i] * span * 0.5 - t / LAP; },
  counter: function(i, t, span) { return X[i] * span + (PROJ[i] ? 1 : -1) * t / LAP; },
  weave: function(i, t, span) { return X[i] * span * 0.5 + PROJ[i] * 0.5 - t / LAP; },
  duo: function(i, t) { return PROJ[i] * 0.5 + t / (LAP * 1.5); },
  tide: function(i, t) { return t / (LAP * 1.5) - X[i] * 0.12; },
  pendulum: function(i, t, span) { return X[i] * span + 0.25 * Math.sin(t / LAP * TAU); },
  still: function(i, t, span) { return X[i] * span; }
};

// Brightness: 0..1 for fixture i at time t.
var ANIMS = {
  solid: function() { return 1; },
  shimmer: function(i, t) { return lit(0.5 + 0.5 * Math.sin((P[i] * 2 - t / 6) * TAU)); },
  breathe: function(i, t) { return dip(0.5 + 0.5 * Math.sin(t * TAU / 9)); },
  duoBreathe: function(i, t) { return dip(0.5 + 0.5 * Math.sin(t * TAU / 11 + PROJ[i] * Math.PI)); },
  trade: function(i, t) { var s = 0.5 + 0.5 * Math.sin(t * TAU / 14); return crisp(PROJ[i] ? 1 - s : s); },
  pairs: function(i, t) {
    var s = 0.5 + 0.5 * Math.sin(t * TAU / 10);
    return crisp(Math.floor(RANK[i] / 2) % 2 ? 1 - s : s);
  },
  sweep: function(i, t) { return ss(1.15 - fract(fract(t / 12) - P[i]) * 2.3); },
  counter: function(i, t) { return ss(1 - gap(P[i], fract((PROJ[i] ? -1 : 1) * t / 12)) * 4); },
  bounce: function(i, t) { return ss(1 - Math.abs(X[i] - (0.5 + 0.45 * Math.sin(t * TAU / 12))) * 3.2); },
  bloom: function(i, t) { var d = fract(t / 8) - M[i] * 0.7; return ss(1 - Math.abs(fract(d + 0.5) - 0.5) * 2.5); },
  gather: function(i, t) { var d = fract(t / 8) + M[i] * 0.7; return ss(1 - Math.abs(fract(d + 0.5) - 0.5) * 2.5); },
  beacon: function(i, t) {
    var x = fract(t / 10);
    if (K[i] >= KMAX - 1) return lit(0.5 + 0.5 * Math.cos(x * TAU));
    var d = Math.abs(fract(x - (0.15 + M[i] * 0.5) + 0.5) - 0.5);
    return ss(1 - d * 2.5);
  },
  bands: function(i, t) { return crisp(0.5 + 0.5 * Math.cos((P[i] * 3 - t / 13) * TAU)); },
  curtain: function(i, t) {
    if (K[i] === KMAX || KMAX < 1) return 1;
    var x = fract(t / CYCLE);
    var w = 0.45 / KMAX;
    return clamp01(1 - rise(x, K[i] * w, w) + rise(x, 0.5 + (KMAX - 1 - K[i]) * w, w));
  },
  zipper: function(i, t) {
    if (RANK[i] === N - 1) return 1;
    var x = fract(t / CYCLE);
    var w = 0.45 / N;
    return clamp01(1 - rise(x, RANK[i] * w, w) + rise(x, 0.5 + RANK[i] * w, w));
  },
  rainfall: function(i, t) {
    if (K[i] === KMAX) return 1;
    var x = fract(t / CYCLE);
    var order = fract(RANK[i] * 0.618);
    return clamp01(1 - rise(x, order * 0.42, 0.08) + rise(x, 0.5 + order * 0.42, 0.08));
  },
  twinkle: function(i, t) {
    var g = Math.sin(t * 0.9 + RANK[i] * 2.399) * 0.6 + Math.sin(t * 0.55 + RANK[i] * 5.1) * 0.4;
    return dip(0.5 + 0.5 * g);
  }
};

return {
  render: function(ctx) {
    var p = ctx.p || {};
    var paint = p.paint || [];
    var stops = p.stops || [[220, 90]];
    var flow = FLOWS[p.flow] || FLOWS.scroll;
    var anim = ANIMS[p.anim] || ANIMS.solid;
    var span = p.span === undefined ? 1 : p.span;
    var spin = p.spin === undefined ? 1 : p.spin;
    var level = p.level === undefined ? 100 : p.level;
    var cannon = p.cannon === undefined ? 100 : p.cannon;
    var projector = p.projector === undefined ? 100 : p.projector;
    var who = p.who || 'both';
    var hueShift = p.hueShift || 0;
    var t = ctx.t;
    for (var i = 0; i < N && i < ctx.count; i++) {
      var h = paint[i * 2];
      var c = (h === undefined || h < 0) ? grad(stops, flow(i, t * spin, span)) : [h, paint[i * 2 + 1]];
      var moves = who === 'both' || (who === 'projector') === (PROJ[i] === 1);
      var a = moves ? clamp01(anim(i, t)) : 1;
      var b = a * level * (PROJ[i] ? projector : cannon) / 100;
      ctx.set(i, ((c[0] + hueShift) % 360 + 360) % 360, c[1], b < 0 ? 0 : (b > 100 ? 100 : b));
    }
  },
  meta: { name: 'palace' }
};
})()`;
}
