import { HelpCircle, Radio } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { OscTarget } from '@/types/ipc';

interface OutputRouteProps {
  activeProject: string | null;
  target: OscTarget | null;
  onSave: (target: OscTarget) => Promise<void>;
  busy: boolean;
}

type Kind = OscTarget['kind'];

/** OSC is UDP: `localhost` can resolve to IPv6 ::1 while BEYOND/FB4 listens on
 *  IPv4, and packets then vanish with no error — so the loopback default is the
 *  literal IPv4 address. */
const THIS_MACHINE = '127.0.0.1';

const HOST_HELP =
  'Where the laser software is listening. Same laptop as Wavegrid → 127.0.0.1. Another machine → its LAN IP (e.g. 192.168.1.50). Avoid “localhost”: OSC is UDP and localhost can resolve to IPv6 while the target listens on IPv4, so the packets are silently dropped.';

const KINDS: { id: Kind; label: string; blurb: string }[] = [
  { id: 'beyond', label: 'BEYOND', blurb: 'Pangolin BEYOND over OSC — the usual choice' },
  { id: 'fb4', label: 'FB4', blurb: 'Pangolin FB4 over OSC' },
  { id: 'routing', label: 'Routing file', blurb: 'A multi-target routing JSON on disk' },
  { id: 'none', label: 'None', blurb: 'Console only — nothing is sent to hardware' }
];

/**
 * Output — where this project sends light. The same four targets as
 * `wavegrid projects osc`, writing the same `osc` block in the project config,
 * so the CLI and the app never disagree about what drives the lasers.
 */
export function OutputRoute({ activeProject, target, onSave, busy }: OutputRouteProps) {
  const [draft, setDraft] = React.useState<OscTarget | null>(target);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [hostHelp, setHostHelp] = React.useState(false);

  // Re-seed whenever the stored target changes (project switch, or a save).
  React.useEffect(() => {
    setDraft(target);
    setError(null);
    setSaved(false);
  }, [target]);

  if (!activeProject || !draft) {
    return (
      <div className='p-4'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Radio />
            </EmptyMedia>
            <EmptyTitle>No active project</EmptyTitle>
            <EmptyDescription>Select a project to set its laser output.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const set = (patch: Partial<OscTarget>) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
  };

  const dirty = target != null && JSON.stringify(draft) !== JSON.stringify(target);

  const save = async () => {
    setError(null);
    try {
      await onSave(draft);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className='flex flex-col gap-4 p-4'>
      <div className='flex flex-col gap-3 rounded-lg border px-4 py-3'>
        <div className='flex items-center gap-2'>
          <Radio className='size-4' />
          <span className='font-medium'>Laser output for “{activeProject}”</span>
          {draft.hasUnifiedRouting && (
            <Badge
              variant='secondary'
              title='This project has a unified routing spec; each device generates its own config from it.'
            >
              unified routing set
            </Badge>
          )}
        </div>
        <Separator />

        <div className='grid gap-2 sm:grid-cols-2'>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type='button'
              disabled={busy}
              onClick={() => set({ kind: k.id })}
              className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left ${
                draft.kind === k.id ? 'border-primary bg-accent/40' : 'hover:bg-accent/20'
              }`}
            >
              <span className='text-sm font-medium'>{k.label}</span>
              <span className='text-muted-foreground text-xs'>{k.blurb}</span>
            </button>
          ))}
        </div>

        {(draft.kind === 'beyond' || draft.kind === 'fb4') && (
          <div className='flex flex-wrap items-end gap-3'>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='osc-host' className='flex items-center gap-1 text-xs'>
                {draft.kind === 'beyond' ? 'BEYOND host' : 'FB4 host'}
                <button
                  type='button'
                  aria-label='What goes here?'
                  title={HOST_HELP}
                  onClick={() => setHostHelp((v) => !v)}
                  className='text-muted-foreground hover:text-foreground'
                >
                  <HelpCircle className='size-3.5' />
                </button>
              </Label>
              <div className='flex items-center gap-2'>
                <Input
                  id='osc-host'
                  value={draft.host}
                  placeholder={THIS_MACHINE}
                  disabled={busy}
                  onChange={(ev) => set({ host: ev.target.value })}
                  className='h-9 w-48'
                />
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy || draft.host === THIS_MACHINE}
                  title={`Set the host to ${THIS_MACHINE} — the laser software runs on this laptop.`}
                  onClick={() => set({ host: THIS_MACHINE })}
                >
                  This machine
                </Button>
              </div>
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='osc-port' className='text-xs'>
                OSC port
              </Label>
              <Input
                id='osc-port'
                value={String(draft.port)}
                inputMode='numeric'
                disabled={busy}
                onChange={(ev) => set({ port: Number(ev.target.value) })}
                className='h-9 w-24'
              />
            </div>
            {draft.kind === 'beyond' && (
              <div className='flex flex-col gap-1'>
                <Label className='text-xs'>Grid wiring order</Label>
                <div className='flex gap-2'>
                  {(['row', 'column'] as const).map((order) => (
                    <Button
                      key={order}
                      size='sm'
                      variant={draft.gridOrder === order ? 'default' : 'outline'}
                      disabled={busy}
                      onClick={() => set({ gridOrder: order })}
                    >
                      {order}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(draft.kind === 'beyond' || draft.kind === 'fb4') && hostHelp && (
          <p className='text-muted-foreground max-w-prose text-xs'>{HOST_HELP}</p>
        )}

        {draft.kind === 'routing' && (
          <div className='flex flex-col gap-1'>
            <Label htmlFor='osc-file' className='text-xs'>
              Absolute path to the routing JSON
            </Label>
            <Input
              id='osc-file'
              value={draft.file}
              placeholder='/Users/you/routing-production.json'
              disabled={busy}
              onChange={(ev) => set({ file: ev.target.value })}
              className='h-9'
            />
          </div>
        )}

        {draft.kind === 'none' && (
          <p className='text-muted-foreground text-sm'>
            The show runs and the UI animates, but nothing is sent to hardware.
          </p>
        )}

        <div className='flex items-center gap-3'>
          <Button disabled={busy || !dirty} onClick={() => void save()}>
            Save output
          </Button>
          {error && <span className='text-destructive text-sm'>{error}</span>}
          {!error && saved && !dirty && (
            <span className='text-muted-foreground text-sm'>
              Saved — run the show to drive the hardware.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
