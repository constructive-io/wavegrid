import { easeCell } from '../src/components/mini-grid-preview';

const cell = (h = 0, s = 0, b = 0) => ({ h, s, b, th: h, ts: s, tb: b });

describe('easeCell — the receiver\'s attack + smoothing, in the tile previews', () => {
  it('attack 1 and alpha 1 jump straight to the pattern colour', () => {
    const c = cell();
    easeCell(c, 200, 80, 60, 1, 1);
    expect(c).toEqual({ h: 200, s: 80, b: 60, th: 200, ts: 80, tb: 60 });
  });

  it('a low attack moves the target only part of the way each frame', () => {
    const c = cell(0, 0, 0);
    easeCell(c, 0, 0, 100, 0.25, 1);
    expect(c.tb).toBeCloseTo(25);
    expect(c.b).toBeCloseTo(25);
    easeCell(c, 0, 0, 100, 0.25, 1);
    expect(c.tb).toBeCloseTo(43.75);
  });

  it('a low alpha lags the output behind the target', () => {
    const c = cell(0, 0, 0);
    easeCell(c, 0, 0, 100, 1, 0.1);
    expect(c.tb).toBe(100);
    expect(c.b).toBeCloseTo(10);
  });

  it('hue takes the short way round the wheel', () => {
    const c = cell(350, 100, 100);
    easeCell(c, 10, 100, 100, 0.5, 1);
    expect(c.th).toBeCloseTo(0);
    easeCell(c, 10, 100, 100, 0.5, 1);
    expect(c.th).toBeCloseTo(5);
  });

  it('snaps once within a third of a unit so it never hunts forever', () => {
    const c = cell(0, 0, 99.8);
    easeCell(c, 0, 0, 100, 1, 0.1);
    expect(c.b).toBe(100);
  });
});
