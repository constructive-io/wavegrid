import { loadWavegridConfig } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { localChecks } from '../src/collect';

it('warns when multiple tabs declare the same audio mode', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-doctor-audio-'));
  try {
    const store = openStore({ baseDir: folder }), plugin = path.join(folder, 'plugin');
    fs.mkdirSync(plugin);
    fs.writeFileSync(path.join(plugin, 'plugin.json'), JSON.stringify({ id: 'demo', name: 'Demo', version: '1', apiVersion: 1,
      pattern: 'pattern.js', tabs: ['first.json', 'second.json'] }));
    fs.writeFileSync(path.join(plugin, 'pattern.js'), '({ render() {} })');
    for (const id of ['first', 'second']) fs.writeFileSync(path.join(plugin, id + '.json'), JSON.stringify({ id, label: id, cards: [],
      audio: { mode: 'grace', params: { hueShift: 'hue' } } }));
    store.openProjectFile(path.join(folder, 'venue.wavegrid'), { wavegrid: 'project', version: 1, name: 'venue', config: {}, plugins: [{ path: 'plugin' }] });
    expect(localChecks({ store, project: 'venue', resolved: loadWavegridConfig() }).find(check => check.name === 'Plugin audio'))
      .toMatchObject({ status: 'warn', detail: expect.stringContaining('first binding demo/first wins') });
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('reports broken plugin copies in local doctor checks', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-doctor-plugin-'));
  try {
    const store = openStore({ baseDir: folder });
    store.createProject('venue', {});
    const resolved = loadWavegridConfig();
    expect(localChecks({ store, project: 'venue', resolved }).find(check => check.name === 'Plugins')).toBeUndefined();
    fs.writeFileSync(path.join(store.paths.data, 'projects', 'venue', 'plugins.json'), '{broken');
    expect(localChecks({ store, project: 'venue', resolved }).find(check => check.name === 'Plugins')).toMatchObject({
      status: 'fail', detail: expect.any(String), remedy: expect.stringContaining('reopen')
    });
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
