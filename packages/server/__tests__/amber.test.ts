import { AMBER_HUE, AMBER_LOOKS, AMBER_SAT, ringPosition } from '@wavegrid/animations';
import { gridLayout, ringLayout } from '@wavegrid/layout';

import { evaluateAnimation } from '../src/animations';
import { createGrid } from '../src/grid';
import { applyScene } from '../src/scenes';

const nova = ringLayout({ count: 6, id: 'nova', name: 'Nova (6-laser ring)' });

function novaGrid() {
  return createGrid(nova.count);
}

/** Every amber look, evaluated on the Nova ring at one tick. */
function frame(id: string, tick: number) {
  const look = AMBER_LOOKS.find((l) => l.id === id);
  if (!look) throw new Error(`no such look: ${id}`);
  const grid = novaGrid();
  if (look.kind === 'scene') applyScene(grid, look.id, nova);
  else evaluateAnimation(grid, look.id, tick, 1, nova);
  return grid;
}

describe('amber looks', () => {
  it('registers every catalog entry under its own kind', () => {
    const ids = AMBER_LOOKS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const look of AMBER_LOOKS) {
      const grid = novaGrid();
      const applied =
        look.kind === 'scene'
          ? applyScene(grid, look.id, nova)
          : evaluateAnimation(grid, look.id, 0, 1, nova);
      expect(applied).toBe(true);
    }
  });

  it('offers both stills and motion', () => {
    expect(AMBER_LOOKS.filter((l) => l.kind === 'scene').length).toBeGreaterThan(1);
    expect(AMBER_LOOKS.filter((l) => l.kind === 'animation').length).toBeGreaterThan(3);
  });

  // The whole point of the Nova panel: amber only. A look that shifts hue or
  // desaturates would put a colour on stage nobody asked for.
  it('never leaves amber, at any tick', () => {
    for (const look of AMBER_LOOKS) {
      for (const tick of [0, 7, 41, 250, 1013]) {
        for (const cell of frame(look.id, tick)) {
          expect(cell.targetH).toBe(AMBER_HUE);
          expect(cell.targetS).toBe(AMBER_SAT);
          expect(cell.targetB).toBeGreaterThanOrEqual(0);
          expect(cell.targetB).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('says what it has to say with brightness — every look but the flat wash varies it', () => {
    const flat = new Set(['amber', 'amber-glow', 'amber-breathe']);
    for (const look of AMBER_LOOKS.filter((l) => !flat.has(l.id))) {
      const levels = new Set(frame(look.id, 33).map((c) => Math.round(c.targetB)));
      expect(levels.size).toBeGreaterThan(1);
    }
  });

  it('moves the animations over time', () => {
    const moving = ['amber-chase', 'amber-comet', 'amber-wave', 'amber-levels', 'amber-breathe'];
    for (const id of moving) {
      const before = frame(id, 0).map((c) => Math.round(c.targetB));
      const after = frame(id, 60).map((c) => Math.round(c.targetB));
      expect(after).not.toEqual(before);
    }
  });

  it('lights exactly one laser at a time in the chase', () => {
    for (const tick of [0, 20, 60, 120, 400]) {
      const bright = frame('amber-chase', tick).filter((c) => c.targetB > 50);
      expect(bright).toHaveLength(1);
    }
  });

  it('gives each of the six lasers its own level in the ramp', () => {
    const levels = frame('amber-ramp', 0).map((c) => c.targetB);
    expect(new Set(levels).size).toBe(6);
  });
});

describe('ringPosition', () => {
  it('walks the ring in even steps, starting at the top', () => {
    const positions = nova.fixtures.map((f) => ringPosition(f, nova));
    expect(positions[0]).toBeCloseTo(0);
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i]).toBeCloseTo(i / 6, 5);
    }
  });

  it('stays inside 0..1 for any ring size', () => {
    for (const count of [3, 6, 12, 40]) {
      const layout = ringLayout({ count });
      for (const f of layout.fixtures) {
        const pos = ringPosition(f, layout);
        expect(pos).toBeGreaterThanOrEqual(0);
        expect(pos).toBeLessThan(1);
      }
    }
  });

  it('falls back to logical order on a grid, where an angle means nothing', () => {
    const grid = gridLayout({ cols: 4, rows: 4 });
    const positions = grid.fixtures.map((f) => ringPosition(f, grid));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBe(0);
  });
});
