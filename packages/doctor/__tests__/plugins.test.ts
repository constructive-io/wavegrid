import { loadWavegridConfig } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { localChecks } from '../src/collect';

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
