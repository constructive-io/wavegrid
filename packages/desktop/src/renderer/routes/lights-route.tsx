import { AlertTriangle, FilePlus2, Lightbulb, RotateCcw, Save, Sparkles, Trash2, Wand2, Zap } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { LightMapView } from '@/types/ipc';

interface LightsRouteProps {
  project: string | null;
  view: LightMapView | null;
  loading: boolean;
  onSaveMap: (name: string, physicalLights: number[]) => void;
  onActivate: (name: string | null) => void;
  onDeleteMap: (name: string) => void;
  onAutoMap: (strategyId: string) => Promise<number[] | null>;
  onIdentify: (physicalIndex: number) => Promise<boolean>;
  onIdentifyClear: () => Promise<void>;
  /** True when this project's brain is live, so identify can flash the rig. */
  brainLive: boolean;
  busy: boolean;
}

/**
 * Light-map debugger. Identity is the default — a healthy rig needs no map. The
 * canvas lays fixtures out in their real geometry (grid or ring); tap one to
 * select it, then set the physical output it's wired to (duplicates are flagged,
 * not auto-swapped) or flash it on the live rig to see which laser it is.
 * Deterministic auto-map heuristics propose whole permutations to try. Maps are
 * saved by name into the project's library; the active one is materialized into
 * the same light-map.json the brain reads (or none = identity).
 */
export function LightsRoute({
  project,
  view,
  loading,
  onSaveMap,
  onActivate,
  onDeleteMap,
  onAutoMap,
  onIdentify,
  onIdentifyClear,
  brainLive,
  busy
}: LightsRouteProps) {
  // Draft of physical indices keyed by logical index. Committed on Save.
  const [draft, setDraft] = React.useState<number[]>([]);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [strategy, setStrategy] = React.useState('');
  const [identifyOn, setIdentifyOn] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const tableScrollRef = React.useRef<HTMLDivElement | null>(null);

  // Tapping a fixture on the canvas brings its row into view in the table's own
  // scroll area, so the two halves always agree on what's selected.
  React.useEffect(() => {
    if (selected == null) return;
    const row = tableScrollRef.current?.querySelector(`[data-logical="${selected}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  React.useEffect(() => {
    if (view) setDraft(view.physicalLights);
  }, [view]);

  const draftPhysical = selected != null ? draft[selected] : null;

  // While "identify" is on, flash the selected fixture's physical output on the
  // live rig and keep it in sync as the operator steps through outputs. Always
  // clear the flash when identify turns off, selection changes, or we unmount.
  React.useEffect(() => {
    if (!identifyOn || selected == null || !brainLive || draftPhysical == null) return;
    void onIdentify(draftPhysical);
    return () => {
      void onIdentifyClear();
    };
  }, [identifyOn, selected, draftPhysical, brainLive, onIdentify, onIdentifyClear]);

  React.useEffect(() => {
    if (!brainLive && identifyOn) setIdentifyOn(false);
  }, [brainLive, identifyOn]);

  if (!project) {
    return (
      <div className='p-4'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Lightbulb />
            </EmptyMedia>
            <EmptyTitle>No project selected</EmptyTitle>
            <EmptyDescription>
              Pick a project on the Projects screen to inspect its light map.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!view) {
    return <div className='text-muted-foreground p-4 text-sm'>{loading ? 'Loading…' : 'No layout resolved for this project.'}</div>;
  }

  const N = view.numCannons;
  const dirty = draft.some((v, i) => v !== view.physicalLights[i]);
  const draftIsIdentity = draft.every((v, i) => v === i);
  const correctedCount = draft.filter((v, i) => v !== i).length;

  // A light map must be a bijection — each physical output wired to exactly one
  // fixture. Editing is now purely local (no cascade swap), so a draft can
  // temporarily have two fixtures pointing at the same output; we flag those
  // and block Save until resolved, rather than silently reshuffling the map.
  const outputCounts = new Map<number, number>();
  for (const v of draft) outputCounts.set(v, (outputCounts.get(v) ?? 0) + 1);
  const conflicts = new Set<number>();
  draft.forEach((v, i) => {
    if ((outputCounts.get(v) ?? 0) > 1) conflicts.add(i);
  });
  const hasConflicts = conflicts.size > 0;

  /** Set fixture `logical`'s physical output — only this fixture changes. If
   *  the value now duplicates another fixture's, both are flagged (Save stays
   *  disabled until the operator resolves it). */
  const assignPhysical = (logical: number, physical: number) => {
    if (!Number.isInteger(physical) || physical < 0 || physical >= N) return;
    setDraft((cur) => {
      const next = [...cur];
      next[logical] = physical;
      return next;
    });
  };

  const resetIdentity = () => setDraft(Array.from({ length: N }, (_, i) => i));

  const activeMap = view.activeMap;
  const trimmedName = newName.trim();
  const nameExists = view.maps.some((m) => m.name === trimmedName);

  const applyStrategy = async (id: string) => {
    if (!id) return;
    const candidate = await onAutoMap(id);
    if (candidate) setDraft(candidate);
  };

  const selectedRow = selected != null ? view.rows[selected] : null;

  // Simple one-laptop shows have no shard owners and no device-local rebase —
  // those columns would read "all cannons"/"—" on every row, so they're hidden
  // until the project is actually distributed.
  const distributed = view.rows.some((r) => r.shardOwner != null);
  const hasLocalIndex = view.rows.some((r) => r.localIndex != null);

  return (
    <div className='flex h-full min-h-0 flex-col gap-3 p-4'>
      {/* Header + save controls */}
      <div className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex items-baseline gap-2'>
          <span className='font-medium'>{project}</span>
          <span className='text-muted-foreground text-sm'>
            {view.layoutName} · {N} fixtures
          </span>
        </div>
        <div className='flex items-center gap-2'>
          {hasConflicts ? (
            <Badge variant='destructive'>{conflicts.size} conflict{conflicts.size > 1 ? 's' : ''}</Badge>
          ) : draftIsIdentity ? (
            <Badge variant='success'>Identity · no correction</Badge>
          ) : (
            <Badge variant='warning'>{correctedCount} corrected</Badge>
          )}
          <Button
            variant='outline'
            size='sm'
            disabled={busy || draftIsIdentity}
            onClick={resetIdentity}
          >
            <Sparkles />
            Reset to identity
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={busy || !dirty}
            onClick={() => setDraft(view.physicalLights)}
          >
            <RotateCcw />
            Revert
          </Button>
          <Button
            size='sm'
            disabled={busy || activeMap == null || !dirty || hasConflicts}
            onClick={() => activeMap && onSaveMap(activeMap, draft)}
          >
            <Save />
            {activeMap ? `Save “${activeMap}”` : 'Save'}
          </Button>
        </div>
      </div>

      {hasConflicts && (
        <div className='border-destructive/40 bg-destructive/8 text-destructive-foreground flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm'>
          <AlertTriangle className='size-4 shrink-0' />
          <span>
            Two or more fixtures point at the same physical output (highlighted red).
            Each output can drive only one fixture — give the clashing fixtures
            distinct outputs to save.
          </span>
        </div>
      )}

      {/* Compact toolbar: which correction is active, auto-map candidates, save-as. */}
      <div className='flex shrink-0 flex-wrap items-center gap-2 rounded-md border px-3 py-2'>
        <span className='text-muted-foreground text-xs'>Mapping</span>
        <select
          className='border-input bg-background h-8 min-w-44 rounded-md border px-2 text-sm'
          value={activeMap ?? ''}
          disabled={busy}
          onChange={(e) => onActivate(e.target.value || null)}
        >
          <option value=''>None (identity)</option>
          {view.maps.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
        {activeMap && (
          <Button
            variant='ghost'
            size='sm'
            disabled={busy}
            title={`Delete “${activeMap}”`}
            onClick={() => onDeleteMap(activeMap)}
          >
            <Trash2 />
          </Button>
        )}

        <Separator orientation='vertical' className='h-6' />

        <Wand2 className='text-muted-foreground size-4' />
        <select
          className='border-input bg-background h-8 min-w-48 rounded-md border px-2 text-sm'
          value={strategy}
          disabled={busy}
          title={view.strategies.find((s) => s.id === strategy)?.description}
          onChange={(e) => {
            setStrategy(e.target.value);
            void applyStrategy(e.target.value);
          }}
        >
          <option value=''>Auto-map heuristic…</option>
          {view.strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <Separator orientation='vertical' className='h-6' />

        <Input
          className='h-8 w-36'
          placeholder='save as…'
          value={newName}
          disabled={busy}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button
          variant='outline'
          size='sm'
          disabled={busy || trimmedName.length === 0 || hasConflicts}
          onClick={() => {
            onSaveMap(trimmedName, draft);
            onActivate(trimmedName);
            setNewName('');
          }}
        >
          <FilePlus2 />
          {nameExists ? 'Overwrite' : 'Save as'}
        </Button>
      </div>

      {/* Two columns, each scrolling on its own: the page itself never scrolls,
          so the fixture table can't fall below the fold on a short screen. */}
      <div className='grid min-h-0 flex-1 gap-3 lg:grid-cols-2'>
        {/* Canvas + inspector */}
        <div className='flex min-h-0 flex-col gap-3'>
          <div className='bg-muted/30 flex min-h-0 flex-1 flex-col rounded-md border p-3'>
            <div className='flex min-h-0 flex-1 items-center justify-center'>
              <MappingCanvas
                view={view}
                draft={draft}
                selected={selected}
                conflicts={conflicts}
                onSelect={setSelected}
              />
            </div>
            <div className='text-muted-foreground mt-2 flex shrink-0 flex-wrap items-center gap-3 text-xs'>
              <span className='flex items-center gap-1'>
                <span className='bg-muted-foreground/40 inline-block size-2.5 rounded-full' /> identity
              </span>
              <span className='flex items-center gap-1'>
                <span className='bg-warning inline-block size-2.5 rounded-full' /> corrected
              </span>
              <span className='flex items-center gap-1'>
                <span className='bg-destructive inline-block size-2.5 rounded-full' /> conflict
              </span>
              <span className='flex items-center gap-1'>
                <span className='ring-primary inline-block size-2.5 rounded-full ring-2' /> selected
              </span>
            </div>
          </div>

          {/* Selected fixture — one compact strip instead of a tall card. */}
          <div className='shrink-0 rounded-md border p-3'>
            {selectedRow == null ? (
              <p className='text-muted-foreground text-xs'>
                Identity (physical = logical) is the default — you only need a map when the hardware
                is wired out of order. Tap a fixture to set the output it's actually wired to, or
                flash it on the live rig to see which laser lights.
              </p>
            ) : (
              <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-sm'>
                <span className='font-medium'>{selectedRow.label}</span>
                <span className='text-muted-foreground text-xs'>
                  logical <span className='font-mono'>{selectedRow.logical}</span> ·{' '}
                  {selectedRow.position}
                  {selectedRow.localIndex != null && (
                    <>
                      {' '}
                      · local <span className='font-mono'>{selectedRow.localIndex}</span>
                    </>
                  )}{' '}
                  · <span className='font-mono'>{selectedRow.oscTarget}</span>
                </span>
                <div className='flex items-center gap-1'>
                  <span className='text-muted-foreground text-xs'>output</span>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy || draftPhysical == null || draftPhysical <= 0}
                    onClick={() => assignPhysical(selected!, (draftPhysical ?? 0) - 1)}
                  >
                    −
                  </Button>
                  <Input
                    type='number'
                    min={0}
                    max={N - 1}
                    className='h-8 w-16 text-center'
                    disabled={busy}
                    value={draftPhysical ?? 0}
                    onChange={(e) => assignPhysical(selected!, Number(e.target.value))}
                  />
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy || draftPhysical == null || draftPhysical >= N - 1}
                    onClick={() => assignPhysical(selected!, (draftPhysical ?? 0) + 1)}
                  >
                    +
                  </Button>
                  {selected != null && conflicts.has(selected) ? (
                    <Badge variant='destructive'>duplicate</Badge>
                  ) : draftPhysical === selected ? (
                    <Badge variant='outline'>identity</Badge>
                  ) : (
                    <Badge variant='warning'>corrected</Badge>
                  )}
                </div>
                <Button
                  variant={identifyOn ? 'default' : 'outline'}
                  size='sm'
                  disabled={!brainLive}
                  title={brainLive ? undefined : "Start this project's brain to flash fixtures."}
                  onClick={() => setIdentifyOn((v) => !v)}
                >
                  <Zap />
                  {identifyOn ? 'Flashing — stop' : 'Identify'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Full chain table — its own scroll area with a sticky header. */}
        <div className='flex min-h-0 flex-col overflow-hidden rounded-md border'>
          <div ref={tableScrollRef} className='min-h-0 flex-1 overflow-auto'>
            <Table>
              <TableHeader className='bg-background sticky top-0 z-10'>
                <TableRow>
                  <TableHead className='w-14'>Log</TableHead>
                  <TableHead className='w-16'>Phys</TableHead>
                  <TableHead>Fixture</TableHead>
                  {distributed && <TableHead>Driven by</TableHead>}
                  {hasLocalIndex && <TableHead className='w-16'>Local</TableHead>}
                  <TableHead>OSC target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.map((row) => {
                  const physical = draft[row.logical] ?? row.physical;
                  const corrected = physical !== row.logical;
                  const conflict = conflicts.has(row.logical);
                  return (
                    <TableRow
                      key={row.logical}
                      data-logical={row.logical}
                      data-state={selected === row.logical ? 'selected' : undefined}
                      className={cn('cursor-pointer', conflict ? 'bg-destructive/8' : corrected && 'bg-warning/8')}
                      onClick={() => setSelected(row.logical)}
                    >
                      <TableCell className='font-mono text-sm'>{row.logical}</TableCell>
                      <TableCell
                        className={cn(
                          'font-mono text-sm',
                          conflict ? 'text-destructive font-medium' : corrected && 'text-warning-foreground font-medium'
                        )}
                      >
                        {physical}
                      </TableCell>
                      <TableCell className='text-sm'>
                        <span className='font-medium'>{row.label}</span>{' '}
                        <span className='text-muted-foreground text-xs'>{row.position}</span>
                      </TableCell>
                      {distributed && (
                        <TableCell className='text-sm'>{row.shardOwner ?? 'all cannons'}</TableCell>
                      )}
                      {hasLocalIndex && (
                        <TableCell className='text-muted-foreground font-mono text-xs'>
                          {row.localIndex ?? '—'}
                        </TableCell>
                      )}
                      <TableCell className='text-muted-foreground font-mono text-xs'>{row.oscTarget}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

/** SVG canvas laying fixtures out in their real geometry (grid or ring). */
function MappingCanvas({
  view,
  draft,
  selected,
  conflicts,
  onSelect
}: {
  view: LightMapView;
  draft: number[];
  selected: number | null;
  conflicts: Set<number>;
  onSelect: (logical: number) => void;
}) {
  const N = view.numCannons;
  const pad = 8;
  const span = 100 - pad * 2;
  const r = Math.max(2.4, Math.min(6, 40 / Math.sqrt(Math.max(N, 1))));

  return (
    <svg
      viewBox='0 0 100 100'
      preserveAspectRatio='xMidYMid meet'
      className='h-full w-full'
      role='img'
      aria-label='Light map canvas'
    >
      {view.rows.map((row) => {
        const physical = draft[row.logical] ?? row.physical;
        const corrected = physical !== row.logical;
        const conflict = conflicts.has(row.logical);
        const isSel = selected === row.logical;
        const cx = pad + row.u * span;
        const cy = pad + row.v * span;
        return (
          <g key={row.logical} className='cursor-pointer' onClick={() => onSelect(row.logical)}>
            {row.kind === 'projector' ? (
              <rect
                x={cx - r}
                y={cy - r}
                width={r * 2}
                height={r * 2}
                rx={r * 0.35}
                className={cn(
                  'transition-colors',
                  conflict ? 'fill-destructive' : corrected ? 'fill-warning' : 'fill-muted-foreground/40',
                  isSel && 'stroke-primary'
                )}
                strokeWidth={isSel ? 1.2 : 0}
              />
            ) : (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                className={cn(
                  'transition-colors',
                  conflict ? 'fill-destructive' : corrected ? 'fill-warning' : 'fill-muted-foreground/40',
                  isSel && 'stroke-primary'
                )}
                strokeWidth={isSel ? 1.2 : 0}
              />
            )}
            <text
              x={cx}
              y={cy + r * 0.35}
              textAnchor='middle'
              className='fill-background pointer-events-none select-none'
              style={{ fontSize: r * 0.9 }}
            >
              {row.logical}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
