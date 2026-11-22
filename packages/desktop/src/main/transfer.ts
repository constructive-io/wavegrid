// Project export/import driven by native file dialogs. The bundle format and
// all store writes come from @wavegrid/settings — this only chooses the file and
// reads/writes it, so a bundle written here imports with the CLI and vice versa.
import { isProjectFile, openStore } from '@wavegrid/settings';
import { dialog } from 'electron';
import fs from 'fs';
import path from 'path';

import type { ExportResult, ImportRequest, ImportSummary } from '@/types/ipc';

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ask where to save, then write the bundle. Returns null when the operator
 * cancels the dialog — a cancel is not an error.
 *
 * `includeSecrets` decides whether the receiverKey/jwtSecret travel: with them
 * the other laptop joins the SAME brain; without them the import generates
 * fresh secrets that will not match. It defaults to off because the file is
 * then safe to hand around.
 */
export async function exportProjectToFile(
  project: string,
  includeSecrets: boolean
): Promise<ExportResult | null> {
  const store = openStore();
  if (!store.hasProject(project)) throw new Error(`Unknown project "${project}".`);

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: `Export "${project}"`,
    defaultPath: `${project}-${stamp()}.wavegrid.json`,
    filters: [{ name: 'Wavegrid project', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;

  const bundle = store.exportProject(project, { includeSecrets });
  fs.writeFileSync(filePath, `${JSON.stringify(bundle, null, 2)}\n`);
  return {
    path: filePath,
    project,
    includeSecrets,
    deviceCount: bundle.devices.length,
    userCount: bundle.users?.length ?? 0
  };
}

/**
 * Ask for a bundle file, then import it. Returns null on cancel. `overwrite`
 * comes from the renderer, which asks before replacing an existing project —
 * the store itself refuses to clobber silently.
 */
export async function importProjectFromFile(req: ImportRequest): Promise<ImportSummary | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import a Wavegrid project',
    properties: ['openFile'],
    filters: [{ name: 'Wavegrid project', extensions: ['wavegrid', 'json'] }]
  });
  const file = filePaths[0];
  if (canceled || !file) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${path.basename(file)} is not valid JSON.`);
  }

  const store = openStore();
  // A `.wavegrid` project file carries no users or secrets: secrets are kept
  // or generated here, and this machine's users stay as they are.
  if (isProjectFile(raw)) {
    const opened = store.openProjectFile(file, raw, {
      name: req.name?.trim() ? req.name.trim() : undefined,
      activate: req.activate,
      overwrite: req.overwrite
    });
    return {
      project: opened.project,
      generatedSecrets: opened.generatedSecrets,
      deviceCount: opened.deviceCount,
      userCount: 0,
      keptLocalOsc: opened.keptLocalOsc,
      path: file
    };
  }

  // parseBundle rejects anything that is not a v1 project export, so a stray
  // JSON file cannot be half-imported.
  const result = store.importProject(raw, {
    name: req.name?.trim() ? req.name.trim() : undefined,
    activate: req.activate,
    overwrite: req.overwrite
  });
  return { ...result, path: file };
}
