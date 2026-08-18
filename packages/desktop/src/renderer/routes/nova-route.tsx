import {
  AMBER_LOOKS,
  type AmberLook,
  applyScene,
  evaluateAnimation,
  type GridCell
} from '@wavegrid/animations';
import { type Layout, ringLayout } from '@wavegrid/layout';
import { CircleOff, Flame, Play } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface NovaRouteProps {
  project: string | null;
  /** Resolved layout name, e.g. "Nova (6-laser ring)". */
  layoutLabel: string | null;
  /** How many lasers the project drives. Falls back to the six-laser ring. */
  count: number;
  /** True when this project's brain is live, so a look can actually run. */
  brainLive: boolean;
  onApply: (look: string) => void;
  onSpeed: (value: number) => void;
  onBlackout: () => void;
}

const PRESETS = AMBER_LOOKS.filter((look) => look.kind === 'scene');
const MOTION = AMBER_LOOKS.filter((look) => look.kind === 'animation');

/**
 * Nova — the amber look panel.
 *
 * Nova is a ring of six lasers running one colour, so the whole vocabulary is
 * *where* on the circle the light is and *how bright* it is. Each tile previews
 * its look on a real ring of the project's own size, evaluated with the same
 * scene/animation code the brain runs, so what the operator picks is what the
 * rig does. Picking a tile sends only the look's name; the brain owns the show.
 */
export function NovaRoute({
  project,
  layoutLabel,
  count,
  brainLive,
  onApply,
  onSpeed,
  onBlackout
}: NovaRouteProps) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [speed, setSpeed] = React.useState(1);

  const layout = React.useMemo(() => ringLayout({ count: Math.max(3, count || 6) }), [count]);
  const tick = useTick(speed);

  const select = (look: AmberLook) => {
    setSelected(look.id);
    onApply(look.id);
  };

  if (!project) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Flame />
          </EmptyMedia>
          <EmptyTitle>No project in use</EmptyTitle>
          <EmptyDescription>
            Choose a project in the sidebar to drive its lasers from here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className='flex h-full min-h-0 flex-col gap-3'>
      <div className='flex shrink-0 items-center justify-between gap-4'>
        <div className='flex items-baseline gap-2'>
          <span className='font-medium'>{project}</span>
          <span className='text-muted-foreground text-sm'>
            {layoutLabel ?? 'ring'} · {layout.count} lasers
          </span>
        </div>
        <div className='flex items-center gap-2'>
          {brainLive ? (
            <Badge variant='success'>Live</Badge>
          ) : (
            <Badge variant='warning'>Show stopped</Badge>
          )}
          <Button variant='outline' size='sm' disabled={!brainLive} onClick={() => {
            setSelected(null);
            onBlackout();
          }}>
            <CircleOff />
            Blackout
          </Button>
        </div>
      </div>

      {!brainLive && (
        <div className='text-muted-foreground shrink-0 rounded-md border px-3 py-2 text-xs'>
          The previews below run locally. Start the show on the Show screen to send a look to the
          lasers.
        </div>
      )}

      <div className='grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,20rem)_1fr]'>
        {/* What's running now, at ring scale, plus how fast it travels. */}
        <div className='flex min-h-0 flex-col gap-3 rounded-md border p-3'>
          <div className='flex min-h-0 flex-1 items-center justify-center'>
            <RingPreview look={selected} layout={layout} tick={tick} size={220} />
          </div>
          <div className='shrink-0'>
            <div className='flex items-baseline justify-between text-sm'>
              <span className='font-medium'>{labelOf(selected) ?? 'Nothing selected'}</span>
              <span className='text-muted-foreground text-xs'>{descriptionOf(selected)}</span>
            </div>
          </div>
          <Separator />
          <div className='flex shrink-0 items-center gap-3'>
            <span className='text-muted-foreground w-12 text-xs'>Speed</span>
            <input
              type='range'
              min={0.1}
              max={3}
              step={0.1}
              value={speed}
              className='flex-1'
              aria-label='Animation speed'
              onChange={(e) => {
                const next = Number(e.target.value);
                setSpeed(next);
                onSpeed(next);
              }}
            />
            <span className='w-10 text-right font-mono text-xs'>{speed.toFixed(1)}×</span>
          </div>
          <p className='text-muted-foreground shrink-0 text-xs'>
            Speed only moves the animations — a preset holds still until you pick another.
          </p>
        </div>

        {/* The looks themselves. */}
        <div className='min-h-0 overflow-auto pr-1'>
          <LookGroup
            title='Amber presets'
            hint='Still light. Pick one and it stays.'
            looks={PRESETS}
            layout={layout}
            tick={tick}
            selected={selected}
            onSelect={select}
          />
          <LookGroup
            title='Amber in motion'
            hint='Brightness travelling around the ring — same amber throughout.'
            looks={MOTION}
            layout={layout}
            tick={tick}
            selected={selected}
            onSelect={select}
          />
        </div>
      </div>
    </div>
  );
}

function LookGroup({
  title,
  hint,
  looks,
  layout,
  tick,
  selected,
  onSelect
}: {
  title: string;
  hint: string;
  looks: AmberLook[];
  layout: Layout;
  tick: number;
  selected: string | null;
  onSelect: (look: AmberLook) => void;
}) {
  return (
    <section className='mb-4'>
      <div className='mb-2 flex items-baseline gap-2'>
        <h2 className='text-sm font-medium'>{title}</h2>
        <span className='text-muted-foreground text-xs'>{hint}</span>
      </div>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4'>
        {looks.map((look) => (
          <button
            key={look.id}
            type='button'
            title={look.description}
            onClick={() => onSelect(look)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-md border p-2 transition-colors',
              'hover:bg-muted/40',
              selected === look.id && 'border-primary bg-muted/60'
            )}
          >
            <RingPreview look={look.id} layout={layout} tick={tick} size={84} />
            <span className='flex items-center gap-1 text-xs font-medium'>
              {look.kind === 'animation' && <Play className='size-3' />}
              {look.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * The ring, drawn from the layout's own fixture positions and lit by evaluating
 * the look itself — no hand-written approximation of what a look looks like.
 */
function RingPreview({
  look,
  layout,
  tick,
  size
}: {
  look: string | null;
  layout: Layout;
  tick: number;
  size: number;
}) {
  const frame = React.useMemo(() => renderLook(look, layout, tick), [look, layout, tick]);
  const pad = 14;
  const span = 100 - pad * 2;
  const r = Math.max(3, Math.min(9, 30 / Math.sqrt(layout.count)));

  return (
    <svg
      viewBox='0 0 100 100'
      width={size}
      height={size}
      role='img'
      aria-label={look ? `${look} preview` : 'ring preview'}
    >
      <circle cx={50} cy={50} r={span / 2} className='stroke-border' fill='none' strokeWidth={0.4} />
      {layout.fixtures.map((f, i) => {
        const cell = frame?.[i];
        return (
          <circle
            key={f.index}
            cx={pad + f.u * span}
            cy={pad + f.v * span}
            r={r}
            fill={cell ? hsbCss(cell.h, cell.s, cell.b) : 'transparent'}
            className={cell ? undefined : 'stroke-muted-foreground/40'}
            strokeWidth={cell ? 0 : 0.8}
          />
        );
      })}
    </svg>
  );
}

/** Evaluate one look into per-fixture HSB, exactly as the brain would. */
function renderLook(
  look: string | null,
  layout: Layout,
  tick: number
): Array<{ h: number; s: number; b: number }> | null {
  const def = look ? AMBER_LOOKS.find((l) => l.id === look) : null;
  if (!def) return null;
  const grid: GridCell[] = layout.fixtures.map(() => ({
    h: 0,
    s: 0,
    b: 0,
    targetH: 0,
    targetS: 0,
    targetB: 0
  }));
  if (def.kind === 'scene') applyScene(grid, def.id, layout);
  else evaluateAnimation(grid, def.id, tick, 1, layout);
  return grid.map((c) => ({ h: c.targetH, s: c.targetS, b: c.targetB }));
}

/** HSB (the wire format) → a CSS colour, for previews only. */
function hsbCss(h: number, s: number, b: number): string {
  const v = Math.max(0, Math.min(100, b)) / 100;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const l = v * (1 - sat / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return `hsl(${h.toFixed(0)} ${(sl * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
}

function labelOf(id: string | null): string | null {
  return AMBER_LOOKS.find((l) => l.id === id)?.label ?? null;
}

function descriptionOf(id: string | null): string {
  return AMBER_LOOKS.find((l) => l.id === id)?.description ?? 'Pick a look to send it to the ring.';
}

/**
 * One clock for every preview on the screen, advanced the way the brain
 * advances its own: 60 ticks a second scaled by the speed multiplier, so a
 * preview and the rig agree on how fast a look travels.
 */
function useTick(speed: number): number {
  const [tick, setTick] = React.useState(0);
  const speedRef = React.useRef(speed);
  speedRef.current = speed;

  React.useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let current = 0;
    const step = (now: number) => {
      const elapsed = Math.min(100, now - last);
      last = now;
      current += (elapsed / (1000 / 60)) * speedRef.current;
      setTick(current);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return tick;
}
