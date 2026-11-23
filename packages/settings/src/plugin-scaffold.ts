import fs from 'fs';
import path from 'path';

import { writeFileAtomic } from './paths';
import { checkPluginFolderDestination, type PortablePlugin, readProjectPlugins, validatePortablePlugins, writePluginFolder } from './plugins';
import { parseProjectFile } from './project-file';

/** Add a new plugin without rewriting unrelated project fields or touching the store. */
export function addProjectPlugin(file: string, plugin: PortablePlugin): void {
  const folder = path.dirname(path.resolve(file));
  file = fs.realpathSync(file);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const document = parseProjectFile(raw);
  const refs = [...(document.plugins ?? []), { path: plugin.path }];
  parseProjectFile({ ...raw, plugins: refs });
  validatePortablePlugins([...readProjectPlugins(folder, document.plugins ?? []), plugin]);

  const destination = path.join(folder, plugin.path);
  checkPluginFolderDestination(destination, plugin.files);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  // Exclusive creation also refuses an existing empty folder.
  fs.mkdirSync(destination);
  try {
    writePluginFolder(destination, plugin.files);
    writeFileAtomic(file, JSON.stringify({ ...raw, plugins: refs }, null, 2) + '\n');
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}
