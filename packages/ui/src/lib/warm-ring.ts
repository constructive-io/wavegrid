/**
 * Nova's white ↔ amber looks, as dynamic pattern sources.
 *
 * Nova is a single-colour ring of six, so a look says what it has to say with
 * brightness and ring position alone. The one colour choice is how warm the
 * ring is: hue stays at amber and saturation carries the warmth, so 0 is white,
 * 100 is full amber, and everything between is a warmer white. Tint and look
 * are separate choices — every builder below takes the tint.
 *
 * These mirror the shared looks in @wavegrid/animations (the desktop Nova
 * panel) so both surfaces offer the same vocabulary.
 */

export const AMBER_HUE = 40;

/** Six brightness steps for six lasers. */
export const LEVELS = [100, 74, 52, 34, 20, 10];

export interface Tint {
  name: string;
  /** Saturation at `AMBER_HUE`: 0 = white, 100 = amber. */
  sat: number;
}

export const TINTS: Tint[] = [
  { name: 'White', sat: 0 },
  { name: 'Ivory', sat: 25 },
  { name: 'Warm', sat: 50 },
  { name: 'Honey', sat: 75 },
  { name: 'Amber', sat: 100 }
];

/** The tint as CSS, at a 0..100 brightness — for swatches and tile previews. */
export function tintCss(sat: number, brightness = 100): string {
  const v = brightness / 100;
  const s = sat / 100;
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return `hsl(${AMBER_HUE} ${Math.round(sl * 100)}% ${Math.round(l * 100)}%)`;
}

export function tintGradient(sat: number): string {
  return `conic-gradient(${tintCss(sat)}, ${tintCss(sat, 30)}, ${tintCss(sat)})`;
}

/** A one-colour palette, for the shared ring builders that interpolate COLORS. */
export function tintPalette(sat: number): string {
  return `var COLORS = [[${AMBER_HUE},${sat},100]];`;
}

function preamble(sat: number): string {
  return `${tintPalette(sat)}
var HUE = ${AMBER_HUE};
var SAT = ${sat};
var LEVELS = [${LEVELS.join(',')}];`;
}

/**
 * Which of the ring's slots a fixture sits in, from its angle. Fixtures land
 * mid-slot, so floor (not round) keeps the mapping one-to-one — rounding puts
 * every fixture on a slot boundary and collides neighbours.
 */
const SLOT = `  var slot = Math.floor(ringPos(ctx, i) * ctx.count) % ctx.count;`;

/**
 * Render bodies, keyed by look. `wrapper` is the tab's `wrap`, which supplies
 * the shared ring helpers (`ringPos`, `ringDist`, `colorAt`).
 */
export type Wrapper = (name: string, body: string, colorsCode: string) => string;

function build(wrapper: Wrapper, name: string, sat: number, body: string): string {
  return wrapper(name, body, preamble(sat));
}

/** Every laser at one brightness. */
export function warmFlat(wrapper: Wrapper, name: string, sat: number, level: number): string {
  return build(wrapper, name, sat, `  ctx.fill(HUE, SAT, ${level});`);
}

export function warmStillCode(wrapper: Wrapper, sat: number) {
  return {
    alternate: build(wrapper, 'amber-alternate', sat, `  for (var i = 0; i < ctx.count; i++) {
${SLOT}
    ctx.set(i, HUE, SAT, slot % 2 === 0 ? 100 : 22);
  }`),
    ramp: build(wrapper, 'amber-ramp', sat, `  for (var i = 0; i < ctx.count; i++) {
${SLOT}
    ctx.set(i, HUE, SAT, LEVELS[slot % LEVELS.length]);
  }`),
    horizon: build(wrapper, 'amber-horizon', sat, `  for (var i = 0; i < ctx.count; i++) {
    ctx.set(i, HUE, SAT, ringPos(ctx, i) < 0.5 ? 100 : 25);
  }`)
  };
}

export function warmMotionCode(wrapper: Wrapper, sat: number) {
  return {
    chase: build(wrapper, 'amber-chase', sat, `  var lit = Math.floor(ctx.t * 4) % ctx.count;
  for (var i = 0; i < ctx.count; i++) {
${SLOT}
    ctx.set(i, HUE, SAT, slot === lit ? 100 : 8);
  }`),
    levels: build(wrapper, 'amber-levels', sat, `  var offset = Math.floor(ctx.t * 3);
  for (var i = 0; i < ctx.count; i++) {
${SLOT}
    ctx.set(i, HUE, SAT, LEVELS[(slot + offset) % LEVELS.length]);
  }`),
    heartbeat: build(wrapper, 'amber-heartbeat', sat, `  var swing = 0.5 + 0.5 * Math.sin(ctx.t * 2);
  for (var i = 0; i < ctx.count; i++) {
${SLOT}
    var level = slot % 2 === 0 ? swing : 1 - swing;
    ctx.set(i, HUE, SAT, 12 + 88 * level);
  }`),
    embers: build(wrapper, 'amber-embers', sat, `  for (var i = 0; i < ctx.count; i++) {
    var pos = ringPos(ctx, i);
    var flicker = Math.sin(ctx.t * 1.3 + pos * 11) * 0.6 + Math.sin(ctx.t * 0.8 + pos * 27) * 0.4;
    ctx.set(i, HUE, SAT, Math.max(5, 55 + 40 * flicker));
  }`)
  };
}
