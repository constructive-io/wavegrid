import { addProjectPlugin } from '@wavegrid/settings';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import c from 'yanse';

import { type Flags, getStore, resolveProjectName } from '../project';

export function runPluginsNew(flags: Flags, id: string | undefined): void {
  try {
    if (!id) throw new Error('Usage: wavegrid plugins new <id> [--project <file.wavegrid>] [--view] [--audio <mode>]');
    if (flags.project !== undefined && typeof flags.project !== 'string') throw new Error('--project needs a project file path');
    if (flags.view !== undefined && typeof flags.view !== 'boolean') throw new Error('--view is a boolean flag');
    const template = (name: string): string => readFileSync(join(__dirname, '../templates/plugin', name), 'utf8');
    const manifest = JSON.parse(template('plugin.json'));
    manifest.id = id;
    manifest.name = id;
    const tab = JSON.parse(template('tab.json'));
    tab.label = id;
    if (flags.audio !== undefined) {
      tab.audio = { mode: flags.audio, params: { hueShift: 'hueShift', satShift: 'satShift' } };
    }
    const contents: Record<string, string> = {
      'plugin.json': JSON.stringify(manifest, null, 2) + '\n',
      'tab.json': '',
      'pattern.js': template('pattern.js.tpl').replace('__PLUGIN_ID__', () => JSON.stringify(id)),
      'presets.json': template('presets.json')
    };
    if (flags.view === true) {
      tab.view = 'view/index.html';
      contents['view/index.html'] = template('view/index.html');
    }
    contents['tab.json'] = JSON.stringify(tab, null, 2) + '\n';
    let file: string;
    if (typeof flags.project === 'string') file = resolve(flags.project);
    else {
      const store = getStore();
      file = store.getProjectFileLink(resolveProjectName(store, {}))?.path;
      if (!file) throw new Error('The active project has no linked file. Pass --project <file.wavegrid>.');
    }
    addProjectPlugin(file, {
      path: `plugins/${id}`,
      files: Object.fromEntries(Object.entries(contents).map(([name, value]) => [name, Buffer.from(value).toString('base64')]))
    });
    console.log(c.green(`  ✓ Created plugins/${id} and registered it in ${file}`));
    console.log('  Reopen the project file and restart the server to load the plugin.');
  } catch (error) {
    console.log(c.red(`  Could not create plugin: ${(error as Error).message}`));
    process.exitCode = 1;
  }
}
