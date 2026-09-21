import { Check, Cpu, Pencil, X } from 'lucide-react';
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
import { BrainDiscovery } from '@/renderer/routes/brain-discovery';
import { JoinBrain } from '@/renderer/routes/join-brain';
import type { DeviceInfo, DiscoveredBrainInfo, ShardRange } from '@/types/ipc';

interface DevicesRouteProps {
  activeProject: string | null;
  devices: DeviceInfo[];
  onRename: (idOrName: string, newName: string) => void;
  onAssignShard: (idOrName: string, shard: ShardRange | null) => void;
  busy: boolean;
  discovery: {
    brains: DiscoveredBrainInfo[];
    scanning: boolean;
    scanned: boolean;
    onScan: () => void;
  };
  join: {
    value: string;
    saved: string;
    onChange: (value: string) => void;
    onSave: () => void;
    onClear: () => void;
    busy: boolean;
  };
}

function relativeTime(ms?: number): string | null {
  if (!ms) return null;
  const secs = Math.round((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

/** One device row: rename inline and assign/clear its cannon shard. Writes go
 *  straight through the store IPC — the same records `wavegrid devices` manage. */
function DeviceCard({
  device,
  onRename,
  onAssignShard,
  busy
}: {
  device: DeviceInfo;
  onRename: (idOrName: string, newName: string) => void;
  onAssignShard: (idOrName: string, shard: ShardRange | null) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(device.name);
  const [start, setStart] = React.useState(device.shard ? String(device.shard.start) : '');
  const [end, setEnd] = React.useState(device.shard ? String(device.shard.end) : '');

  React.useEffect(() => {
    setName(device.name);
    setStart(device.shard ? String(device.shard.start) : '');
    setEnd(device.shard ? String(device.shard.end) : '');
  }, [device.name, device.shard]);

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== device.name) onRename(device.id, trimmed);
    setEditing(false);
  };

  const s = Number(start);
  const e = Number(end);
  const shardValid =
    start !== '' && end !== '' && Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e >= s;
  const shardChanged = !device.shard || device.shard.start !== s || device.shard.end !== e;
  const lastSeen = relativeTime(device.lastSeen);

  return (
    <div className='flex flex-col gap-3 rounded-lg border px-4 py-3'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          {editing ? (
            <>
              <Input
                value={name}
                autoFocus
                onChange={(ev) => setName(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') saveName();
                  if (ev.key === 'Escape') setEditing(false);
                }}
                className='h-8 w-48'
              />
              <Button size='sm' variant='default' disabled={busy} onClick={saveName}>
                <Check />
              </Button>
              <Button size='sm' variant='outline' onClick={() => setEditing(false)}>
                <X />
              </Button>
            </>
          ) : (
            <>
              <span className='truncate font-medium'>{device.name}</span>
              <Button
                size='sm'
                variant='ghost'
                disabled={busy}
                onClick={() => setEditing(true)}
                title='Rename device'
              >
                <Pencil />
              </Button>
            </>
          )}
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {device.mode && <Badge variant='outline'>{device.mode}</Badge>}
          {device.shard ? (
            <Badge>
              cannons {device.shard.start}–{device.shard.end}
            </Badge>
          ) : (
            <Badge variant='outline'>no shard</Badge>
          )}
        </div>
      </div>

      <div className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs'>
        <span>id {device.id.slice(0, 12)}</span>
        {device.hostname && <span>host {device.hostname}</span>}
        {device.address && <span>{device.address}</span>}
        {device.layout && <span>layout {device.layout}</span>}
        {lastSeen && <span>seen {lastSeen}</span>}
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-muted-foreground text-xs'>Shard</span>
        <Input
          value={start}
          inputMode='numeric'
          placeholder='start'
          onChange={(ev) => setStart(ev.target.value)}
          className='h-8 w-20'
        />
        <span className='text-muted-foreground'>–</span>
        <Input
          value={end}
          inputMode='numeric'
          placeholder='end'
          onChange={(ev) => setEnd(ev.target.value)}
          className='h-8 w-20'
        />
        <Button
          size='sm'
          disabled={busy || !shardValid || !shardChanged}
          onClick={() => onAssignShard(device.id, { start: s, end: e })}
        >
          Assign
        </Button>
        {device.shard && (
          <Button
            size='sm'
            variant='outline'
            disabled={busy}
            onClick={() => onAssignShard(device.id, null)}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

/** Devices admin — the project-scoped registry the CLI's `devices` commands
 *  show. Rename a laptop and assign the cannon shard it drives. */
export function DevicesRoute({
  activeProject,
  devices,
  onRename,
  onAssignShard,
  busy,
  discovery,
  join
}: DevicesRouteProps) {
  // Discovery is project-independent (it browses the LAN, not the store), so it
  // stays visible above every state — including "no devices yet", where it is
  // the most useful: it tells you the brain a laptop should point at.
  const scanner = (
    <>
      <BrainDiscovery {...discovery} onUse={join.onChange} />
      <JoinBrain {...join} disabled={!activeProject} />
    </>
  );

  if (!activeProject) {
    return (
      <div className='flex flex-col gap-2 p-4'>
        {scanner}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Cpu />
            </EmptyMedia>
            <EmptyTitle>No active project</EmptyTitle>
            <EmptyDescription>Select a project to manage its devices.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className='flex flex-col gap-2 p-4'>
        {scanner}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Cpu />
            </EmptyMedia>
            <EmptyTitle>No devices have joined “{activeProject}”</EmptyTitle>
            <EmptyDescription>
              Each laptop registers itself when it runs <code>wavegrid receiver</code> against this
              project. Registered devices appear here — the same registry as{' '}
              <code>wavegrid devices</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-2 p-4'>
      {scanner}
      {devices.map((d) => (
        <DeviceCard
          key={d.id}
          device={d}
          onRename={onRename}
          onAssignShard={onAssignShard}
          busy={busy}
        />
      ))}
    </div>
  );
}
