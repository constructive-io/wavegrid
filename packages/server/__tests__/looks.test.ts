import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';

import { LookStore, MAX_LOOK_NAME, MAX_LOOKS } from '../src/looks';

const params = { anim: 'comet', flow: 'cw', stops: [[200, 80], [320, 90]], paint: [-1, 0], level: 100, spin: 1 };

describe('LookStore', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(join(os.tmpdir(), 'wg-looks-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('saves a look with a copy of the params and a default name, and persists it', () => {
    const file = join(dir, 'looks.json');
    const store = new LookStore(file);
    const look = store.save('', params)!;
    expect(look.name).toBe('Look 1');
    expect(look.params).toEqual(params);
    expect(look.params).not.toBe(params);
    expect(store.list()).toHaveLength(1);
    expect(fs.existsSync(file)).toBe(true);

    const again = new LookStore(file);
    expect(again.list()).toEqual([look]);
  });

  it('rejects junk params and caps the list', () => {
    const store = new LookStore(null);
    expect(store.save('x', null)).toBeNull();
    expect(store.save('x', [1, 2])).toBeNull();
    for (let i = 0; i < MAX_LOOKS; i++) expect(store.save(`l${i}`, params)).not.toBeNull();
    expect(store.save('one too many', params)).toBeNull();
  });

  it('renames (trimmed, capped), deletes and reorders by id', () => {
    const store = new LookStore(null);
    const a = store.save('A', params)!;
    const b = store.save('B', params)!;
    const c = store.save('C', params)!;
    expect(store.rename(a.id, `  ${'x'.repeat(50)}  `)).toBe(true);
    expect(store.list()[0].name).toHaveLength(MAX_LOOK_NAME);
    expect(store.rename(a.id, '   ')).toBe(true);
    expect(store.list()[0].name).toHaveLength(MAX_LOOK_NAME);
    expect(store.rename('nope', 'x')).toBe(false);

    expect(store.move(c.id, 0)).toBe(true);
    expect(store.list().map((l) => l.id)).toEqual([c.id, a.id, b.id]);
    expect(store.move(a.id, 99)).toBe(true);
    expect(store.list().map((l) => l.id)).toEqual([c.id, b.id, a.id]);

    expect(store.remove(b.id)).toBe(true);
    expect(store.remove(b.id)).toBe(false);
    expect(store.list().map((l) => l.id)).toEqual([c.id, a.id]);
  });

  it('ignores a corrupt or malformed file', () => {
    const file = join(dir, 'looks.json');
    fs.writeFileSync(file, '{not json');
    expect(new LookStore(file).list()).toEqual([]);
    fs.writeFileSync(file, JSON.stringify({ looks: [{ id: 'ok', name: 'n', params }, { id: 5, params }, { id: 'bad', params: 'x' }] }));
    expect(new LookStore(file).list().map((l) => l.id)).toEqual(['ok']);
  });
});
