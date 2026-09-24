import { useState } from 'react';

import { ANIMS, type Choice, FLOWS, gracePaintPattern, hasPaint, ringPaint, SPINS } from '@/lib/grace-paint';
import { type Gradient, gradientCss, GRADIENTS, pairGradient, PAIRS, type RingPair } from '@/lib/grace-rings';
import type { Look } from '@/lib/socket-state';
import { type GracePaintControls, paramsFromLook } from '@/lib/use-grace-paint';

import { ColorPicker, QuickColors } from './color-wheel';
import { ControlGrid, ControlGroup } from './control-grid';
import type { PreviewEasing } from './grace-tab';
import { MiniGridPreview, type PreviewFixture } from './mini-grid-preview';

const PILL_ACTIVE = { background: 'rgba(74,124,255,0.15)', border: '1px solid #4a7cff', color: '#4a7cff' };
const PILL_IDLE = { background: '#12121a', border: '1px solid #1a1a25', color: '#888898' };

function Pill({ label, active, onClick, title }: { label: string; active: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="transition-all active:scale-95"
      style={{ ...(active ? PILL_ACTIVE : PILL_IDLE), height: 36, padding: '0 12px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}
    >
      {label}
    </button>
  );
}

type ColourTab = 'gradients' | 'rings' | 'paint';

/** Small glyphs so the three colour sources read at a glance. */
function ColourTabIcon({ tab }: { tab: ColourTab }) {
  const size = 16;
  if (tab === 'gradients') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <defs>
          <linearGradient id="gp-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff5a5a" />
            <stop offset="0.5" stopColor="#ffd35a" />
            <stop offset="1" stopColor="#5a8cff" />
          </linearGradient>
        </defs>
        <circle cx="8" cy="8" r="6.5" fill="url(#gp-grad)" />
      </svg>
    );
  }
  if (tab === 'rings') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="#ff7a3d" strokeWidth="2.2" />
        <circle cx="8" cy="8" r="2.6" fill="#3d9bff" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M2.5 13.5c0-2.2 1.3-3.3 3.2-3.3l1.4 1.4c0 1.9-1.1 3.2-3.3 3.2-.6 0-1-.4-1.3-1.3z" fill="#e8e8f0" />
      <path d="M6.3 9.6l5.6-5.6a1.3 1.3 0 0 1 1.8 1.8L8.1 11.4z" fill="#a88bff" />
    </svg>
  );
}

const COLOUR_TABS: { key: ColourTab; label: string }[] = [
  { key: 'gradients', label: 'Gradients' },
  { key: 'rings', label: 'Ring Colours' },
  { key: 'paint', label: 'Paint' }
];

function PairSwatch({ pair, active, onClick }: { pair: RingPair; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`${pair.name} — outer / inner`}
      className="relative overflow-hidden transition-all active:scale-93"
      style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        background: pairGradient(pair),
        border: active ? '2.5px solid #fff' : '2.5px solid transparent'
      }}
    >
      <span
        className="absolute bottom-0.5 left-0 right-0 text-center font-semibold"
        style={{ fontSize: 9, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)', letterSpacing: '0.02em' }}
      >
        {pair.name}
      </span>
    </button>
  );
}

function GradientSwatch({ gradient, active, onClick }: { gradient: Gradient; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={gradient.name}
      className="relative overflow-hidden transition-all active:scale-93"
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: gradientCss(gradient),
        border: active ? '2.5px solid #fff' : '2.5px solid transparent'
      }}
    >
      <span
        className="absolute bottom-0.5 left-0 right-0 text-center font-semibold"
        style={{ fontSize: 8, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)', letterSpacing: '0.02em' }}
      >
        {gradient.name}
      </span>
    </button>
  );
}

function AnimTile({
  anim,
  active,
  onClick,
  speed,
  easing,
  params,
  fixtures
}: {
  anim: Choice;
  active: boolean;
  onClick: () => void;
  speed: number;
  easing: PreviewEasing;
  params: Record<string, unknown>;
  fixtures?: PreviewFixture[];
}) {
  const tileSize = 96;
  return (
    <button
      onClick={onClick}
      title={anim.hint}
      className="relative overflow-hidden transition-all active:scale-93"
      style={{
        width: tileSize,
        height: tileSize,
        borderRadius: 16,
        background: '#0a0a12',
        border: active ? '2.5px solid #fff' : '2.5px solid transparent'
      }}
    >
      <MiniGridPreview
        source={gracePaintPattern()}
        speed={speed}
        attack={easing.attack}
        alpha={easing.alpha}
        params={params}
        size={tileSize}
        isPattern
        fixtures={fixtures}
      />
      <span
        className="absolute bottom-1 left-0 right-0 text-center text-white font-semibold"
        style={{ fontSize: 9, textShadow: '0 1px 4px rgba(0,0,0,0.8)', letterSpacing: '0.02em' }}
      >
        {anim.name}
      </span>
    </button>
  );
}

const LOOK_TILE = 72;

/**
 * Looks: GracePaint states saved on the brain (every iPad sees the same list).
 * Tap to recall on top of the running animation; Save snapshots what is on the
 * window now; Edit exposes rename/delete.
 */
function LooksStrip({
  looks,
  current,
  speed,
  easing,
  fixtures,
  onSave,
  onApply,
  onRename,
  onDelete
}: {
  looks: Look[];
  current: Record<string, unknown>;
  speed: number;
  easing: PreviewEasing;
  fixtures?: PreviewFixture[];
  onSave: (name: string) => void;
  onApply: (look: Look) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const count = fixtures?.length ?? 0;
  const currentJson = JSON.stringify(current);
  const save = () => {
    const name = window.prompt('Name this look', `Look ${looks.length + 1}`);
    if (name === null) return;
    onSave(name);
  };
  const rename = (look: Look) => {
    const name = window.prompt('Rename look', look.name);
    if (name === null || !name.trim() || name.trim() === look.name) return;
    onRename(look.id, name.trim());
  };
  const remove = (look: Look) => {
    if (window.confirm(`Delete "${look.name}"?`)) onDelete(look.id);
  };
  return (
    <ControlGroup label={`Looks${looks.length ? ` (${looks.length})` : ''}`}>
      <div className="flex gap-2 items-start overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        <button
          onClick={save}
          className="flex flex-col items-center justify-center shrink-0 transition-all active:scale-93"
          style={{
            width: LOOK_TILE,
            height: LOOK_TILE,
            borderRadius: 14,
            background: '#1a1a25',
            border: '1.5px dashed #3a3a48',
            color: '#c8c8d8'
          }}
          title="Save what is on the window now as a Look"
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
          <span className="text-xs font-medium mt-1">Save</span>
        </button>
        {looks.map((look) => {
          const params = count ? paramsFromLook(look, count) : null;
          const active = !!params && JSON.stringify(params) === currentJson;
          return (
            <div key={look.id} className="relative shrink-0" style={{ width: LOOK_TILE }}>
              <button
                onClick={() => (editing ? rename(look) : onApply(look))}
                title={editing ? 'Rename' : `Recall "${look.name}"`}
                className="relative overflow-hidden transition-all active:scale-93 w-full"
                style={{
                  height: LOOK_TILE,
                  borderRadius: 14,
                  background: '#0a0a12',
                  border: active ? '2.5px solid #fff' : '2.5px solid transparent'
                }}
              >
                {params ? (
                  <MiniGridPreview
                    source={gracePaintPattern()}
                    speed={speed}
                    attack={easing.attack}
                    alpha={easing.alpha}
                    params={{ ...params }}
                    size={LOOK_TILE}
                    isPattern
                    fixtures={fixtures}
                  />
                ) : null}
                <span
                  className="absolute bottom-1 left-0 right-0 text-center text-white font-semibold truncate px-1"
                  style={{ fontSize: 9, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                >
                  {look.name}
                </span>
              </button>
              {editing ? (
                <button
                  onClick={() => remove(look)}
                  className="absolute -top-1 -right-1 rounded-full text-white text-xs font-bold flex items-center justify-center"
                  style={{ width: 20, height: 20, background: '#d44', border: '1.5px solid #0a0a12' }}
                  title="Delete look"
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
        {looks.length ? (
          <button
            onClick={() => setEditing((e) => !e)}
            className="self-center shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: editing ? '#2563eb' : '#1a1a25',
              color: editing ? '#fff' : '#888898',
              border: '1px solid ' + (editing ? '#3b82f6' : '#2a2a35')
            }}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        ) : null}
      </div>
    </ControlGroup>
  );
}

/**
 * GracePaint: Paint's wheel on the left, and on the right the two layers the
 * pattern keeps apart — the colour of the unpainted panes (a gradient and how
 * it moves) and the brightness choreography. Touch the window to paint a
 * pane's colour; whatever animation is running keeps running.
 */
export function GracePaintTab({
  controls,
  looks,
  hue,
  sat,
  bright,
  onHue,
  onSat,
  onBright,
  animSpeed,
  easing,
  fixtures,
  compact = false
}: {
  controls: GracePaintControls;
  looks: Look[];
  hue: number;
  sat: number;
  bright: number;
  onHue: (h: number) => void;
  onSat: (s: number) => void;
  onBright: (b: number) => void;
  /** The header speed multiplier, so previews run at the receiver's rate. */
  animSpeed: number;
  easing: PreviewEasing;
  fixtures?: PreviewFixture[];
  compact?: boolean;
}) {
  const [colourTab, setColourTab] = useState<ColourTab>('gradients');
  const { params, running, update, fill, clearPaint, setGradient, applyLook, saveLook, renameLook, deleteLook } = controls;
  const painted = hasPaint(params.paint);
  const radii = fixtures?.map((f) => f.radius) ?? [];
  const activePair = PAIRS.find((p) => radii.length > 0 && ringPaint(radii, p).every((v, k) => v === params.paint[k]));
  const activeGradient = GRADIENTS.find(
    (g) => g.stops.length === params.stops.length && g.stops.every(([h, s], k) => params.stops[k][0] === h && params.stops[k][1] === s)
  );
  const previewParams: Record<string, unknown> = { ...params };

  return (
    <div className="flex flex-col gap-4">
      <LooksStrip
        looks={looks}
        current={previewParams}
        speed={animSpeed}
        easing={easing}
        fixtures={fixtures}
        onSave={saveLook}
        onApply={applyLook}
        onRename={renameLook}
        onDelete={deleteLook}
      />
      <div className="flex gap-1 px-2 flex-wrap items-center">
        {COLOUR_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setColourTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: colourTab === t.key ? '#2563eb' : '#1a1a25',
              color: colourTab === t.key ? '#fff' : '#888898',
              border: '1px solid ' + (colourTab === t.key ? '#3b82f6' : '#2a2a35')
            }}
          >
            <ColourTabIcon tab={t.key} />
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {painted ? (
            <button
              onClick={clearPaint}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{ background: '#1a1a25', color: '#888898', border: '1px solid #2a2a35' }}
              title="Let every pane follow the gradient again"
            >
              Clear paint
            </button>
          ) : null}
        </div>
      </div>

      {colourTab === 'gradients' && (
        <ControlGrid minCellWidth={220}>
          <ControlGroup label={`Gradient — ${activeGradient?.name ?? 'Custom'}`}>
            <div className="flex gap-2 flex-wrap">
              {GRADIENTS.map((g) => (
                <GradientSwatch
                  key={g.name}
                  gradient={g}
                  active={g === activeGradient && !painted}
                  onClick={() => setGradient(g.stops.map(([h, s]) => [h, s] as [number, number]))}
                />
              ))}
            </div>
            <div className="pt-1" style={{ fontSize: 10, color: '#888898' }}>
              Takes over the whole window; paint on top of it afterwards
            </div>
          </ControlGroup>
          <ControlGroup label="Rotation">
            <div className="flex gap-2 flex-wrap">
              {FLOWS.map((f) => (
                <Pill key={f.key} label={f.name} active={params.flow === f.key} onClick={() => update('flow', f.key)} title={f.hint} />
              ))}
            </div>
          </ControlGroup>
          <ControlGroup label="Rotation Speed">
            <div className="flex gap-2 flex-wrap">
              {SPINS.map((s) => (
                <Pill key={s.key} label={s.name} active={params.spin === s.key} onClick={() => update('spin', s.key)} />
              ))}
            </div>
            <div className="pt-1" style={{ fontSize: 10, color: '#888898' }}>
              Medium is one lap a minute; the main Speed slider scales everything
            </div>
          </ControlGroup>
        </ControlGrid>
      )}

      {colourTab === 'rings' && (
        <ControlGroup label={`Ring Colours — ${activePair?.name ?? (painted ? 'Custom' : 'Gradient')}`}>
          <div className="flex gap-2.5 flex-wrap">
            {PAIRS.map((p) => (
              <PairSwatch key={p.name} pair={p} active={p === activePair} onClick={() => update('paint', ringPaint(radii, p))} />
            ))}
          </div>
          <div className="pt-1" style={{ fontSize: 10, color: '#888898' }}>
            Paints the outer ring one colour and the inner ring and centre the other.
          </div>
        </ControlGroup>
      )}

      {colourTab === 'paint' && (
        <ColorPicker
          hue={hue}
          saturation={sat}
          brightness={bright}
          onHueChange={onHue}
          onSatChange={onSat}
          onBrightChange={onBright}
          compact={compact}
        >
          <ControlGroup label="Paint">
            <QuickColors
              hue={hue}
              saturation={sat}
              brightness={bright}
              onHueChange={onHue}
              onSatChange={onSat}
              onBrightChange={onBright}
            />
            <div className="flex gap-2 pt-1">
              <Pill label="Fill all" active={false} onClick={() => fill(hue, sat)} title="Paint every pane this colour" />
            </div>
            <p className="text-sm" style={{ color: 'rgba(136,136,152,0.5)' }}>
              Touch a pane to give it this colour. Painted panes keep it; the rest
              follow the gradient. Brightness comes from the animation either way.
            </p>
          </ControlGroup>
        </ColorPicker>
      )}

      <ControlGroup label="Animation">
        <div className="flex gap-2.5 flex-wrap overflow-y-auto" style={{ maxHeight: 340 }}>
          {ANIMS.map((a) => (
            <AnimTile
              key={a.key}
              anim={a}
              active={running && params.anim === a.key}
              onClick={() => update('anim', a.key)}
              speed={animSpeed}
              easing={easing}
              params={{ ...previewParams, anim: a.key }}
              fixtures={fixtures}
            />
          ))}
        </div>
      </ControlGroup>
    </div>
  );
}
