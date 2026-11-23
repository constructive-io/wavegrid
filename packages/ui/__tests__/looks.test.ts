import { applySocketMessage, createSocketSnapshot, type Look } from '../src/lib/socket-state';

const look = (params: Record<string, unknown>): Look => ({ id: 'l1', name: 'Dusk', params, createdAt: 0 });

describe('Looks', () => {
  it('looks_state replaces the list, dropping malformed entries', () => {
    const s = applySocketMessage(createSocketSnapshot(), {
      type: 'looks_state',
      looks: [look({ plugin: 'demo/view', colour: 120 }), { id: 7 }, null, { id: 'x', name: 'n' }]
    });
    expect(s.looks.map((l) => l.id)).toEqual(['l1']);
    expect(s.looks[0].params).toEqual({ plugin: 'demo/view', colour: 120 });
    expect(applySocketMessage(s, { type: 'looks_state', looks: [] }).looks).toEqual([]);
    expect(applySocketMessage(s, { type: 'looks_state' }).looks).toEqual([]);
  });
});
