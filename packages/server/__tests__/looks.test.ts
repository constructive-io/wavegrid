import fs from 'fs';
import * as os from 'os';
import { dirname, join } from 'path';

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

  it('writes a complete same-directory temporary file before replacing the live file', () => {
    const file = join(dir, 'looks.json');
    const store = new LookStore(file);
    store.save('First', params);
    const original = fs.renameSync;
    const rename = jest.spyOn(fs, 'renameSync').mockImplementation((temporary, target) => {
      expect(dirname(String(temporary))).toBe(dirname(file));
      expect(target).toBe(file);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).looks).toHaveLength(1);
      expect(JSON.parse(fs.readFileSync(temporary, 'utf8')).looks).toHaveLength(2);
      original(temporary, target);
    });
    try {
      store.save('Second', params);
      expect(rename).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).looks).toHaveLength(2);
      expect(fs.readdirSync(dir)).toEqual(['looks.json']);
    } finally { rename.mockRestore(); }
  });

  it.each(['write', 'rename'])('preserves the live file and removes temporary files when %s fails', step => {
    const file = join(dir, 'looks.json');
    const store = new LookStore(file);
    store.save('First', params);
    const before = fs.readFileSync(file, 'utf8');
    const original = fs.writeFileSync;
    const failure = step === 'write'
      ? jest.spyOn(fs, 'writeFileSync').mockImplementation(temporary => { original(temporary, 'partial'); throw new Error('disk full'); })
      : jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('rename denied'); });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      store.save('Second', params);
      expect(fs.readFileSync(file, 'utf8')).toBe(before);
      expect(fs.readdirSync(dir)).toEqual(['looks.json']);
      expect(error).toHaveBeenCalled();
    } finally { failure.mockRestore(); error.mockRestore(); }
  });

  it('migrates legacy Palace Looks once, preserving recall params, IDs, order and timestamps', () => {
    const file = join(dir, 'looks.json');
    const legacy = { ...params, kind: 'palace', who: 'projector', cannon: 37, projector: 81, span: .5, hueShift: 17, paint: [220, 90, -1, 0] };
    const entries = [
      { id: 'old', name: 'Legacy Palace', params: legacy, createdAt: 123 },
      { id: 'scoped', name: 'Other scope', params: { ...legacy, plugin: 'other/tab' }, createdAt: 456 },
      { id: 'grace', name: 'Grace', params, createdAt: 789 }
    ];
    fs.writeFileSync(file, JSON.stringify({ looks: entries }));
    const store = new LookStore(file);
    const expected = [{ ...entries[0], params: { ...legacy, plugin: 'palace/palace' } }, ...entries.slice(1)];
    expect(store.list()).toEqual(expected);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).looks).toEqual(expected);
    fs.utimesSync(file, 1234, 1234);
    const modified = fs.statSync(file).mtimeMs;
    expect(new LookStore(file).list()).toEqual(expected);
    expect(fs.statSync(file).mtimeMs).toBe(modified);
  });

  it('tags new unscoped Palace saves without changing caller params or existing scope values', () => {
    const store = new LookStore(null);
    const legacy = { ...params, kind: 'palace' };
    expect(store.save('Legacy', legacy)?.params).toEqual({ ...legacy, plugin: 'palace/palace' });
    expect(legacy).not.toHaveProperty('plugin');
    for (const plugin of ['palace/palace', 'other/tab', '', null]) {
      expect(store.save('Scoped', { ...legacy, plugin })?.params.plugin).toBe(plugin);
    }
    expect(store.save('Grace', params)?.params).toEqual(params);
  });

  it('changes only legacy params.plugin bytes, preserving long names, raw records and document metadata', () => {
    const file = join(dir, 'looks.json');
    const longName = `  ${'Long unrelated name '.repeat(4)}  `;
    const legacyParams = '{ "kind" : "palace", "paint": [1e2, 50], "nested": { "params": { "kind": "palace" } } }';
    const source = String.raw`{
  "revision": 1e+3, "note": "braces } ] and \"quotes\" and \u0061",
  "looks" : [
    {"id":"other", "name":${JSON.stringify(longName)}, "params":{"flow":"cw"}, "createdAt":"keep", "extra": [null, {"keep":true}]},
    {"id":"legacy", "name":${JSON.stringify(longName)}, "params":${legacyParams}, "createdAt":123, "extra": "retain"},
    {"id":"scoped", "name":"Scoped", "params":{"kind":"palace","plugin":"other/tab"}, "createdAt":456},
    null, {"id":5,"params":{"kind":"palace"}},
    {"id":"second", "params":${legacyParams}}
  ],
  "tail": { "looks": [{"params":{"kind":"palace"}}] }
}
`;
    fs.writeFileSync(file, source);
    const store = new LookStore(file);
    const expected = source.split(legacyParams).join(`${legacyParams.slice(0, -1)},"plugin":"palace/palace"}`);
    expect(fs.readFileSync(file, 'utf8')).toBe(expected);
    expect(JSON.parse(expected).looks[0].name).toBe(longName);
    expect(store.list()[0].name).toBe(longName.trim().slice(0, MAX_LOOK_NAME));
    expect(store.list().filter(l => l.params.plugin === 'palace/palace').map(l => l.id)).toEqual(['legacy', 'second']);
    fs.utimesSync(file, 1234, 1234);
    expect(new LookStore(file).list()).toEqual(store.list());
    expect(fs.readFileSync(file, 'utf8')).toBe(expected);
    expect(fs.statSync(file).mtimeMs).toBe(1234000);
  });

  it.each(['{"looks":[]}', '{"looks":[{"id":"other","params":{}}]}'])('does not rewrite a file without legacy Looks: %s', source => {
    const file = join(dir, 'looks.json');
    fs.writeFileSync(file, source);
    fs.utimesSync(file, 1234, 1234);
    new LookStore(file);
    expect(fs.readFileSync(file, 'utf8')).toBe(source);
    expect(fs.statSync(file).mtimeMs).toBe(1234000);
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
