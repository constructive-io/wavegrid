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
 * centre cannon, from the normalized radius `ctx.polar` reports (the outermost
 * fixtures are at 1, the centre at 0). `RING_SPLIT` sits between the two rings
 * of a 1 / 0.62 / 0 layout with room to spare either side.
 */
const HELPERS = `
var RING_SPLIT = 0.8;
var CENTRE_MAX = 0.15;
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
