import { RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { EditableConfig, LayoutChoice } from '@/types/ipc';

type Shape = 'preset' | 'grid' | 'ring' | 'annulus' | 'rings' | 'filledRing';

/** Cannons per ring, outermost first — "12,8,4,1". */
function ringCountsValid(text: string | undefined): boolean {
  const parts = (text ?? '').split(',').map((p) => p.trim());
  return parts.length > 0 && parts.every((p) => /^\d+$/.test(p) && Number(p) >= 1);
}

function shapeOf(layout: LayoutChoice): Shape {
  if (layout.preset) return 'preset';
  return (layout.kind as Shape) ?? 'preset';
}

function Choice<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className='flex flex-wrap gap-2'>
      {options.map((o) => (
        <Button
          key={o.value}
          type='button'
          size='sm'
          variant={value === o.value ? 'default' : 'outline'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  width = 'w-40',
  inputMode
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  width?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className={width}
      />
    </div>
  );
}

interface ConfigRouteProps {
  project: string | null;
  config: EditableConfig | null;
  loading: boolean;
  onSave: (config: EditableConfig) => Promise<void>;
  busy: boolean;
}

/** Config editor for one project — tabbed over layout / network / receiver. Binds
 *  to the flattened EditableConfig; save folds edits back into the stored config
 *  (osc, sync, shard, debug preserved by main). Mirrors `wavegrid config set`. */
export function ConfigRoute({ project, config, loading, onSave, busy }: ConfigRouteProps) {
  const [draft, setDraft] = React.useState<EditableConfig | null>(config);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setDraft(config);
    setSaved(false);
  }, [config]);

  if (!project) {
    return (
      <div className='p-4'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <SlidersHorizontal />
            </EmptyMedia>
            <EmptyTitle>No project selected</EmptyTitle>
            <EmptyDescription>Pick a project on the Projects screen to edit its config.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (loading || !draft) {
    return <div className='text-muted-foreground p-4 text-sm'>Loading config…</div>;
  }

  const shape = shapeOf(draft.layout);
  const set = (patch: Partial<EditableConfig>) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
  };
  const setLayout = (layout: LayoutChoice) => set({ layout });

  const numeric = (v: string) => (v === '' ? NaN : Number(v));
  const layoutValid =
    shape === 'preset'
      ? !!draft.layout.preset
      : shape === 'grid'
        ? Number(draft.layout.cols) >= 1 && Number(draft.layout.rows) >= 1
        : shape === 'rings'
          ? ringCountsValid(draft.layout.ringCounts)
          : shape === 'annulus'
            ? Number(draft.layout.count) >= 1 &&
            Number(draft.layout.innerRadius) >= 0 &&
            Number(draft.layout.innerRadius) < 1
            : Number(draft.layout.count) >= 1;
  const valid =
    layoutValid &&
    Number.isInteger(numeric(String(draft.serverPort))) &&
    draft.serverPort > 0 &&
    Number.isInteger(numeric(String(draft.uiPort))) &&
    draft.uiPort > 0 &&
    draft.serverHost.trim() !== '' &&
    Number.isFinite(draft.alpha) &&
    draft.alpha >= 0 &&
    draft.alpha <= 1 &&
    Number.isInteger(draft.fallbackDelay) &&
    draft.fallbackDelay >= 0 &&
    Number.isInteger(draft.simpleModeMax) &&
    draft.simpleModeMax > 0;

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const save = async () => {
    await onSave(draft);
    setSaved(true);
  };

  return (
    <div className='flex flex-col gap-4 p-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <span className='font-medium'>{project}</span>
          <Badge variant='outline'>
            {draft.layoutLabel} · {draft.cannonCount} cannons
          </Badge>
        </div>
        <div className='flex items-center gap-2'>
          {saved && !dirty && <span className='text-muted-foreground text-xs'>Saved</span>}
          {dirty && (
            <Button variant='ghost' size='sm' disabled={busy} onClick={() => setDraft(config)}>
              <RotateCcw />
              Revert
            </Button>
          )}
          <Button size='sm' disabled={busy || !valid || !dirty} onClick={save}>
            <Save />
            Save
          </Button>
        </div>
      </div>

      <Tabs defaultValue='layout'>
        <TabsList>
          <TabsTrigger value='layout'>Layout</TabsTrigger>
          <TabsTrigger value='network'>Network</TabsTrigger>
          <TabsTrigger value='receiver'>Receiver</TabsTrigger>
        </TabsList>

        <TabsContent value='layout' className='flex flex-col gap-4 pt-4'>
          <div className='flex flex-col gap-1.5'>
            <Label>Shape</Label>
            <Choice<Shape>
              value={shape}
              onChange={(next) => {
                if (next === 'preset') setLayout({ preset: draft.layout.preset ?? '' });
                else if (next === 'grid')
                  setLayout({ kind: 'grid', cols: draft.layout.cols ?? 7, rows: draft.layout.rows ?? 7 });
                else if (next === 'rings')
                  setLayout({ kind: 'rings', ringCounts: draft.layout.ringCounts ?? '12,8,4,1' });
                else if (next === 'annulus')
                  setLayout({
                    kind: 'annulus',
                    count: draft.layout.count ?? 25,
                    innerRadius: draft.layout.innerRadius ?? 0.5
                  });
                else setLayout({ kind: next, count: draft.layout.count ?? 6 });
              }}
              options={[
                { value: 'preset', label: 'Preset' },
                { value: 'grid', label: 'Grid' },
                { value: 'ring', label: 'Ring' },
                { value: 'annulus', label: 'Ring w/ hole' },
                { value: 'rings', label: 'Concentric rings' },
                { value: 'filledRing', label: 'Filled ring' }
              ]}
            />
          </div>
          {shape === 'preset' && (
            <Field
              id='cfg-preset'
              label='Preset id'
              value={draft.layout.preset ?? ''}
              onChange={(v) => setLayout({ preset: v })}
            />
          )}
          {shape === 'grid' && (
            <div className='flex gap-4'>
              <Field
                id='cfg-cols'
                label='Columns'
                width='w-28'
                inputMode='numeric'
                value={String(draft.layout.cols ?? '')}
                onChange={(v) => setLayout({ kind: 'grid', cols: Number(v), rows: draft.layout.rows ?? 7 })}
              />
              <Field
                id='cfg-rows'
                label='Rows'
                width='w-28'
                inputMode='numeric'
                value={String(draft.layout.rows ?? '')}
                onChange={(v) => setLayout({ kind: 'grid', cols: draft.layout.cols ?? 7, rows: Number(v) })}
              />
            </div>
          )}
          {(shape === 'ring' || shape === 'filledRing') && (
            <Field
              id='cfg-count'
              label='Cannons'
              width='w-28'
              inputMode='numeric'
              value={String(draft.layout.count ?? '')}
              onChange={(v) => setLayout({ kind: shape, count: Number(v) })}
            />
          )}
          {shape === 'annulus' && (
            <div className='flex gap-4'>
              <Field
                id='cfg-count'
                label='Cannons'
                width='w-28'
                inputMode='numeric'
                value={String(draft.layout.count ?? '')}
                onChange={(v) =>
                  setLayout({ kind: 'annulus', count: Number(v), innerRadius: draft.layout.innerRadius ?? 0.5 })
                }
              />
              <Field
                id='cfg-inner'
                label='Hole size (0–1)'
                width='w-28'
                inputMode='decimal'
                value={String(draft.layout.innerRadius ?? '')}
                onChange={(v) =>
                  setLayout({ kind: 'annulus', count: draft.layout.count ?? 25, innerRadius: Number(v) })
                }
              />
            </div>
          )}
          {shape === 'rings' && (
            <Field
              id='cfg-rings'
              label='Cannons per ring, outermost first'
              value={draft.layout.ringCounts ?? ''}
              onChange={(v) => setLayout({ kind: 'rings', ringCounts: v })}
            />
          )}
          <div className='flex flex-col gap-1.5'>
            <Label>Run mode</Label>
            <Choice<EditableConfig['mode']>
              value={draft.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'simple', label: 'Simple' },
                { value: 'distributed', label: 'Distributed' }
              ]}
            />
          </div>
          <Field
            id='cfg-simplemax'
            label='Simple mode ≤ cannons'
            width='w-28'
            inputMode='numeric'
            value={String(draft.simpleModeMax)}
            onChange={(v) => set({ simpleModeMax: Number(v) })}
          />
        </TabsContent>

        <TabsContent value='network' className='flex flex-col gap-4 pt-4'>
          <div className='flex flex-wrap gap-4'>
            <Field
              id='cfg-host'
              label='Server host'
              value={draft.serverHost}
              onChange={(v) => set({ serverHost: v })}
            />
            <Field
              id='cfg-port'
              label='Server port'
              width='w-28'
              inputMode='numeric'
              value={String(draft.serverPort)}
              onChange={(v) => set({ serverPort: Number(v) })}
            />
            <Field
              id='cfg-uiport'
              label='UI port'
              width='w-28'
              inputMode='numeric'
              value={String(draft.uiPort)}
              onChange={(v) => set({ uiPort: Number(v) })}
            />
          </div>
        </TabsContent>

        <TabsContent value='receiver' className='flex flex-col gap-4 pt-4'>
          <div className='flex flex-wrap gap-4'>
            <Field
              id='cfg-alpha'
              label='Alpha (0–1)'
              width='w-28'
              inputMode='decimal'
              value={String(draft.alpha)}
              onChange={(v) => set({ alpha: Number(v) })}
            />
            <Field
              id='cfg-fallback'
              label='Fallback delay (ms)'
              width='w-36'
              inputMode='numeric'
              value={String(draft.fallbackDelay)}
              onChange={(v) => set({ fallbackDelay: Number(v) })}
            />
          </div>
          <span className='text-muted-foreground text-xs'>
            OSC targets, sharding, and config sync are managed on their own screens — they are
            preserved when you save here.
          </span>
        </TabsContent>
      </Tabs>
    </div>
  );
}
