/**
 * The Pool: a continuous field of light that touches stir rather than paint.
 *
 * Paint maps a finger to a cannon one-to-one; Drops fire a ripple per tap. The
 * pool sits between the two. Every touch is smoothed and then deposited into a
 * field of soft sources — blobs, or expanding rings in Droplets mode — that
 * drift, spread, dissolve and blend. The cannons only ever *sample* that field
 * at their configured positions, so the same gesture reads sensibly on a 7×7
 * grid, a 6-cannon ring or Grace Cathedral's two rings and a centre.
 *
 * Everything evolves on elapsed seconds, never on frame count, so a slow iPad
 * and a fast laptop produce the same motion. Coordinates are the normalized
 * 0..1 square the layout's fixtures live in.
 *
 * What a cannon can do is hue, saturation and brightness — nothing here needs
 * anything else. Brightness is the field's local energy through a soft knee,
 * hue and saturation are the energy-weighted mix of whatever is glowing there.
 */

import { Current, CURRENT_MAX_SPEED, CURRENT_N } from './current';

export type PoolMode = 'flow' | 'spiral' | 'droplets';

export interface PoolSettings {
  mode: PoolMode;
  /** 0..1 — how fast things move. Deliberately slow across the whole range. */
  motion: number;
  /** 0..1 — how wide a touch's area of influence is. */
  spread: number;
  /** 0..1 — how long a gesture lingers after release. */
  persistence: number;
  /**
   * Hold: what you paint stays until Dissolve or Blackout, still drifting and
   * turning. Painting over a spot recolours it rather than piling on; a droplet
   * still ripples out but leaves its colour behind. Off, the field fades on
   * `persistence`.
   */
  hold?: boolean;
}

export const DEFAULT_POOL_SETTINGS: PoolSettings = {
  mode: 'flow',
  motion: 0.35,
  spread: 0.5,
  persistence: 0.55,
  hold: false
};

export interface PoolColor {
  hue: number;
  sat: number;
  /** 0..100 — the level a fully-stirred spot of the field reaches. */
  bright: number;
}

export interface Hsb {
  h: number;
  s: number;
  b: number;
}

interface Source {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  sat: number;
  bright: number;
  energy: number;
  /** Energy a fresh source swells toward; it never appears at full strength. */
  target: number;
  /** Gaussian radius for a blob; ring width for a ring. */
  sigma: number;
  /** Ring radius; 0 for blobs. */
  ring: number;
  kind: 'blob' | 'ring';
  /** Hue wanders a little over a source's life so long strokes shimmer. */
  hueDrift: number;
  /** A released source fades on the short clock regardless of persistence. */
  releasing: boolean;
}

/** Pointer ids are numbers in a browser; the server prefixes them per client. */
export type TouchId = number | string;

/** Just enough of a source for a client to draw the field the server is running. */
export interface SourceSnapshot {
  x: number;
  y: number;
  hue: number;
  sat: number;
  energy: number;
  sigma: number;
  ring: number;
  kind: 'blob' | 'ring';
}

export interface PoolSnapshot {
  settings: PoolSettings;
  sources: SourceSnapshot[];
  spiral: { cx: number; cy: number; omega: number };
  /** The current, CURRENT_N² cells of [u, v], row-major; empty when the water is still. */
  current: number[];
}

export { CURRENT_N };

interface Touch {
  /** Where the finger actually is. */
  tx: number;
  ty: number;
  /** Where the field thinks it is: the finger, low-passed. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: PoolColor;
  lastDepositX: number;
  lastDepositY: number;
  sinceDeposit: number;
  age: number;
}

const MAX_SOURCES = 240;
/** Fingers are low-passed on this time constant before they touch the field. */
const INPUT_TAU = 0.14;
/** Spiral centre / spin follow the gesture on these time constants. */
const SPIRAL_CENTRE_TAU = 1.6;
const SPIRAL_SPIN_TAU = 2.2;
/** A released stroke dissolves on this clock. */
const RELEASE_TAU = 0.9;
/** A new source swells in on this clock, so a tap blooms rather than pops. */
const BLOOM_TAU = 0.4;
/** A held blob never spreads wider than this, so a held field keeps its shape. */
const HOLD_MAX_SIGMA = 0.3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Fraction of the way to a target that a first-order lag covers in `dt`. */
export const lagStep = (dt: number, tau: number) => 1 - Math.exp(-dt / Math.max(1e-6, tau));

/** Persistence 0..1 → seconds a source takes to fall to 1/e. */
export function persistenceSeconds(p: number): number {
  return 1.5 * Math.pow(16, clamp(p, 0, 1));
}

/** Spread 0..1 → Gaussian radius in normalized space. */
export function spreadSigma(s: number): number {
  return lerp(0.06, 0.24, clamp(s, 0, 1));
}

/** Motion 0..1 → spiral spin in radians per second (a lap takes 20s to 2min). */
export function spiralOmega(m: number): number {
  return lerp(0.05, 0.32, clamp(m, 0, 1));
}

/** Motion 0..1 → how fast a droplet ring grows, in normalized units per second. */
export function dropletSpeed(m: number): number {
  return lerp(0.04, 0.18, clamp(m, 0, 1));
}

export class PoolField {
  settings: PoolSettings;
  private sources: Source[] = [];
  private touches = new Map<TouchId, Touch>();
  private seq = 0;
  /** Spiral state. The target is where the fingers are; the live value chases it. */
  private spiral = { cx: 0.5, cy: 0.5, omega: 0, targetCx: 0.5, targetCy: 0.5, targetOmega: 0 };
  /** Total smoothed finger speed — the field brightens a touch when it is stirred. */
  private stir = 0;
  /** How the water remembers being stirred; sources ride it. */
  private current = new Current();
  /** Bumped by reset(), so whoever smooths the output knows to drop its state too. */
  generation = 0;

  constructor(settings: PoolSettings = DEFAULT_POOL_SETTINGS) {
    this.settings = { ...settings };
  }

  get sourceCount(): number {
    return this.sources.length;
  }

  get touchCount(): number {
    return this.touches.size;
  }

  /** Where the spiral currently turns, and how fast (signed). */
  get spiralState(): { cx: number; cy: number; omega: number } {
    return { cx: this.spiral.cx, cy: this.spiral.cy, omega: this.spiral.omega };
  }

  pointerDown(id: TouchId, x: number, y: number, color: PoolColor): void {
    const px = clamp(x, 0, 1);
    const py = clamp(y, 0, 1);
    this.touches.set(id, {
      tx: px, ty: py, x: px, y: py, vx: 0, vy: 0,
      color: { ...color },
      lastDepositX: px, lastDepositY: py,
      sinceDeposit: Infinity,
      age: 0
    });
    if (this.settings.mode === 'droplets') this.drop(px, py, color);
  }

  /** A droplet: a ring that ripples out and, when holding, a puddle that stays behind. */
  private drop(x: number, y: number, color: PoolColor): void {
    this.deposit(x, y, 0, 0, color, 'ring');
    if (this.settings.hold === true) this.deposit(x, y, 0, 0, color, 'blob');
  }

  pointerMove(id: TouchId, x: number, y: number): void {
    const t = this.touches.get(id);
    if (!t) return;
    t.tx = clamp(x, 0, 1);
    t.ty = clamp(y, 0, 1);
  }

  pointerUp(id: TouchId): void {
    this.touches.delete(id);
  }

  /** Ids of the fingers currently down. */
  touchIds(): TouchId[] {
    return [...this.touches.keys()];
  }

  /** Lift every finger — pointer capture lost, tab hidden, etc. */
  releaseAll(): void {
    this.touches.clear();
  }

  /** The gentle clear: what is glowing dissolves over about a second. */
  release(): void {
    for (const s of this.sources) {
      s.releasing = true;
      s.target = 0;
    }
    this.current.release();
  }

  /** Whether the water is still moving on its own. */
  get currentActive(): boolean {
    return this.current.active;
  }

  /** Flow at a point in normalized units per second. */
  currentAt(x: number, y: number): { vx: number; vy: number } {
    return this.current.at(x, y);
  }

  /** Drop everything at once. Only for leaving the tab; the show uses release(). */
  reset(): void {
    this.generation++;
    this.sources = [];
    this.touches.clear();
    this.spiral.omega = 0;
    this.spiral.targetOmega = 0;
    this.stir = 0;
    this.current.reset();
  }

  /** Advance the field by `dt` seconds. */
  step(dt: number): void {
    if (!(dt > 0)) return;
    // A tab that was hidden for a while should not leap; treat it as a
    // sequence of ordinary frames.
    dt = Math.min(dt, 0.1);
    const { mode } = this.settings;
    const sigma = spreadSigma(this.settings.spread);

    // 1. Fingers: chase the raw position, measure velocity, deposit along the way.
    const k = lagStep(dt, INPUT_TAU);
    const currentSpeed = lerp(0.3, 1, this.settings.motion) * CURRENT_MAX_SPEED;
    let stirTarget = 0;
    let sumX = 0;
    let sumY = 0;
    let spinTarget = 0;
    for (const t of this.touches.values()) {
      const nx = t.x + (t.tx - t.x) * k;
      const ny = t.y + (t.ty - t.y) * k;
      const vx = (nx - t.x) / dt;
      const vy = (ny - t.y) / dt;
      t.vx = lerp(t.vx, vx, k);
      t.vy = lerp(t.vy, vy, k);
      t.x = nx;
      t.y = ny;
      t.age += dt;
      t.sinceDeposit += dt;
      stirTarget += Math.hypot(t.vx, t.vy);
      // Every drag stirs the water, whatever it deposits.
      this.current.push(t.x, t.y, t.vx, t.vy, sigma * 1.5, dt, currentSpeed);
      sumX += t.x;
      sumY += t.y;

      if (mode === 'droplets') {
        // A ring per beat of the drag, never a hose: at most one every 0.35s
        // and only once the finger has moved a real distance.
        const moved = Math.hypot(t.x - t.lastDepositX, t.y - t.lastDepositY);
        if (t.sinceDeposit > 0.35 && moved > sigma * 0.8) {
          this.drop(t.x, t.y, t.color);
          t.lastDepositX = t.x;
          t.lastDepositY = t.y;
          t.sinceDeposit = 0;
        }
      } else {
        const moved = Math.hypot(t.x - t.lastDepositX, t.y - t.lastDepositY);
        // Holding still keeps feeding the spot, slowly; moving lays a trail.
        if (moved > sigma * 0.35 || t.sinceDeposit > 0.25) {
          const drift = this.settings.motion * 0.12;
          this.deposit(t.x, t.y, t.vx * drift, t.vy * drift, t.color, 'blob');
          t.lastDepositX = t.x;
          t.lastDepositY = t.y;
          t.sinceDeposit = 0;
        }
        if (mode === 'spiral') {
          // Which way the finger goes round the (current) centre decides the
          // direction of spin. Summed over every finger, so two hands agree
          // or cancel rather than fight.
          const rx = t.x - this.spiral.cx;
          const ry = t.y - this.spiral.cy;
          const r = Math.hypot(rx, ry);
          if (r > 0.02) spinTarget += (rx * t.vy - ry * t.vx) / r;
        }
      }
    }
    this.stir = lerp(this.stir, stirTarget, lagStep(dt, 0.5));
    this.current.step(dt);

    // 2. Spiral: centre is the fingers' centroid, spin follows their circling.
    if (mode === 'spiral') {
      const n = this.touches.size;
      if (n > 0) {
        this.spiral.targetCx = sumX / n;
        this.spiral.targetCy = sumY / n;
        const omega = spiralOmega(this.settings.motion);
        // Only a clear circling gesture changes direction; a drag across the
        // centre leaves the spin as it was.
        if (Math.abs(spinTarget) > 0.15) this.spiral.targetOmega = Math.sign(spinTarget) * omega;
        else if (this.spiral.targetOmega === 0) this.spiral.targetOmega = omega;
      } else if (this.spiral.targetOmega !== 0) {
        // Hands off: keep turning at the set speed, in the set direction.
        this.spiral.targetOmega = Math.sign(this.spiral.targetOmega) * spiralOmega(this.settings.motion);
      }
      const kc = lagStep(dt, SPIRAL_CENTRE_TAU);
      this.spiral.cx += (this.spiral.targetCx - this.spiral.cx) * kc;
      this.spiral.cy += (this.spiral.targetCy - this.spiral.cy) * kc;
      this.spiral.omega += (this.spiral.targetOmega - this.spiral.omega) * lagStep(dt, SPIRAL_SPIN_TAU);
    } else {
      this.spiral.omega += (0 - this.spiral.omega) * lagStep(dt, SPIRAL_SPIN_TAU);
    }

    // 3. Sources: drift, spread, turn, dissolve.
    const hold = this.settings.hold === true;
    const tau = persistenceSeconds(this.settings.persistence);
    const decay = hold ? 1 : Math.exp(-dt / tau);
    const releaseDecay = Math.exp(-dt / RELEASE_TAU);
    const diffusion = lerp(0.004, 0.02, this.settings.motion);
    const dragK = lagStep(dt, 1.5);
    const { cx, cy, omega } = this.spiral;
    const turn = omega * dt;
    const cosT = Math.cos(turn);
    const sinT = Math.sin(turn);
    // Spiral, not carousel: sources ease inward as they turn, so the arms
    // wind toward the centre and the centre cannon gets its due.
    const inward = Math.abs(omega) > 1e-4 ? Math.exp(-dt * Math.abs(omega) * 0.12) : 1;
    const ringGrow = dropletSpeed(this.settings.motion) * dt;

    const bloom = lagStep(dt, BLOOM_TAU);
    for (const s of this.sources) {
      if (s.target > 0) {
        s.energy += (s.target - s.energy) * bloom;
        s.target *= s.releasing ? releaseDecay : decay;
        if (s.target - s.energy < 0.005) s.target = 0;
      } else {
        s.energy *= s.releasing ? releaseDecay : decay;
      }
      if (!hold) s.hue = (s.hue + s.hueDrift * dt + 360) % 360;
      if (s.kind === 'ring') {
        s.ring += ringGrow;
        // A ring thins as it widens so the total light stays about the same.
        s.energy *= Math.exp(-ringGrow * 2.5);
        continue;
      }
      const c = this.current.at(s.x, s.y);
      s.x = clamp(s.x + (s.vx + c.vx) * dt, -0.05, 1.05);
      s.y = clamp(s.y + (s.vy + c.vy) * dt, -0.05, 1.05);
      s.vx -= s.vx * dragK;
      s.vy -= s.vy * dragK;
      s.sigma += diffusion * dt;
      if (hold && s.sigma > HOLD_MAX_SIGMA) s.sigma = HOLD_MAX_SIGMA;
      if (Math.abs(turn) > 1e-7) {
        const rx = (s.x - cx) * inward;
        const ry = (s.y - cy) * inward;
        s.x = cx + rx * cosT - ry * sinT;
        s.y = cy + rx * sinT + ry * cosT;
      }
    }

    this.sources = this.sources.filter((s) => (s.energy > 0.004 || s.target > 0.004) && (s.kind === 'blob' || s.ring < 1.6));
  }

  /** The field at a point: brightness from local energy, colour from the mix. */
  sampleAt(x: number, y: number): Hsb {
    let energy = 0;
    let hx = 0;
    let hy = 0;
    let sat = 0;
    let bright = 0;
    for (const s of this.sources) {
      if (s.energy < 1e-5) continue;
      const dx = x - s.x;
      const dy = y - s.y;
      const reach = s.ring + 3.2 * s.sigma;
      if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
      const d = Math.hypot(dx, dy);
      const u = s.kind === 'ring' ? (d - s.ring) / s.sigma : d / s.sigma;
      if (u > 3.2) continue;
      const w = s.energy * Math.exp(-0.5 * u * u);
      if (w < 1e-5) continue;
      energy += w;
      const a = (s.hue * Math.PI) / 180;
      hx += Math.cos(a) * w;
      hy += Math.sin(a) * w;
      sat += s.sat * w;
      bright += s.bright * w;
    }
    if (energy < 0.004) return { h: 0, s: 0, b: 0 };
    // Soft knee: one touch reads clearly, ten touches do not blow out.
    const level = 1 - Math.exp(-energy * 1.6);
    const h = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
    // Blending far-apart hues drives the vector short; that reads as a paler
    // mix, which is what two colours meeting in water should look like.
    const agreement = Math.hypot(hx, hy) / energy;
    return {
      h,
      s: clamp((sat / energy) * lerp(0.55, 1, agreement), 0, 100),
      b: clamp(level * (bright / energy) * (1 + Math.min(0.25, this.stir * 0.3)), 0, 100)
    };
  }

  /** Sample every configured cannon. */
  sampleAll(points: readonly { x: number; y: number }[]): Hsb[] {
    return points.map((p) => this.sampleAt(p.x, p.y));
  }

  /** The sources, read-only, for drawing the field itself. */
  forEachSource(fn: (s: Readonly<Source>) => void): void {
    for (const s of this.sources) fn(s);
  }

  /** Compact state for broadcasting to viewers; faint sources are dropped. */
  snapshot(): PoolSnapshot {
    const sources: SourceSnapshot[] = [];
    for (const s of this.sources) {
      if (s.energy < 0.004) continue;
      sources.push({
        x: round3(s.x), y: round3(s.y),
        hue: Math.round(s.hue), sat: Math.round(s.sat),
        energy: round3(s.energy), sigma: round3(s.sigma), ring: round3(s.ring),
        kind: s.kind
      });
    }
    return { settings: { ...this.settings }, sources, spiral: this.spiralState, current: this.current.snapshot() };
  }

  private deposit(x: number, y: number, vx: number, vy: number, color: PoolColor, kind: Source['kind']): void {
    const sigma = spreadSigma(this.settings.spread);
    if (this.settings.hold === true && kind === 'blob') {
      // Paint over what is there: a held blob under the finger takes the new
      // colour and is topped up, so the field never fills up with layers.
      let nearest: Source | null = null;
      let best = sigma * 0.6;
      for (const s of this.sources) {
        if (s.kind !== 'blob' || s.releasing) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < best) {
          best = d;
          nearest = s;
        }
      }
      if (nearest) {
        nearest.hue = color.hue;
        nearest.sat = color.sat;
        nearest.bright = color.bright;
        nearest.target = Math.max(nearest.target, 0.55);
        nearest.vx = vx;
        nearest.vy = vy;
        return;
      }
    }
    this.seq++;
    this.sources.push({
      x, y, vx, vy,
      hue: color.hue,
      sat: color.sat,
      bright: color.bright,
      energy: 0,
      target: kind === 'ring' ? 0.9 : 0.55,
      sigma: kind === 'ring' ? sigma * 0.5 : sigma,
      ring: 0,
      kind,
      hueDrift: (this.seq % 2 === 0 ? 1 : -1) * lerp(1.5, 6, this.settings.motion),
      releasing: false
    });
    if (this.sources.length > MAX_SOURCES) {
      // Lose the faintest, never the newest.
      let weakest = 0;
      for (let i = 1; i < this.sources.length - 1; i++) {
        if (this.sources[i].energy < this.sources[weakest].energy) weakest = i;
      }
      this.sources.splice(weakest, 1);
    }
  }
}

/**
 * Normalized positions for every cannon, in the same 0..1 square the field
 * uses. Layouts with fixtures use them (rings render as rings); a bare grid
 * is spaced evenly. Mirrors GridDisplay's placement so the pool's markers sit
 * where the paint tab's orbs do.
 */
export function cannonPoints(
  count: number,
  columns: number,
  fixtures?: readonly { u: number; v: number }[]
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  if (fixtures && fixtures.length >= count && count > 0) {
    let minD = Infinity;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const d = Math.hypot(fixtures[i].u - fixtures[j].u, fixtures[i].v - fixtures[j].v);
        if (d > 1e-6 && d < minD) minD = d;
      }
    }
    if (!Number.isFinite(minD) || minD <= 0) minD = 1 / Math.max(1, Math.sqrt(count));
    const margin = minD * 0.5;
    const inner = Math.max(0, 1 - 2 * margin);
    for (let i = 0; i < count; i++) {
      points.push({ x: margin + fixtures[i].u * inner, y: margin + fixtures[i].v * inner });
    }
    return points;
  }
  const cols = columns > 0 ? columns : count;
  const rows = Math.ceil(count / cols);
  const cell = 1 / Math.max(cols, rows);
  for (let i = 0; i < count; i++) {
    points.push({ x: (i % cols) * cell + cell / 2, y: Math.floor(i / cols) * cell + cell / 2 });
  }
  return points;
}

/**
 * Per-cannon output smoothing on top of the receiver's own low-pass filter, so
 * even the 15Hz samples we send already glide. Hue is chased the short way
 * round the wheel; a cannon coming up out of black takes the new hue at once
 * rather than sweeping through the spectrum to reach it.
 */
export class OutputSmoother {
  private state: Hsb[];

  constructor(count: number, private tau = 0.3) {
    this.state = Array.from({ length: count }, () => ({ h: 0, s: 0, b: 0 }));
  }

  resize(count: number): void {
    if (this.state.length === count) return;
    this.state = Array.from({ length: count }, (_, i) => this.state[i] ?? { h: 0, s: 0, b: 0 });
  }

  /** Snap everything to black — after a blackout nothing may glide back up. */
  reset(): void {
    for (const c of this.state) {
      c.h = 0;
      c.s = 0;
      c.b = 0;
    }
  }

  step(targets: readonly Hsb[], dt: number): Hsb[] {
    const k = lagStep(dt, this.tau);
    for (let i = 0; i < this.state.length; i++) {
      const cur = this.state[i];
      const tgt = targets[i] ?? { h: 0, s: 0, b: 0 };
      if (cur.b < 1 && tgt.b > 0) {
        cur.h = tgt.h;
        cur.s = tgt.s;
      } else if (tgt.b > 0) {
        let dh = tgt.h - cur.h;
        if (dh > 180) dh -= 360;
        if (dh < -180) dh += 360;
        cur.h = (cur.h + dh * k + 360) % 360;
        cur.s += (tgt.s - cur.s) * k;
      }
      cur.b += (tgt.b - cur.b) * k;
      if (cur.b < 0.05) cur.b = 0;
    }
    return this.state;
  }

  get values(): readonly Hsb[] {
    return this.state;
  }
}

/** What the wire sees: integers, and only when a cannon has actually changed. */
export function quantize(c: Hsb): Hsb {
  return { h: Math.round(c.h) % 360, s: Math.round(c.s), b: Math.round(c.b) };
}

export function sameHsb(a: Hsb, b: Hsb): boolean {
  return a.h === b.h && a.s === b.s && a.b === b.b;
}
