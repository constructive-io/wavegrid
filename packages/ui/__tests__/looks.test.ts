import { emptyPaint } from '../src/lib/grace-paint';
import { applySocketMessage, createSocketSnapshot, type Look } from '../src/lib/socket-state';
import { paramsFromLook } from '../src/lib/use-grace-paint';

const look = (params: Record<string, unknown>): Look => ({ id: 'l1', name: 'Dusk', params, createdAt: 0 });
const base = { anim: 'comet', flow: 'cw', stops: [[200, 80], [320, 90]], spin: 1, level: 100 };

describe('Looks', () => {
  it('looks_state replaces the list, dropping malformed entries', () => {
    const s = applySocketMessage(createSocketSnapshot(), {
      type: 'looks_state',
      looks: [look({ ...base, paint: emptyPaint(25) }), { id: 7 }, null, { id: 'x', name: 'n' }]
    });
    expect(s.looks.map((l) => l.id)).toEqual(['l1']);
    expect(applySocketMessage(s, { type: 'looks_state', looks: [] }).looks).toEqual([]);
    expect(applySocketMessage(s, { type: 'looks_state' }).looks).toEqual([]);
  });

  it('paramsFromLook keeps a matching look as-is and refits paint to the window size', () => {
    const exact = paramsFromLook(look({ ...base, paint: emptyPaint(25) }), 25)!;
    expect(exact.paint).toHaveLength(50);
    expect(exact.anim).toBe('comet');

    const small = [10, 50, 20, 60];
    const grown = paramsFromLook(look({ ...base, paint: small }), 25)!;
    expect(grown.paint).toHaveLength(50);
    expect(grown.paint.slice(0, 4)).toEqual(small);
    expect(grown.paint[4]).toBe(emptyPaint(25)[4]);

    const shrunk = paramsFromLook(look({ ...base, paint: emptyPaint(28) }), 25)!;
    expect(shrunk.paint).toHaveLength(50);
  });

  it('paramsFromLook rejects a look without the GracePaint shape', () => {
    expect(paramsFromLook(look({ anim: 'comet' }), 25)).toBeNull();
    expect(paramsFromLook(look({ ...base, paint: 'nope' }), 25)).toBeNull();
  });
});
