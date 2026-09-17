/**
 * The current: the water's memory of how it was stirred.
 *
 * A coarse velocity grid over the 0..1 square. Fingers push on it as they
 * drag; the light sources are carried by it afterwards. A tiny pressure solve
 * keeps the flow incompressible, which is what turns a push into a swirl —
 * pull one side of the pool and the other side comes round to fill the gap —
 * instead of shoving everything into a corner. It diffuses so neighbouring
 * pushes agree, and it decays over minutes, so the pool keeps moving long
 * after the hands are gone and eventually comes to rest.
 */

export const CURRENT_N = 16;
/** Current speeds are capped here (normalized units per second): a lap of the pool takes tens of seconds. */
export const CURRENT_MAX_SPEED = 0.08;
/** How long a swirl takes to fall to 1/e with nobody touching it. */
const CURRENT_TAU = 90;
/** How fast neighbouring cells pull each other's flow into agreement. */
const CURRENT_DIFFUSION = 0.6;
const PROJECT_ITERATIONS = 10;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export class Current {
  readonly n = CURRENT_N;
  private u = new Float32Array(CURRENT_N * CURRENT_N);
  private v = new Float32Array(CURRENT_N * CURRENT_N);
  private scratch = new Float32Array(CURRENT_N * CURRENT_N);
  private pressure = new Float32Array(CURRENT_N * CURRENT_N);
  private divergence = new Float32Array(CURRENT_N * CURRENT_N);
  /** Time constant the flow currently dies on; release() shortens it. */
  private tau = CURRENT_TAU;
  private dirty = false;

  /** Push the water near (x, y) toward moving at (vx, vy). `radius` in normalized units. */
  push(x: number, y: number, vx: number, vy: number, radius: number, dt: number, maxSpeed = CURRENT_MAX_SPEED): void {
    const speed = Math.hypot(vx, vy);
    if (speed < 1e-6) return;
    // A finger moves far faster than the water ever should: aim the current
    // along the finger, at a slow fraction of its speed, capped.
    const want = Math.min(maxSpeed, speed * 0.35);
    const tx = (vx / speed) * want;
    const ty = (vy / speed) * want;
    const n = this.n;
    const r2 = radius * radius;
    const gain = 1 - Math.exp(-dt / 0.25);
    const i0 = clamp(Math.floor((x - radius) * n), 0, n - 1);
    const i1 = clamp(Math.ceil((x + radius) * n), 0, n - 1);
    const j0 = clamp(Math.floor((y - radius) * n), 0, n - 1);
    const j1 = clamp(Math.ceil((y + radius) * n), 0, n - 1);
    for (let j = j0; j <= j1; j++) {
      const cy = (j + 0.5) / n;
      for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) / n;
        const d2 = (cx - x) * (cx - x) + (cy - y) * (cy - y);
        if (d2 > r2 * 4) continue;
        const w = Math.exp((-0.5 * d2) / r2) * gain;
        const k = j * n + i;
        this.u[k] += (tx - this.u[k]) * w;
        this.v[k] += (ty - this.v[k]) * w;
      }
    }
    this.tau = CURRENT_TAU;
    this.dirty = true;
  }

  /** Advance: diffuse, keep incompressible, decay. */
  step(dt: number): void {
    if (!this.dirty) return;
    const n = this.n;
    const { u, v, scratch } = this;

    // Diffuse: each cell eases toward the mean of its neighbours.
    const a = Math.min(0.24, CURRENT_DIFFUSION * dt);
    for (const f of [u, v]) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const k = j * n + i;
          const l = f[j * n + Math.max(0, i - 1)];
          const r = f[j * n + Math.min(n - 1, i + 1)];
          const up = f[Math.max(0, j - 1) * n + i];
          const dn = f[Math.min(n - 1, j + 1) * n + i];
          scratch[k] = f[k] + a * ((l + r + up + dn) * 0.25 - f[k]);
        }
      }
      f.set(scratch);
    }

    this.walls();
    this.project();

    // Decay, and notice when the water has come to rest.
    const decay = Math.exp(-dt / this.tau);
    let energy = 0;
    for (let k = 0; k < u.length; k++) {
      u[k] *= decay;
      v[k] *= decay;
      energy += u[k] * u[k] + v[k] * v[k];
    }
    if (energy < 1e-7) {
      u.fill(0);
      v.fill(0);
      this.dirty = false;
    }
  }

  /** Flow at a point, bilinear. */
  at(x: number, y: number): { vx: number; vy: number } {
    if (!this.dirty) return { vx: 0, vy: 0 };
    const n = this.n;
    const fx = clamp(x * n - 0.5, 0, n - 1);
    const fy = clamp(y * n - 0.5, 0, n - 1);
    const i = Math.min(n - 2, Math.floor(fx));
    const j = Math.min(n - 2, Math.floor(fy));
    const sx = fx - i;
    const sy = fy - j;
    const k00 = j * n + i;
    const k10 = k00 + 1;
    const k01 = k00 + n;
    const k11 = k01 + 1;
    const lerp2 = (f: Float32Array) =>
      (f[k00] * (1 - sx) + f[k10] * sx) * (1 - sy) + (f[k01] * (1 - sx) + f[k11] * sx) * sy;
    return { vx: lerp2(this.u), vy: lerp2(this.v) };
  }

  /** Still water. */
  get active(): boolean {
    return this.dirty;
  }

  /** Let the swirl die over a few seconds rather than minutes. */
  release(): void {
    this.tau = 2.5;
  }

  reset(): void {
    this.u.fill(0);
    this.v.fill(0);
    this.tau = CURRENT_TAU;
    this.dirty = false;
  }

  /** Interleaved [u, v] per cell, row-major, rounded for the wire; empty when still. */
  snapshot(): number[] {
    if (!this.dirty) return [];
    const out: number[] = new Array(this.u.length * 2);
    for (let k = 0; k < this.u.length; k++) {
      out[2 * k] = round3(this.u[k]);
      out[2 * k + 1] = round3(this.v[k]);
    }
    return out;
  }

  /** Nothing flows through the edge of the pool. */
  private walls(): void {
    const n = this.n;
    for (let j = 0; j < n; j++) {
      this.u[j * n] = 0;
      this.u[j * n + n - 1] = 0;
    }
    for (let i = 0; i < n; i++) {
      this.v[i] = 0;
      this.v[(n - 1) * n + i] = 0;
    }
  }

  /** Remove divergence: a few Gauss–Seidel sweeps for pressure, then subtract its gradient. */
  private project(): void {
    const n = this.n;
    const { u, v, pressure: p, divergence: div } = this;
    const idx = (i: number, j: number) => clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        div[j * n + i] = 0.5 * (u[idx(i + 1, j)] - u[idx(i - 1, j)] + v[idx(i, j + 1)] - v[idx(i, j - 1)]);
      }
    }
    p.fill(0);
    for (let it = 0; it < PROJECT_ITERATIONS; it++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          p[j * n + i] = (p[idx(i - 1, j)] + p[idx(i + 1, j)] + p[idx(i, j - 1)] + p[idx(i, j + 1)] - div[j * n + i]) * 0.25;
        }
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        u[j * n + i] -= 0.5 * (p[idx(i + 1, j)] - p[idx(i - 1, j)]);
        v[j * n + i] -= 0.5 * (p[idx(i, j + 1)] - p[idx(i, j - 1)]);
      }
    }
    this.walls();
  }
}
