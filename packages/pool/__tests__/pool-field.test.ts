import { presets } from '@wavegrid/layout/client';

import {
  cannonPoints,
  CURRENT_N,
  ROTATE_LAP_SECONDS,
  DEFAULT_POOL_SETTINGS,
  type Hsb,
  OutputSmoother,
  PoolField,
  quantize,
  spiralOmega
} from '../src/pool-field';

const COLOR = { hue: 200, sat: 85, bright: 100 };
const DT = 1 / 60;

const grace = presets['grace-cathedral']();
const gracePoints = cannonPoints(grace.fixtures.length, 0, grace.fixtures);

/** Run the field for `seconds`, sampling the cannons every frame. */
function run(field: PoolField, seconds: number, each?: (out: Hsb[], t: number) => void): Hsb[] {
  let out: Hsb[] = [];
  for (let t = 0; t < seconds; t += DT) {
    field.step(DT);
    out = field.sampleAll(gracePoints);
    each?.(out, t);
  }
  return out;
}

const maxB = (out: readonly Hsb[]) => Math.max(...out.map((c) => c.b));
const total = (out: Hsb[]) => out.reduce((a, c) => a + c.b, 0);

describe('cannonPoints', () => {
  it('places the Grace layout as two rings and a centre, in 0..1', () => {
    expect(gracePoints).toHaveLength(25);
    for (const p of gracePoints) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
    const centre = gracePoints[24];
    expect(centre.x).toBeCloseTo(0.5, 5);
    expect(centre.y).toBeCloseTo(0.5, 5);
    const radii = gracePoints.slice(0, 24).map((p) => Math.hypot(p.x - 0.5, p.y - 0.5));
    const outer = radii.slice(0, 12);
    const inner = radii.slice(12, 24);
    for (const r of outer) expect(r).toBeCloseTo(outer[0], 5);
    for (const r of inner) expect(r).toBeCloseTo(inner[0], 5);
    expect(inner[0] / outer[0]).toBeCloseTo(0.62, 2);
  });

  it('falls back to an even grid without fixtures', () => {
    const pts = cannonPoints(49, 7);
    expect(pts).toHaveLength(49);
    expect(pts[0]).toEqual({ x: 1 / 14, y: 1 / 14 });
    expect(pts[48].x).toBeCloseTo(13 / 14);
    expect(pts[48].y).toBeCloseTo(13 / 14);
  });
});

describe('PoolField', () => {
  it('a touch lights the cannons nearest it, not the far side of the room', () => {
    const field = new PoolField();
    const centre = gracePoints[24];
    field.pointerDown(1, centre.x, centre.y, COLOR);
    const out = run(field, 1);
    expect(out[24].b).toBeGreaterThan(50);
    // Hue shimmers a few degrees over a source's life, never further.
    expect(Math.abs(out[24].h - 200)).toBeLessThan(12);
    // The outer ring sits ~0.4 away — beyond a default-spread brush.
    expect(out[0].b).toBeLessThan(out[24].b * 0.2);
  });

  it('an erratic finger still produces smooth output: per-frame change stays small', () => {
    const field = new PoolField();
    const smoother = new OutputSmoother(gracePoints.length);
    field.pointerDown(1, 0.2, 0.2, COLOR);
    let prev = smoother.step(field.sampleAll(gracePoints), DT).map((c) => ({ ...c }));
    let worstSent = 0;
    // Erratic finger: teleport across the canvas every frame.
    run(field, 3, (out, t) => {
      const jitter = Math.floor(t / DT) % 2 === 0 ? 0.2 : 0.8;
      field.pointerMove(1, jitter, jitter);
      const sent = smoother.step(out, DT);
      for (let i = 0; i < out.length; i++) {
        worstSent = Math.max(worstSent, Math.abs(sent[i].b - prev[i].b));
        prev[i] = { ...sent[i] };
      }
    });
    // What goes to the wire never moves more than a few percent per frame.
    expect(worstSent).toBeLessThan(4);
    expect(maxB(field.sampleAll(gracePoints))).toBeGreaterThan(0);
  });

  it('releasing fades gradually and eventually to black', () => {
    const field = new PoolField({ ...DEFAULT_POOL_SETTINGS, persistence: 0.3 });
    field.pointerDown(1, 0.5, 0.5, COLOR);
    run(field, 1.5);
    field.pointerUp(1);
    const atRelease = maxB(field.sampleAll(gracePoints));
    expect(atRelease).toBeGreaterThan(40);
    const after1 = maxB(run(field, 1));
    // Still clearly lit a second later: no snap to black.
    expect(after1).toBeGreaterThan(atRelease * 0.5);
    expect(after1).toBeLessThan(atRelease);
    const after30 = maxB(run(field, 30));
    expect(after30).toBeLessThan(1);
  });

  it('hold keeps a released stroke lit until release(), then it dissolves', () => {
    const field = new PoolField({ ...DEFAULT_POOL_SETTINGS, hold: true, persistence: 0 });
    field.pointerDown(1, 0.5, 0.5, COLOR);
    run(field, 1.5);
    field.pointerUp(1);
    const atRelease = maxB(field.sampleAll(gracePoints));
    expect(atRelease).toBeGreaterThan(40);
    const after30 = maxB(run(field, 30));
    expect(after30).toBeGreaterThan(atRelease * 0.9);
    expect(field.sampleAll(gracePoints)[24].h).toBeCloseTo(COLOR.hue, 0);
    field.release();
    expect(maxB(run(field, 6))).toBeLessThan(1);
  });

  it('hold: painting over a spot recolours it instead of piling up sources', () => {
    const field = new PoolField({ ...DEFAULT_POOL_SETTINGS, hold: true });
    field.pointerDown(1, 0.5, 0.5, COLOR);
    run(field, 2);
    field.pointerUp(1);
    const before = field.sourceCount;
    field.pointerDown(2, 0.5, 0.5, { hue: 20, sat: 90, bright: 100 });
    run(field, 2);
    field.pointerUp(2);
    expect(field.sourceCount).toBe(before);
    const centre = run(field, 2)[24];
    expect(centre.b).toBeGreaterThan(40);
    expect(Math.abs(centre.h - 20)).toBeLessThan(10);
  });

  it('hold + droplets: the ripple passes but leaves its colour at the touch', () => {
    const held = new PoolField({ ...DEFAULT_POOL_SETTINGS, mode: 'droplets', hold: true, persistence: 0 });
    const fading = new PoolField({ ...DEFAULT_POOL_SETTINGS, mode: 'droplets', hold: false, persistence: 0 });
    for (const f of [held, fading]) {
      f.pointerDown(1, 0.5, 0.5, COLOR);
      f.step(DT);
      f.pointerUp(1);
    }
    // Long after the ring has rippled off the edge.
    const heldCentre = run(held, 40)[24];
    const fadingCentre = run(fading, 40)[24];
    expect(fadingCentre.b).toBeLessThan(1);
    expect(heldCentre.b).toBeGreaterThan(20);
    expect(heldCentre.h).toBeCloseTo(COLOR.hue, 0);
    expect(held.sourceCount).toBe(1);
  });

  it('brightness is monotonic-ish on release: no flicker back up', () => {
    const field = new PoolField();
    field.pointerDown(1, 0.5, 0.5, COLOR);
    run(field, 1);
    field.pointerUp(1);
    // The last deposit is allowed to finish blooming, then it is downhill only.
    run(field, 0.6);
    let prev = total(field.sampleAll(gracePoints));
    run(field, 8, (out) => {
      const now = total(out);
      expect(now).toBeLessThanOrEqual(prev + 2);
      prev = now;
    });
  });

  it('two touches blend: the hue between them is a mix, and the sum does not blow out', () => {
    const field = new PoolField({ ...DEFAULT_POOL_SETTINGS, spread: 0.8 });
    field.pointerDown(1, 0.3, 0.5, { hue: 0, sat: 90, bright: 100 });
    field.pointerDown(2, 0.7, 0.5, { hue: 120, sat: 90, bright: 100 });
    run(field, 2);
    const mid = field.sampleAt(0.5, 0.5);
    expect(mid.b).toBeGreaterThan(10);
    expect(mid.b).toBeLessThanOrEqual(100);
    expect(mid.h).toBeGreaterThan(30);
    expect(mid.h).toBeLessThan(90);
    // Far-apart hues read paler where they meet.
    expect(mid.s).toBeLessThan(90);
  });

  it('adding a second finger does not jump the existing output', () => {
    const field = new PoolField();
    field.pointerDown(1, 0.5, 0.5, COLOR);
    run(field, 2);
    const before = field.sampleAll(gracePoints);
    field.pointerDown(2, 0.5, 0.75, { hue: 300, sat: 90, bright: 100 });
    field.step(DT);
    const after = field.sampleAll(gracePoints);
    for (let i = 0; i < before.length; i++) {
      expect(Math.abs(after[i].b - before[i].b)).toBeLessThan(6);
    }
  });

  it('spiral turns slowly and continuously, and the centre follows the finger without a jump', () => {
    const field = new PoolField({ ...DEFAULT_POOL_SETTINGS, mode: 'spiral', motion: 0.5 });
    field.pointerDown(1, 0.5, 0.25, COLOR);
    run(field, 2);
    field.pointerUp(1);
    // A lap must take well over ten seconds at any motion setting.
    expect(spiralOmega(1)).toBeLessThan((2 * Math.PI) / 15);
    expect(Math.abs(field.spiralState.omega)).toBeGreaterThan(0.01);
    // The lit source orbits: its angle about the centre advances a bit each frame, never leaps.
    let prevAng: number | null = null;
    let steps = 0;
    run(field, 4, () => {
      let bestE = 0;
      let ang = 0;
      field.forEachSource((s) => {
        if (s.energy > bestE) {
          bestE = s.energy;
          ang = Math.atan2(s.y - 0.5, s.x - 0.5);
        }
      });
      if (prevAng !== null) {
        let d = ang - prevAng;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        expect(Math.abs(d)).toBeLessThan(0.02);
        steps++;
      }
      prevAng = ang;
    });
    expect(steps).toBeGreaterThan(100);

    // New finger far away: the centre eases over, it does not snap.
    field.pointerDown(2, 0.9, 0.9, COLOR);
    const c0 = field.spiralState;
    field.step(DT);
    const c1 = field.spiralState;
    expect(Math.hypot(c1.cx - c0.cx, c1.cy - c0.cy)).toBeLessThan(0.01);
    run(field, 6);
    expect(field.spiralState.cx).toBeGreaterThan(0.75);
  });

  it('droplets: a tap makes a ring that widens over seconds, then thins away', () => {
    const field = new PoolField({ ...DEFAULT_POOL_SETTINGS, mode: 'droplets', motion: 0.5 });
    field.pointerDown(1, 0.5, 0.5, COLOR);
    field.pointerUp(1);
    run(field, 0.5);
    const early = field.sampleAll(gracePoints);
    expect(early[24].b).toBeGreaterThan(early[0].b);
    // A couple of seconds on, the ring has reached the inner ring of cannons.
    run(field, 2);
    const mid = field.sampleAll(gracePoints);
    expect(mid[12].b).toBeGreaterThan(mid[24].b);
    const late = run(field, 30);
    expect(maxB(late)).toBeLessThan(1);
  });

  it('release() dissolves everything within a few seconds; reset() is instant', () => {
    const a = new PoolField({ ...DEFAULT_POOL_SETTINGS, persistence: 1 });
    a.pointerDown(1, 0.5, 0.5, COLOR);
    run(a, 1);
    a.pointerUp(1);
    a.release();
    expect(maxB(run(a, 0.5))).toBeGreaterThan(5);
    expect(maxB(run(a, 6))).toBeLessThan(1);

    const b = new PoolField();
    const smoother = new OutputSmoother(gracePoints.length);
    b.pointerDown(1, 0.5, 0.5, COLOR);
    run(b, 1, (out) => smoother.step(out, DT));
    expect(maxB(smoother.values)).toBeGreaterThan(5);
    const gen = b.generation;
    b.reset();
    expect(b.generation).toBe(gen + 1);
    expect(b.sourceCount).toBe(0);
    expect(b.touchCount).toBe(0);
    expect(maxB(b.sampleAll(gracePoints))).toBe(0);
    // A blackout must not glide back up out of the output smoother either.
    smoother.reset();
    smoother.step(b.sampleAll(gracePoints), DT);
    expect(maxB(smoother.values)).toBe(0);
  });

  it('is frame-rate independent: 30fps and 120fps land in the same place', () => {
    const sim = (dt: number) => {
      const f = new PoolField({ ...DEFAULT_POOL_SETTINGS, mode: 'spiral' });
      f.pointerDown(1, 0.7, 0.5, COLOR);
      for (let t = 0; t < 1; t += dt) {
        f.pointerMove(1, 0.7 + 0.1 * Math.sin(t * 3), 0.5 + 0.1 * Math.cos(t * 3));
        f.step(dt);
      }
      f.pointerUp(1);
      for (let t = 0; t < 4; t += dt) f.step(dt);
      return f.sampleAll(gracePoints);
    };
    const slow = sim(1 / 30);
    const fast = sim(1 / 120);
    for (let i = 0; i < slow.length; i++) {
      expect(Math.abs(slow[i].b - fast[i].b)).toBeLessThan(12);
    }
  });
});

describe('OutputSmoother', () => {
  it('chases the target and takes a new hue directly when coming out of black', () => {
    const s = new OutputSmoother(1, 0.3);
    s.step([{ h: 300, s: 80, b: 60 }], DT);
    const v = s.values[0];
    expect(v.h).toBe(300);
    expect(v.b).toBeGreaterThan(0);
    expect(v.b).toBeLessThan(10);
    for (let i = 0; i < 120; i++) s.step([{ h: 300, s: 80, b: 60 }], DT);
    expect(s.values[0].b).toBeGreaterThan(55);
  });

  it('turns hue the short way round the wheel', () => {
    const s = new OutputSmoother(1, 0.3);
    for (let i = 0; i < 200; i++) s.step([{ h: 350, s: 80, b: 60 }], DT);
    s.step([{ h: 10, s: 80, b: 60 }], DT);
    const h = s.values[0].h;
    expect(h > 350 || h < 10).toBe(true);
  });

  it('quantize gives wire-ready integers', () => {
    expect(quantize({ h: 359.6, s: 49.5, b: 0.4 })).toEqual({ h: 0, s: 50, b: 0 });
  });
});

describe('the current', () => {
  /** Drag a finger round the centre for `seconds`. */
  function circle(field: PoolField, seconds: number, radius = 0.3) {
    field.pointerDown(1, 0.5 + radius, 0.5, COLOR);
    for (let t = 0; t < seconds; t += DT) {
      const a = t * 2;
      field.pointerMove(1, 0.5 + radius * Math.cos(a), 0.5 + radius * Math.sin(a));
      field.step(DT);
    }
    field.pointerUp(1);
  }
  const angleOfFirst = (field: PoolField) => {
    let first: { x: number; y: number } | null = null;
    field.forEachSource((s) => {
      if (!first) first = { x: s.x, y: s.y };
    });
    return first ? Math.atan2(first!.y - 0.5, first!.x - 0.5) : NaN;
  };

  it('a circling drag leaves a slow swirl that keeps carrying the light after release', () => {
    const field = new PoolField({ ...DEFAULT_POOL_SETTINGS, hold: true });
    circle(field, 3);
    expect(field.currentActive).toBe(true);
    const c = field.currentAt(0.8, 0.5);
    // Anticlockwise drag (in screen coords) → the water at the right moves down-screen.
    expect(c.vy).toBeGreaterThan(0.005);
    expect(Math.hypot(c.vx, c.vy)).toBeLessThan(0.1);
    const a0 = angleOfFirst(field);
    run(field, 20);
    const turned = ((angleOfFirst(field) - a0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    // Carried round, slowly: a clear fraction of a lap in 20s, not a whole one.
    expect(turned).toBeGreaterThan(0.4);
    expect(turned).toBeLessThan(Math.PI);
    expect(maxB(field.sampleAll(gracePoints))).toBeGreaterThan(20);
  });

  it('the water settles over minutes on its own and within seconds on release()', () => {
    const slow = new PoolField();
    circle(slow, 3);
    const s0 = Math.hypot(slow.currentAt(0.8, 0.5).vx, slow.currentAt(0.8, 0.5).vy);
    run(slow, 30);
    const s30 = Math.hypot(slow.currentAt(0.8, 0.5).vx, slow.currentAt(0.8, 0.5).vy);
    expect(s30).toBeLessThan(s0);
    expect(s30).toBeGreaterThan(s0 * 0.25);

    const released = new PoolField();
    circle(released, 3);
    released.release();
    run(released, 12);
    const c = released.currentAt(0.8, 0.5);
    expect(Math.hypot(c.vx, c.vy)).toBeLessThan(s0 * 0.02);
  });

  it('reset() stills the water at once; a still pool sends no current', () => {
    const field = new PoolField();
    expect(field.snapshot().current).toEqual([]);
    circle(field, 2);
    expect(field.snapshot().current.length).toBe(CURRENT_N * CURRENT_N * 2);
    field.reset();
    expect(field.currentActive).toBe(false);
    expect(field.currentAt(0.8, 0.5)).toEqual({ vx: 0, vy: 0 });
  });

  it('sources carried by the current stay inside the pool', () => {
    const field = new PoolField({ ...DEFAULT_POOL_SETTINGS, hold: true, motion: 1 });
    field.pointerDown(1, 0.1, 0.5, COLOR);
    for (let t = 0; t < 2; t += DT) {
      field.pointerMove(1, 0.1 + t * 0.4, 0.5);
      field.step(DT);
    }
    field.pointerUp(1);
    run(field, 30);
    field.forEachSource((s) => {
      expect(s.x).toBeGreaterThanOrEqual(-0.05);
      expect(s.x).toBeLessThanOrEqual(1.05);
    });
  });
});

describe('rotate', () => {
  const posOfFirst = (field: PoolField) => {
    let first: { x: number; y: number } | null = null;
    field.forEachSource((s) => {
      if (!first) first = { x: s.x, y: s.y };
    });
    return first!;
  };

  it('turns a held spot about the centre at one lap per ROTATE_LAP_SECONDS, eased in', () => {
    const field = new PoolField({ ...DEFAULT_POOL_SETTINGS, hold: true, motion: 0, rotate: 1 });
    field.pointerDown(1, 0.8, 0.5, COLOR);
    field.step(DT);
    field.pointerUp(1);
    const p0 = posOfFirst(field);
    run(field, ROTATE_LAP_SECONDS / 4);
    const p1 = posOfFirst(field);
    const a0 = Math.atan2(p0.y - 0.5, p0.x - 0.5);
    const a1 = Math.atan2(p1.y - 0.5, p1.x - 0.5);
    const turned = ((a1 - a0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    // A quarter lap, less the ~3 s ease-in; clockwise on screen (y down).
    expect(turned).toBeGreaterThan(Math.PI / 2 - 1.2);
    expect(turned).toBeLessThan(Math.PI / 2);
    expect(Math.hypot(p1.x - 0.5, p1.y - 0.5)).toBeCloseTo(0.3, 2);
  });

  it('negative rotate turns the other way; 0 leaves a still pool still', () => {
    const ccw = new PoolField({ ...DEFAULT_POOL_SETTINGS, hold: true, motion: 0, rotate: -0.5 });
    ccw.pointerDown(1, 0.8, 0.5, COLOR);
    ccw.step(DT);
    ccw.pointerUp(1);
    run(ccw, 5);
    expect(posOfFirst(ccw).y).toBeLessThan(0.49);

    const still = new PoolField({ ...DEFAULT_POOL_SETTINGS, hold: true, motion: 0, rotate: 0 });
    still.pointerDown(1, 0.8, 0.5, COLOR);
    still.step(DT);
    still.pointerUp(1);
    run(still, 5);
    expect(posOfFirst(still).y).toBeCloseTo(0.5, 3);
  });
});
