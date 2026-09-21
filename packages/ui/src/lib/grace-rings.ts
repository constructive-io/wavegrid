/**
 * Grace Cathedral's looks, as dynamic pattern sources.
 *
 * The room is two concentric rings of twelve with one cannon in the middle, so
 * a look here has two axes the Nova ring does not: which ring a fixture is on,
 * and where it sits around that ring. Everything below is written against
 * `ctx.polar` — radius picks the ring, angle picks the position — so the same
 * source works on any concentric layout (and degrades sanely on a single ring,
 * where every fixture reads as the outer one).
 *
 * Colour is per *ring*: a pair says what the outer and inner rings are, and the
 * centre cannon takes the mix of the two. That is what makes a droplet read as
 * a droplet — it changes colour as it crosses rings, not just brightness.
 */

export interface RingPair {
  name: string;
  /** [hue, saturation] for the outer ring. */
  outer: [number, number];
  /** [hue, saturation] for the inner ring. */
  inner: [number, number];
}

export const PAIRS: RingPair[] = [
  { name: 'Amber', outer: [40, 100], inner: [40, 45] },
  { name: 'Candle', outer: [30, 100], inner: [0, 0] },
  { name: 'Chapel', outer: [275, 90], inner: [40, 95] },
  { name: 'Sea', outer: [210, 95], inner: [175, 85] },
  { name: 'Rose', outer: [335, 85], inner: [20, 90] },
  { name: 'Jade', outer: [150, 85], inner: [60, 80] },
  { name: 'Ice', outer: [200, 60], inner: [0, 0] }
];

/** HSB as CSS, for swatches and tile backgrounds. */
export function hsbCss([hue, sat]: [number, number], brightness = 100): string {
  const v = brightness / 100;
  const s = sat / 100;
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return `hsl(${hue} ${Math.round(sl * 100)}% ${Math.round(l * 100)}%)`;
}

/** Outer colour on the rim, inner colour in the middle — the layout, as CSS. */
export function pairGradient(pair: RingPair): string {
  return `radial-gradient(circle, ${hsbCss(pair.inner)} 0%, ${hsbCss(pair.inner, 60)} 38%, ${hsbCss(pair.outer)} 70%)`;
}

/**
 * Ring helpers every source below is compiled against.
 *
 * `ring(ctx, i)` is 1 on the outer ring, 0 on the inner one and -1 for the
 * centre, from the normalized radius `ctx.polar` reports (the outermost
 * fixtures are at 1, the centre at 0). `RING_SPLIT` sits between the two rings
 * of twelve (1 / 0.62) and `CENTRE_MAX` below them, so both the single centre
 * cannon of grace-cathedral and the inner four of grace-28 (0.25) read as centre.
 */
const HELPERS = `
var RING_SPLIT = 0.8;
var CENTRE_MAX = 0.45;
function ring(ctx, i) {
  var r = ctx.polar(i)[0];
  if (r <= CENTRE_MAX) return -1;
  return r >= RING_SPLIT ? 1 : 0;
}
// 0..1 position around the ring, clockwise from 12 o'clock.
function pos(ctx, i) {
  var ang = ctx.polar(i)[1] + Math.PI / 2;
  return ((ang / (Math.PI * 2)) % 1 + 1) % 1;
}
// Shortest 0..0.5 distance between two 0..1 ring positions.
function gap(a, b) {
  var d = Math.abs(a - b);
  return d > 0.5 ? 1 - d : d;
}
// How many fixtures share this fixture's ring — a chase needs the ring's own
// count, not the whole installation's.
function ringCount(ctx, i) {
  var mine = ring(ctx, i);
  var n = 0;
  for (var k = 0; k < ctx.count; k++) if (ring(ctx, k) === mine) n++;
  return n || 1;
}
// Which slot of its own ring a fixture is. Floor keeps the mapping one-to-one
// for a staggered ring too; the epsilon stops a fixture sitting exactly on a
// slot edge from falling into the one below it through floating point.
function slot(ctx, i) {
  var n = ringCount(ctx, i);
  return Math.floor(pos(ctx, i) * n + 1e-6) % n;
}
// The colour of a fixture's ring; the centre takes the average of the two.
function tone(ctx, i) {
  var r = ring(ctx, i);
  if (r === 1) return OUTER;
  if (r === 0) return INNER;
  return [MID_HUE, (OUTER[1] + INNER[1]) / 2];
}
function put(ctx, i, level) {
  var c = tone(ctx, i);
  ctx.set(i, c[0], c[1], Math.max(0, Math.min(100, level)));
}
`;

/** Hue halfway between the pair's two hues, the short way round the wheel. */
function midHue(pair: RingPair): number {
  const [a] = pair.outer;
  const [b] = pair.inner;
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return ((a + d / 2) % 360 + 360) % 360;
}

function preamble(pair: RingPair): string {
  return `var OUTER = [${pair.outer[0]},${pair.outer[1]}];
var INNER = [${pair.inner[0]},${pair.inner[1]}];
var MID_HUE = ${Math.round(midHue(pair))};`;
}

function build(name: string, pair: RingPair, body: string): string {
  return `(function(){\n${preamble(pair)}\n${HELPERS}\nreturn {\nrender: function(ctx) {\n${body}\n},\nmeta: { name: '${name}' }\n};\n})()`;
}

export interface Look {
  name: string;
  code: string;
}

/** Stills: the two rings holding a shape, no motion. */
export function graceStills(pair: RingPair): Look[] {
  return [
    {
      name: 'Two Tone',
      code: build('grace-two-tone', pair, `  for (var i = 0; i < ctx.count; i++) put(ctx, i, 100);`)
    },
    {
      name: 'Halo',
      code: build('grace-halo', pair, `  for (var i = 0; i < ctx.count; i++) {
    put(ctx, i, ring(ctx, i) === 1 ? 100 : 30);
  }`)
    },
    {
      name: 'Core',
      code: build('grace-core', pair, `  for (var i = 0; i < ctx.count; i++) {
    var r = ring(ctx, i);
    put(ctx, i, r === -1 ? 100 : r === 0 ? 75 : 22);
  }`)
    },
    {
      name: 'Spokes',
      code: build('grace-spokes', pair, `  for (var i = 0; i < ctx.count; i++) {
    put(ctx, i, slot(ctx, i) % 2 === 0 ? 100 : 12);
  }`)
    },
    {
      name: 'Cross',
      code: build('grace-cross', pair, `  // Four arms out of the centre. The tolerance is half a slot, so a ring that
  // is staggered off the arms lights the fixtures flanking each one instead.
  for (var i = 0; i < ctx.count; i++) {
    if (ring(ctx, i) === -1) { put(ctx, i, 100); continue; }
    var p = pos(ctx, i);
    var arm = Math.min(gap(p, 0), gap(p, 0.25), gap(p, 0.5), gap(p, 0.75));
    put(ctx, i, arm <= 0.5 / ringCount(ctx, i) + 1e-6 ? 100 : 10);
  }`)
    }
  ];
}

/**
 * Motion. Droplets travel along the radius (centre → rim, or rim → centre) so
 * each ring lights in turn and takes its own colour on the way; chases travel
 * around the rings, which can run together or against each other.
 */
export function graceMotion(pair: RingPair): Look[] {
  return [
    {
      name: 'Droplet',
      code: build('grace-droplet', pair, `  // A ripple leaving the centre: 1.4s per trip, each ring lit as it passes.
  var wave = (ctx.t * 0.7) % 1;
  for (var i = 0; i < ctx.count; i++) {
    var r = ctx.polar(i)[0];
    var d = Math.abs(r - wave);
    put(ctx, i, 100 - d * 260);
  }`)
    },
    {
      name: 'Sink',
      code: build('grace-sink', pair, `  var wave = 1 - (ctx.t * 0.7) % 1;
  for (var i = 0; i < ctx.count; i++) {
    var d = Math.abs(ctx.polar(i)[0] - wave);
    put(ctx, i, 100 - d * 260);
  }`)
    },
    {
      name: 'Rainfall',
      code: build('grace-rainfall', pair, `  // Overlapping droplets: three ripples a third of a cycle apart.
  for (var i = 0; i < ctx.count; i++) {
    var r = ctx.polar(i)[0];
    var level = 0;
    for (var k = 0; k < 3; k++) {
      var wave = (ctx.t * 0.5 + k / 3) % 1;
      level = Math.max(level, 100 - Math.abs(r - wave) * 300);
    }
    put(ctx, i, level);
  }`)
    },
    {
      name: 'Chase',
      code: build('grace-chase', pair, `  // Both rings chase clockwise; each ring uses its own slot count so twelve
  // and twelve stay in step and the centre holds a low glow.
  for (var i = 0; i < ctx.count; i++) {
    if (ring(ctx, i) === -1) { put(ctx, i, 18); continue; }
    var n = ringCount(ctx, i);
    var lit = Math.floor(ctx.t * 6) % n;
    put(ctx, i, slot(ctx, i) === lit ? 100 : 8);
  }`)
    },
    {
      name: 'Counter',
      code: build('grace-counter', pair, `  // The rings chase in opposite directions, crossing twice a lap.
  for (var i = 0; i < ctx.count; i++) {
    var r = ring(ctx, i);
    if (r === -1) { put(ctx, i, 18); continue; }
    var n = ringCount(ctx, i);
    var step = Math.floor(ctx.t * 6);
    var lit = r === 1 ? step % n : ((n - (step % n)) % n);
    put(ctx, i, slot(ctx, i) === lit ? 100 : 8);
  }`)
    },
    {
      name: 'Comet',
      code: build('grace-comet', pair, `  // One head per ring with a fading tail behind it.
  var head = (ctx.t * 0.25) % 1;
  for (var i = 0; i < ctx.count; i++) {
    if (ring(ctx, i) === -1) { put(ctx, i, 12); continue; }
    put(ctx, i, 100 - gap(pos(ctx, i), head) * ringCount(ctx, i) * 40);
  }`)
    },
    {
      name: 'Swap',
      code: build('grace-swap', pair, `  // The rings trade brightness, so the colour of the room swaps back and forth.
  var swing = 0.5 + 0.5 * Math.sin(ctx.t * 1.2);
  for (var i = 0; i < ctx.count; i++) {
    var r = ring(ctx, i);
    var level = r === 1 ? swing : r === 0 ? 1 - swing : 0.5;
    put(ctx, i, 10 + 90 * level);
  }`)
    },
    {
      name: 'Breathe',
      code: build('grace-breathe', pair, `  // Whole room breathing, the inner ring a quarter cycle behind the outer.
  for (var i = 0; i < ctx.count; i++) {
    var lag = ring(ctx, i) === 1 ? 0 : Math.PI / 2;
    put(ctx, i, 20 + 80 * (0.5 + 0.5 * Math.sin(ctx.t * 0.9 - lag)));
  }`)
    },
    {
      name: 'Vortex',
      code: build('grace-vortex', pair, `  // A brightness wave spiralling in: the inner ring lags the outer by a third
  // of a turn, so the two rings read as one twisting shape.
  for (var i = 0; i < ctx.count; i++) {
    var twist = ring(ctx, i) === 1 ? 0 : 0.33;
    var phase = Math.sin((pos(ctx, i) + twist - ctx.t * 0.2) * Math.PI * 2);
    put(ctx, i, 30 + 70 * (0.5 + 0.5 * phase));
  }`)
    },
    {
      name: 'Beacon',
      code: build('grace-beacon', pair, `  // Centre flash, then the rings answer it in turn.
  var beat = (ctx.t * 0.8) % 1;
  for (var i = 0; i < ctx.count; i++) {
    var r = ring(ctx, i);
    var at = r === -1 ? 0 : r === 0 ? 0.25 : 0.5;
    var d = Math.abs(beat - at);
    put(ctx, i, 8 + 92 * Math.max(0, 1 - d * 6));
  }`)
    }
  ];
}

/* ───────────────────────── Gradients ─────────────────────────
 *
 * A second family for the room: a multi-stop colour gradient laid over the
 * geometry and turned very slowly. Where the pair looks give each ring one
 * colour, these give every fixture its own point on a blended sweep, so the
 * window reads as one slow field of colour rather than two rings. Speeds are
 * deliberately meditative — a full lap is about a minute at 1× — and the
 * header speed slider scales them like every other pattern.
 */

export interface Gradient {
  name: string;
  /** [hue, saturation] stops, in order around the loop; the last blends back into the first. */
  stops: [number, number][];
}

export const GRADIENTS: Gradient[] = [
  { name: 'Dawn', stops: [[335, 70], [20, 90], [45, 100]] },
  { name: 'Stained Glass', stops: [[225, 95], [275, 90], [345, 85], [40, 95]] },
  { name: 'Ocean', stops: [[185, 90], [210, 95], [250, 80]] },
  { name: 'Ember', stops: [[0, 100], [20, 100], [40, 100], [10, 60]] },
  { name: 'Moonlight', stops: [[210, 25], [200, 60], [0, 0]] },
  { name: 'Aurora', stops: [[150, 90], [175, 85], [270, 80], [330, 60]] },
  { name: 'Rose Gold', stops: [[340, 80], [15, 70], [45, 90], [30, 50]] },
  { name: 'Twilight', stops: [[260, 85], [300, 70], [20, 85]] },
  { name: 'Forest', stops: [[95, 80], [140, 90], [60, 85], [165, 70]] },
  { name: 'Candlelit', stops: [[35, 100], [30, 60], [40, 95], [25, 80]] },
  { name: 'Violet Hour', stops: [[275, 90], [230, 85], [320, 70]] },
  { name: 'Coral Reef', stops: [[10, 85], [175, 85], [45, 90], [200, 70]] },
  { name: 'Sunset', stops: [[15, 95], [40, 100], [340, 80], [280, 75]] },
  { name: 'Spectrum', stops: [[0, 90], [60, 90], [120, 90], [180, 90], [240, 90], [300, 90]] },
  { name: 'Ice Fire', stops: [[200, 90], [20, 100]] },
  { name: 'Sage', stops: [[140, 40], [90, 50], [60, 30], [170, 45]] }
];

/** The gradient as a CSS conic sweep, for swatches and tile backgrounds. */
export function gradientCss(g: Gradient): string {
  const n = g.stops.length;
  const stops = [...g.stops, g.stops[0]].map((s, i) => `${hsbCss(s)} ${Math.round((i / n) * 100)}%`);
  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
}

/** Shortest-way hue interpolation between the stops at a 0..1 loop position. */
const GRADIENT_HELPERS = `
function lerpHue(a, b, t) {
  var d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return ((a + d * t) % 360 + 360) % 360;
}
// Colour at 0..1 around the loop, the last stop blending back into the first.
function grad(u) {
  var n = STOPS.length;
  var x = ((u % 1) + 1) % 1 * n;
  var k = Math.floor(x);
  var t = x - k;
  var a = STOPS[k % n];
  var b = STOPS[(k + 1) % n];
  return [lerpHue(a[0], b[0], t), a[1] + (b[1] - a[1]) * t];
}
function paint(ctx, i, u, level) {
  var c = grad(u);
  ctx.set(i, c[0], c[1], Math.max(0, Math.min(100, level)));
}
// 0..1 position around the ring, clockwise from 12 o'clock.
function pos(ctx, i) {
  var ang = ctx.polar(i)[1] + Math.PI / 2;
  return ((ang / (Math.PI * 2)) % 1 + 1) % 1;
}
function rad(ctx, i) { return ctx.polar(i)[0]; }
// One lap of the gradient at 1x takes LAP seconds.
var LAP = 60;
`;

function buildGradient(name: string, g: Gradient, body: string): string {
  const stops = `var STOPS = [${g.stops.map(([h, s]) => `[${h},${s}]`).join(',')}];`;
  return `(function(){\n${stops}\n${GRADIENT_HELPERS}\nreturn {\nrender: function(ctx) {\n${body}\n},\nmeta: { name: '${name}' }\n};\n})()`;
}

/**
 * Slow gradient looks. Each maps a fixture to a point on the gradient loop
 * from its angle and/or radius, then drifts that mapping with time.
 */
export function graceGradients(g: Gradient): Look[] {
  return [
    {
      name: 'Wheel',
      code: buildGradient('grace-wheel', g, `  // The gradient wrapped once around the window, turning clockwise.
  var turn = ctx.t / LAP;
  for (var i = 0; i < ctx.count; i++) paint(ctx, i, pos(ctx, i) - turn, 90);`)
    },
    {
      name: 'Counter',
      code: buildGradient('grace-counter-wheel', g, `  // Outer ring turns clockwise, everything inside it turns the other way.
  var turn = ctx.t / LAP;
  for (var i = 0; i < ctx.count; i++) {
    var dir = rad(ctx, i) >= 0.8 ? -1 : 1;
    paint(ctx, i, pos(ctx, i) + dir * turn, 90);
  }`)
    },
    {
      name: 'Sweep',
      code: buildGradient('grace-sweep', g, `  // A straight band of gradient across the whole window, slowly rotating —
  // opposite sides of the room are always opposite colours.
  var a = ctx.t / LAP * Math.PI * 2;
  for (var i = 0; i < ctx.count; i++) {
    var p = ctx.polar(i);
    var d = p[0] * Math.cos(p[1] - a);
    paint(ctx, i, (d + 1) / 2 * 0.5, 90);
  }`)
    },
    {
      name: 'Spiral',
      code: buildGradient('grace-gradient-spiral', g, `  // Angle plus a twist by radius, so the colours wind in toward the centre.
  var turn = ctx.t / LAP;
  for (var i = 0; i < ctx.count; i++) {
    paint(ctx, i, pos(ctx, i) + (1 - rad(ctx, i)) * 0.5 - turn, 90);
  }`)
    },
    {
      name: 'Petals',
      code: buildGradient('grace-petals', g, `  // The gradient wrapped twice around, so the window shows a two-fold flower.
  var turn = ctx.t / LAP;
  for (var i = 0; i < ctx.count; i++) paint(ctx, i, pos(ctx, i) * 2 - turn, 90);`)
    },
    {
      name: 'Rings',
      code: buildGradient('grace-gradient-rings', g, `  // Colour by radius — rim, inner ring and centre each a different point on
  // the loop — cycling slowly inward.
  var drift = ctx.t / LAP;
  for (var i = 0; i < ctx.count; i++) paint(ctx, i, rad(ctx, i) * 0.6 + drift, 90);`)
    },
    {
      name: 'Tide',
      code: buildGradient('grace-tide', g, `  // The whole room one colour, drifting through the loop together, the inner
  // rings a little behind so it looks like the colour is arriving from outside.
  var drift = ctx.t / (LAP * 1.5);
  for (var i = 0; i < ctx.count; i++) paint(ctx, i, drift - (1 - rad(ctx, i)) * 0.12, 90);`)
    },
    {
      name: 'Pendulum',
      code: buildGradient('grace-pendulum', g, `  // The wheel swings back and forth instead of turning — a quarter turn each way.
  var swing = 0.25 * Math.sin(ctx.t / LAP * Math.PI * 2);
  for (var i = 0; i < ctx.count; i++) paint(ctx, i, pos(ctx, i) + swing, 90);`)
    },
    {
      name: 'Drift',
      code: buildGradient('grace-drift', g, `  // Each ring turns at its own pace, so the pattern between them is never the same twice.
  var t = ctx.t / LAP;
  for (var i = 0; i < ctx.count; i++) {
    var r = rad(ctx, i);
    var rate = r >= 0.8 ? 1 : r >= 0.45 ? 1.37 : 0.61;
    paint(ctx, i, pos(ctx, i) - t * rate, 90);
  }`)
    },
    {
      name: 'Glow',
      code: buildGradient('grace-glow', g, `  // A turning wheel with a soft brightness swell riding round it — the light
  // seems to travel, not just the colour.
  var turn = ctx.t / LAP;
  for (var i = 0; i < ctx.count; i++) {
    var u = pos(ctx, i) - turn;
    var swell = 0.5 + 0.5 * Math.sin(u * Math.PI * 2);
    paint(ctx, i, u, 45 + 55 * swell);
  }`)
    },
    {
      name: 'Breathe',
      code: buildGradient('grace-gradient-breathe', g, `  // Wheel turning while the whole window breathes, inner rings a beat behind.
  var turn = ctx.t / LAP;
  for (var i = 0; i < ctx.count; i++) {
    var lag = (1 - rad(ctx, i)) * 1.2;
    var breath = 0.5 + 0.5 * Math.sin(ctx.t * 0.35 - lag);
    paint(ctx, i, pos(ctx, i) - turn, 30 + 70 * breath);
  }`)
    },
    {
      name: 'Embers',
      code: buildGradient('grace-gradient-embers', g, `  // Slow wheel with each fixture flickering gently at its own rate: alive but still.
  var turn = ctx.t / (LAP * 2);
  for (var i = 0; i < ctx.count; i++) {
    var p = pos(ctx, i);
    var flicker = Math.sin(ctx.t * 1.3 + p * 11 + rad(ctx, i) * 7) * 0.6 + Math.sin(ctx.t * 0.8 + p * 27) * 0.4;
    paint(ctx, i, p - turn, 60 + 35 * flicker);
  }`)
    },
    {
      name: 'Bloom',
      code: buildGradient('grace-bloom', g, `  // Colour opens from the centre outward and closes again, the wheel turning under it.
  var turn = ctx.t / LAP;
  var open = 0.5 + 0.5 * Math.sin(ctx.t * 0.25);
  for (var i = 0; i < ctx.count; i++) {
    var r = rad(ctx, i);
    var level = 100 - Math.max(0, r - open) * 160;
    paint(ctx, i, pos(ctx, i) * 0.5 - turn + r * 0.3, Math.max(15, level));
  }`)
    },
    {
      name: 'Still',
      code: buildGradient('grace-gradient-still', g, `  // The wheel, not moving — the gradient as a held picture.
  for (var i = 0; i < ctx.count; i++) paint(ctx, i, pos(ctx, i), 90);`)
    }
  ];
}
