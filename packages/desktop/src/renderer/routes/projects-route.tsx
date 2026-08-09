import { Check, FolderOpen, Settings2, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { CreateProjectDialog } from '@/renderer/routes/create-project-dialog';
import {
  ExportProjectDialog,
  ImportProjectDialog
} from '@/renderer/routes/transfer-dialogs';
import type {
  ExportResult,
  ImportRequest,
  ImportSummary,
  NewProjectInput,
  ProjectSummary
} from '@/types/ipc';

interface ProjectsRouteProps {
  projects: ProjectSummary[];
  presets: string[];
  onUse: (name: string) => void;
  onCreate: (input: NewProjectInput) => Promise<void>;
  onRemove: (name: string) => void;
  onEditConfig: (name: string) => void;
  onExport: (project: string, includeSecrets: boolean) => Promise<ExportResult | null>;
  onImport: (req: ImportRequest) => Promise<ImportSummary | null>;
  busy: boolean;
}

/** Projects screen — the switcher plus lifecycle: create (wizard), set active,
 *  open the config editor, and delete (confirmed). Every write goes through the
 *  shared appstash store the CLI's `projects` commands use. */
export function ProjectsRoute({
  projects,
  presets,
  onUse,
  onCreate,
  onRemove,
  onEditConfig,
  onExport,
  onImport,
  busy
}: ProjectsRouteProps) {
  const existing = projects.map((p) => p.name);

  return (
    <div className='flex flex-col gap-3 p-4'>
      <div className='flex items-center justify-between'>
        <span className='text-muted-foreground text-sm'>
          {projects.length} project{projects.length === 1 ? '' : 's'} · shared with the CLI
        </span>
        <div className='flex items-center gap-2'>
          <ImportProjectDialog onImport={onImport} busy={busy} />
          <CreateProjectDialog
            presets={presets}
            existing={existing}
            onCreate={onCreate}
            busy={busy}
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Create your first project — it lands in the shared <code>~/.wavegrid</code> store, so
              the CLI sees it too.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className='flex flex-col gap-2'>
          {projects.map((p) => (
            <div
              key={p.name}
              className='flex items-center justify-between rounded-lg border px-4 py-3'
            >
              <div className='flex items-center gap-2'>
                <span className='font-medium'>{p.name}</span>
                {p.active && <Badge>active</Badge>}
              </div>
              <div className='flex items-center gap-2'>
                <ExportProjectDialog project={p.name} onExport={onExport} busy={busy} />
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={busy}
                  onClick={() => onEditConfig(p.name)}
                  title='Switch to this project and edit its layout'
                >
                  <Settings2 />
                  Layout
                </Button>
                <Button
                  variant={p.active ? 'outline' : 'default'}
                  size='sm'
                  disabled={busy || p.active}
                  onClick={() => onUse(p.name)}
                >
                  {p.active ? <Check /> : null}
                  {p.active ? 'Current' : 'Use'}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant='ghost' size='sm' disabled={busy} title='Delete project'>
                      <Trash2 />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete “{p.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the project and its config, users, secrets, and state from
                        <code> ~/.wavegrid</code>. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onRemove(p.name)}
                        className='bg-destructive text-white hover:bg-destructive/90'
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
