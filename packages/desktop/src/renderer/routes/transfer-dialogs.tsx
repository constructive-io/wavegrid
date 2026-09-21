import { Download, Upload } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ExportResult, ImportRequest, ImportSummary } from '@/types/ipc';

/**
 * Export a project to a portable bundle. The only real decision is whether the
 * shared secrets travel: with them the other laptop joins the SAME brain, so the
 * file becomes sensitive; without them the import generates fresh secrets. It
 * defaults to off and says so, rather than quietly writing keys to disk.
 */
export function ExportProjectDialog({
  project,
  onExport,
  busy
}: {
  project: string;
  onExport: (project: string, includeSecrets: boolean) => Promise<ExportResult | null>;
  busy: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [includeSecrets, setIncludeSecrets] = React.useState(false);
  const [result, setResult] = React.useState<ExportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      const r = await onExport(project, includeSecrets);
      // null = the operator dismissed the save dialog; nothing to report.
      if (r) setResult(r);
      else setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant='ghost' size='sm' disabled={busy} title='Export project'>
          <Download />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export “{project}”</DialogTitle>
          <DialogDescription>
            Writes a portable bundle — layout, config, every device’s config, and UI users. Machine
            identity and IP addresses never travel.
          </DialogDescription>
        </DialogHeader>

        <label className='flex items-start gap-2 text-sm'>
          <input
            type='checkbox'
            checked={includeSecrets}
            disabled={busy}
            onChange={(ev) => setIncludeSecrets(ev.target.checked)}
            className='mt-1'
          />
          <span>
            Include the shared secrets
            <span className='text-muted-foreground block text-xs'>
              Needed for another laptop to join <em>this</em> brain. The file then contains keys —
              treat it as a credential. Leave off and the import generates fresh secrets instead.
            </span>
          </span>
        </label>

        {error && <p className='text-destructive text-sm'>{error}</p>}
        {result && (
          <p className='text-muted-foreground text-sm'>
            Wrote <span className='font-mono text-xs'>{result.path}</span> — {result.deviceCount}{' '}
            device(s), {result.userCount} user(s)
            {result.includeSecrets ? ', secrets included' : ', no secrets'}.
          </p>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button disabled={busy} onClick={() => void run()}>
            Choose file…
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Import a bundle. `overwrite` is opt-in because the store refuses to replace an
 * existing project silently; renaming on import is the non-destructive way to
 * bring in a second copy.
 */
export function ImportProjectDialog({
  onImport,
  busy
}: {
  onImport: (req: ImportRequest) => Promise<ImportSummary | null>;
  busy: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [activate, setActivate] = React.useState(false);
  const [overwrite, setOverwrite] = React.useState(false);
  const [result, setResult] = React.useState<ImportSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      const r = await onImport({ name: name.trim() || undefined, activate, overwrite });
      if (r) setResult(r);
      else setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
          setError(null);
          setName('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant='outline' size='sm' disabled={busy}>
          <Upload />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a project</DialogTitle>
          <DialogDescription>
            Reads a bundle exported here or by <code>wavegrid projects export</code>.
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-3'>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='import-name' className='text-xs'>
              Import under a different name (optional)
            </Label>
            <Input
              id='import-name'
              value={name}
              placeholder='leave blank to keep the bundle’s name'
              disabled={busy}
              onChange={(ev) => setName(ev.target.value)}
              className='h-9'
            />
          </div>
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={activate}
              disabled={busy}
              onChange={(ev) => setActivate(ev.target.checked)}
            />
            Make it the active project
          </label>
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={overwrite}
              disabled={busy}
              onChange={(ev) => setOverwrite(ev.target.checked)}
            />
            Replace an existing project with the same name
          </label>
        </div>

        {error && <p className='text-destructive text-sm'>{error}</p>}
        {result && (
          <p className='text-muted-foreground text-sm'>
            Imported “{result.project}” — {result.deviceCount} device(s), {result.userCount} user(s).
            {result.generatedSecrets &&
              ' The bundle carried no secrets, so fresh ones were generated — they will not match the brain until synced.'}
            {result.keptLocalOsc && ' This machine’s OSC target was kept (the bundle had none).'}
          </p>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button disabled={busy} onClick={() => void run()}>
            Choose file…
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
