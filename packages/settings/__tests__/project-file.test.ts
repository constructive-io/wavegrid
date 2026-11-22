import fs from 'fs';
import os from 'os';
import path from 'path';

import { openStore, parseProjectFile, type ProjectFile } from '../src';

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sampleFile(): ProjectFile {
  return {
    wavegrid: 'project',
    version: 1,
    name: 'venue',
    description: 'A venue kept in its own repo',
    config: {
      layout: {
        kind: 'fixtures',
        fixtures: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 }
        ]
      },
      mode: 'local',
      activeLightMap: 'swap'
    } as never,
    lightMaps: [{ name: 'swap', numCannons: 3, gridColumns: 3, physicalLights: [1, 0, 2] }],
    looks: [{ id: 'l1', name: 'Blue', params: { hue: 240 } }],
    devices: [{ id: 'dev-1', name: 'foh', layout: 'fixtures', mode: 'simple', shard: null }],
    stations: [{ id: 'booth', passcode: 'not-a-real-field-yet' }]
  };
}

function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

describe('project files', () => {
  it('opens a file into the store without secrets or users in it', () => {
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    const file = path.join(tmp('wg-pf-repo-'), 'venue.wavegrid');
    writeJson(file, sampleFile());

    const result = store.openProjectFile(file, JSON.parse(fs.readFileSync(file, 'utf8')), { activate: true });

    expect(result).toMatchObject({ project: 'venue', created: true, generatedSecrets: true, lightMapCount: 1, lookCount: 1, deviceCount: 1 });
    expect(store.getProjectConfig('venue')?.activeLightMap).toBe('swap');
    expect(store.readLightMap('venue', 'swap')?.physicalLights).toEqual([1, 0, 2]);
    expect(store.listDevices('venue')).toHaveLength(1);
    const looks = JSON.parse(fs.readFileSync(path.join(store.stateDir('venue'), 'looks.json'), 'utf8'));
    expect(looks.looks[0].name).toBe('Blue');
    expect(store.getProjectFileLink('venue')?.path).toBe(path.resolve(file));
  });

  it('saves back to the same file, keeping unknown sections and leaving out secrets', () => {
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    const file = path.join(tmp('wg-pf-repo-'), 'venue.wavegrid');
    writeJson(file, sampleFile());
    store.openProjectFile(file, JSON.parse(fs.readFileSync(file, 'utf8')));
    store.addUser('venue', 'admin', 'wavegrid123');

    const { file: written } = store.saveProjectFile('venue');
    expect(written).toBe(path.resolve(file));

    const text = fs.readFileSync(file, 'utf8');
    const saved = JSON.parse(text);
    expect(saved.wavegrid).toBe('project');
    expect(saved.description).toBe('A venue kept in its own repo');
    expect(saved.stations).toEqual([{ id: 'booth', passcode: 'not-a-real-field-yet' }]);
    expect(saved.config.layout.kind).toBe('fixtures');
    expect(saved.lightMaps).toHaveLength(1);
    expect(saved.looks).toHaveLength(1);
    expect(saved.users).toBeUndefined();
    expect(saved.secrets).toBeUndefined();
    const secrets = store.readSecrets('venue');
    expect(text).not.toContain(secrets.jwtSecret as string);
    expect(text).not.toContain(secrets.receiverKey as string);
  });

  it('re-opening the linked file refreshes the project and keeps secrets and device addresses', () => {
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    const file = path.join(tmp('wg-pf-repo-'), 'venue.wavegrid');
    writeJson(file, sampleFile());
    store.openProjectFile(file, JSON.parse(fs.readFileSync(file, 'utf8')));
    const secrets = store.readSecrets('venue');
    store.registerDevice('venue', { id: 'dev-1', name: 'foh', address: '10.0.0.5', layout: 'fixtures', mode: 'simple', shard: null } as never);

    const edited: ProjectFile = { ...sampleFile(), lightMaps: [], config: { ...sampleFile().config, activeLightMap: null } };
    writeJson(file, edited);
    const result = store.openProjectFile(file, edited);

    expect(result.created).toBe(false);
    expect(result.generatedSecrets).toBe(false);
    expect(store.readSecrets('venue')).toEqual(secrets);
    expect(store.listLightMaps('venue')).toHaveLength(0);
    expect(store.listDevices('venue')[0].address).toBe('10.0.0.5');
  });

  it('rejects project names that are not a single directory', () => {
    expect(() => parseProjectFile({ ...sampleFile(), name: '..' })).toThrow(/"name"/);
    expect(() => parseProjectFile({ ...sampleFile(), name: '.' })).toThrow(/"name"/);
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    const file = path.join(tmp('wg-pf-repo-'), 'venue.wavegrid');
    expect(() => store.openProjectFile(file, sampleFile(), { name: '..' })).toThrow(/Invalid project name/);
    expect(() => store.createProject('..', {} as never)).toThrow(/Invalid project name/);
    expect(store.listProjects()).toEqual([]);
  });

  it('keeps this machine’s OSC target across a refresh when the file has none', () => {
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    const file = path.join(tmp('wg-pf-repo-'), 'venue.wavegrid');
    const first = store.openProjectFile(file, sampleFile());
    expect(first.keptLocalOsc).toBe(false);
    const beyond = { host: '10.0.0.9', port: 8000, gridOrder: 'row' as const };
    store.saveProjectConfig('venue', {
      ...store.getProjectConfig('venue')!,
      osc: { beyond, routingConfig: '/etc/wavegrid/routing.json' }
    });

    const refreshed = store.openProjectFile(file, sampleFile());
    expect(refreshed.keptLocalOsc).toBe(true);
    expect(store.getProjectConfig('venue')?.osc).toEqual({ beyond, routingConfig: '/etc/wavegrid/routing.json' });

    const withOsc = sampleFile();
    withOsc.config = { ...withOsc.config, osc: { beyond: { ...beyond, port: 9000 } } };
    const again = store.openProjectFile(file, withOsc);
    expect(again.keptLocalOsc).toBe(false);
    expect(store.getProjectConfig('venue')?.osc).toEqual({ beyond: { ...beyond, port: 9000 } });
  });

  it('keeps a local receiver.lightMap unless the file names an active light map', () => {
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    const file = path.join(tmp('wg-pf-repo-'), 'venue.wavegrid');
    const noActive = sampleFile();
    noActive.config = { ...noActive.config, activeLightMap: null };
    store.openProjectFile(file, noActive);
    const receiver = { alpha: 0.5, fallbackDelay: 1000, lightMap: '/etc/wavegrid/light-map.json' };
    store.saveProjectConfig('venue', { ...store.getProjectConfig('venue')!, receiver });

    store.openProjectFile(file, noActive);
    expect(store.getProjectConfig('venue')?.receiver?.lightMap).toBe('/etc/wavegrid/light-map.json');

    store.openProjectFile(file, sampleFile());
    expect(store.getProjectConfig('venue')?.receiver?.lightMap).toBeUndefined();
  });

  it('applies deletions when a refreshed file has no looks or devices', () => {
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    const file = path.join(tmp('wg-pf-repo-'), 'venue.wavegrid');
    store.openProjectFile(file, sampleFile());
    const { looks: _looks, devices: _devices, ...rest } = sampleFile();
    store.openProjectFile(file, rest);
    expect(store.listDevices('venue')).toHaveLength(0);
    const looks = JSON.parse(fs.readFileSync(path.join(store.stateDir('venue'), 'looks.json'), 'utf8'));
    expect(looks.looks).toEqual([]);
  });

  it('rejects a bad light map before touching the existing project', () => {
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    const file = path.join(tmp('wg-pf-repo-'), 'venue.wavegrid');
    store.openProjectFile(file, sampleFile());
    const bad = { ...sampleFile(), lightMaps: [{ name: 'bar/main', numCannons: 3, gridColumns: 3, physicalLights: [0, 1, 2] }] };
    expect(() => store.openProjectFile(file, bad)).toThrow(/lightMaps\[0\] name/);
    expect(store.readLightMap('venue', 'swap')).toBeTruthy();
    const dup = { ...sampleFile(), lightMaps: [sampleFile().lightMaps![0], sampleFile().lightMaps![0]] };
    expect(() => parseProjectFile(dup)).toThrow(/repeats the name/);
  });

  it('refuses to replace a project that came from somewhere else unless told to', () => {
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    store.createProject('venue', { layout: { preset: 'nova' } } as never);
    const file = path.join(tmp('wg-pf-repo-'), 'venue.wavegrid');
    expect(() => store.openProjectFile(file, sampleFile())).toThrow(/already exists/);
    expect(store.openProjectFile(file, sampleFile(), { overwrite: true }).created).toBe(false);
    expect(store.openProjectFile(file, sampleFile(), { name: 'venue-copy' }).project).toBe('venue-copy');
  });

  it('leaves machine-local paths out of a saved file, with a warning', () => {
    const store = openStore({ baseDir: tmp('wg-pf-store-') });
    store.createProject('rig', { layout: { preset: 'nova' }, osc: { routingConfig: '/home/me/routing.json' } } as never);
    const file = path.join(tmp('wg-pf-repo-'), 'rig.wavegrid');
    const result = store.saveProjectFile('rig', { file });
    expect(result.warnings.join('\n')).toMatch(/routingConfig/);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).config.osc?.routingConfig).toBeUndefined();
    expect(() => store.saveProjectFile('nope', { file })).toThrow(/Unknown project/);
  });

  it('validates the whole file before writing anything', () => {
    expect(() => parseProjectFile({ wavegrid: 'project-export', version: 1 })).toThrow(/Not a Wavegrid project file/);
    expect(() => parseProjectFile({ ...sampleFile(), version: 2 })).toThrow(/version 2/);
    expect(() =>
      parseProjectFile({ ...sampleFile(), name: 'bad name', config: { layout: { kind: 'fixtures', fixtures: [] } }, looks: [{}] })
    ).toThrow(/name[\s\S]*config\.layout[\s\S]*looks\[0\]/);
  });
});
