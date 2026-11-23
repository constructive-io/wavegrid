import {
  compositeStationPaint, dispatchStationTool, projectStationLayout, resolveStations,
  stationLayoutKey, StationPaint, validateStations
} from '../src';

const fixtures = [
  { index: 0, u: 0, v: 0, kind: 'cannon', label: 'A' },
  { index: 1, u: 0.5, v: 0.5, kind: 'projector', label: 'B' },
  { index: 2, u: 1, v: 1, kind: 'cannon', label: 'C' }
];
const layout = { id: 'demo', topology: 'grid', fixtures };
const left = { slug: 'left', name: 'Left', fixtures: [0, 1] };
const right = { slug: 'right', name: 'Right', fixtures: [2] };
const red = { h: 0, s: 100, b: 100 };
const blue = { h: 240, s: 100, b: 100 };

test('station membership is opt-in, bound to fixture order and topology, and disjoint', () => {
  const config = { enabled: true, layout: stationLayoutKey(layout), stations: [left, right] };
  expect(resolveStations(undefined, layout)).toEqual([]);
  expect(resolveStations({ ...config, enabled: false }, layout)).toEqual([]);
  expect(resolveStations(config, layout)).toEqual([left, right]);
  expect(resolveStations(config, { ...layout, fixtures: fixtures.slice().reverse() })).toEqual([]);
  expect(() => validateStations([left, { ...right, fixtures: [1] }], 3)).toThrow('only once');
  expect(() => validateStations([{ ...left, fixtures: [] }], 3)).toThrow('at least one');
  expect(() => validateStations([{ ...right, fixtures: [3] }], 3)).toThrow('in range');
  expect(projectStationLayout(layout, left).fixtures).toEqual([
    fixtures[0], { ...fixtures[1], u: 1, v: 1 }
  ]);
});

test('commands cannot cross station boundaries or re-arm an operator stop', () => {
  const paint = new StationPaint();
  expect(dispatchStationTool({ type: 'cannon', index: 2, ...red }, left, paint)).toBe(false);
  expect(dispatchStationTool({ type: 'evalPattern' }, left, paint)).toBe(false);
  expect(dispatchStationTool({ type: 'cannon', index: 1, ...red }, left, paint)).toBe(true);
  expect(dispatchStationTool({ type: 'cannon', index: 2, ...blue }, right, paint)).toBe(true);
  expect(compositeStationPaint([blue, blue, red], paint.snapshot(3))).toEqual([blue, red, blue]);
  dispatchStationTool({ type: 'clear' }, left, paint);
  expect(paint.snapshot(3).find(cell => cell.idx === 2)).toEqual({ idx: 2, ...blue });
  paint.stop();
  expect(dispatchStationTool({ type: 'cannon', index: 0, ...red }, left, paint)).toBe(false);
  expect(paint.snapshot(3)).toEqual([]);
  paint.setMode('stations');
  expect(paint.snapshot(3).map(cell => cell.b)).toEqual([0, 0, 0]);
  paint.stop();
  expect(paint.acceptsInput).toBe(false);
  expect(compositeStationPaint([blue, blue, red], paint.snapshot(3)).map(cell => cell.b)).toEqual([0, 0, 0]);
  paint.setMode('show');
  expect(dispatchStationTool({ type: 'clear' }, right, paint)).toBe(false);
});
