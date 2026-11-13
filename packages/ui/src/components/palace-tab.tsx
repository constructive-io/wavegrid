import { useState } from 'react';

import { gradientCss, GRADIENTS, hsbCss } from '@/lib/grace-rings';
import { activeScene, ANIMS, type Choice, DUOS, FLOWS, hasPaint, SCENES, SPANS, SPINS, WHO } from '@/lib/palace';
import type { Look } from '@/lib/socket-state';
import type { PalaceControls } from '@/lib/use-palace';

import { ColorPicker, QuickColors } from './color-wheel';
import { ControlGrid, ControlGroup } from './control-grid';
import type { PreviewEasing } from './grace-tab';
import { MiniGridPreview, type PreviewFixture } from './mini-grid-preview';

const PILL_ACTIVE = { background: 'rgba(74,124,255,0.15)', border: '1px solid #4a7cff', color: '#4a7cff' };
const PILL_IDLE = { background: '#12121a', border: '1px solid #1a1a25', color: '#888898' };
const HINT = { fontSize: 10, color: '#888898' };

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

function Swatch({ name, background, active, onClick }: { name: string; background: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={name}
      className="relative overflow-hidden transition-all active:scale-93"
      style={{ width: 52, height: 52, borderRadius: 12, background, border: active ? '2.5px solid #fff' : '2.5px solid transparent' }}
    >
      <span
        className="absolute bottom-0.5 left-0 right-0 text-center font-semibold"
        style={{ fontSize: 8, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)', letterSpacing: '0.02em' }}
      >
        {name}
      </span>
    </button>
  );
}

/** A tile that runs the Palace pattern on the whole rig with `params`. */
function Tile({
  label, title, active, onClick, code, params, speed, easing, fixtures, width
}: {
  label: string;
  title?: string;
  active: boolean;
  onClick: () => void;
  code: string;
  params: Record<string, unknown>;
  speed: number;
  easing: PreviewEasing;
  fixtures?: PreviewFixture[];
  width: number;
}) {
  const height = Math.round(width * 0.42);
  return (
    <button
      onClick={onClick}
      title={title}
      className="relative overflow-hidden transition-all active:scale-95"
      style={{ width, height: height + 18, borderRadius: 12, background: '#0a0a12', border: active ? '2.5px solid #fff' : '2.5px solid #1a1a25' }}
    >
      <MiniGridPreview
        source={code}
        isPattern
        speed={speed}
        attack={easing.attack}
        alpha={easing.alpha}
        params={params}
        size={width - 5}
        height={height}
        fixtures={fixtures}
      />
      <span className="absolute bottom-0.5 left-0 right-0 text-center text-white font-semibold" style={{ fontSize: 10, letterSpacing: '0.02em' }}>
        {label}
      </span>
    </button>
  );
}

type Sub = 'scenes' | 'colour' | 'motion' | 'paint';
const SUBS: { key: Sub; label: string }[] = [
  { key: 'scenes', label: 'Scenes' },
  { key: 'colour', label: 'Colour' },
  { key: 'motion', label: 'Motion' },
  { key: 'paint', label: 'Paint' }
];

function Trim({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2" style={{ fontSize: 12, color: '#888898' }}>
      <span style={{ width: 74 }}>{label}</span>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" />
      <span style={{ width: 28, textAlign: 'right' }}>{value}</span>
    </label>
  );
}

/**
 * Palace: one-tap scenes and colour/motion building blocks for the Palace of
 * Fine Arts rig. Colour and brightness only. Touching the rig paints a
 * fixture's hue on any sub-tab; the motion keeps running.
 */
export function PalaceTab({
  controls, looks, hue, sat, bright, onHue, onSat, onBright, animSpeed, easing, fixtures, compact = false
}: {
  controls: PalaceControls;
  looks: Look[];
  hue: number;
  sat: number;
  bright: number;
  onHue: (h: number) => void;
  onSat: (s: number) => void;
  onBright: (b: number) => void;
  animSpeed: number;
  easing: PreviewEasing;
  fixtures?: PreviewFixture[];
  compact?: boolean;
}) {
  const [sub, setSub] = useState<Sub>('scenes');
  const { code, params, running, update, fill, fillKind, clearPaint, setGradient, setDuo, applyScene, applyLook, saveLook, deleteLook } = controls;
  const painted = hasPaint(params.paint);
  const scene = running ? activeScene(params) : undefined;
  const tileW = compact ? 116 : 124;
  const same = (a: [number, number][], b: [number, number][]) => a.length === b.length && a.every(([h, s], k) => b[k][0] === h && b[k][1] === s);
  const palaceLooks = looks.filter((l) => l.params.kind === 'palace');
  const tile = (key: string, label: string, p: Record<string, unknown>, active: boolean, onClick: () => void, title?: string) => (
    <Tile key={key} label={label} title={title} active={active} onClick={onClick} code={code} params={p}
      speed={animSpeed} easing={easing} fixtures={fixtures} width={tileW} />
  );
  const pills = (items: { key: string | number; name: string; hint?: string }[], value: unknown, onPick: (k: never) => void) =>
    items.map((c) => <Pill key={String(c.key)} label={c.name} title={c.hint} active={value === c.key} onClick={() => onPick(c.key as never)} />);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 px-2 flex-wrap items-center">
        {SUBS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: sub === t.key ? '#2563eb' : '#1a1a25',
              color: sub === t.key ? '#fff' : '#888898',
              border: '1px solid ' + (sub === t.key ? '#3b82f6' : '#2a2a35')
            }}
          >
            {t.label}
          </button>
        ))}
        {painted ? (
          <button
            onClick={clearPaint}
            className="ml-auto px-3 py-1.5 rounded-md text-xs font-medium"
            style={{ background: '#1a1a25', color: '#888898', border: '1px solid #2a2a35' }}
            title="Let every fixture follow the gradient again"
          >
            Clear paint
          </button>
        ) : null}
      </div>

      {sub === 'scenes' && (
        <>
          <ControlGroup label={`Scenes${scene ? ` — ${scene.name}` : ''}`}>
            <div className="flex gap-2 flex-wrap">
              {SCENES.map((s) => tile(s.name, s.name, { ...params, ...s.params, paint: [] }, scene === s, () => applyScene(s)))}
            </div>
          </ControlGroup>
          <ControlGroup label="Saved looks">
            <div className="flex gap-2 flex-wrap items-center">
              {palaceLooks.map((l) => (
                <div key={l.id} className="relative">
                  {tile(l.id, l.name, l.params, false, () => applyLook(l))}
                  <button
                    onClick={() => deleteLook(l.id)}
                    title="Delete look"
                    className="absolute top-1 right-1"
                    style={{ fontSize: 11, color: '#888898', background: '#12121a', borderRadius: 6, padding: '0 5px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <Pill
                label="+ Save look"
                active={false}
                onClick={() => {
                  const name = window.prompt('Name this look', scene?.name ?? 'Palace look');
                  if (name) saveLook(name);
                }}
              />
            </div>
          </ControlGroup>
        </>
      )}

      {sub === 'colour' && (
        <ControlGrid minCellWidth={220}>
          <ControlGroup label="Gradient">
            <div className="flex gap-2 flex-wrap">
              {GRADIENTS.map((g) => (
                <Swatch key={g.name} name={g.name} background={gradientCss(g)} active={params.flow !== 'duo' && same(g.stops, params.stops)}
                  onClick={() => setGradient(g.stops.map(([h, s]) => [h, s] as [number, number]))} />
              ))}
            </div>
          </ControlGroup>
          <ControlGroup label="Duo — cannons / projectors">
            <div className="flex gap-2 flex-wrap">
              {DUOS.map((d) => (
                <Swatch key={d.name} name={d.name} active={params.flow === 'duo' && same(d.stops, params.stops)}
                  background={`linear-gradient(90deg, ${hsbCss(d.stops[0])} 50%, ${hsbCss(d.stops[1])} 50%)`} onClick={() => setDuo(d)} />
              ))}
            </div>
          </ControlGroup>
          <ControlGroup label="Flow">
            <div className="flex gap-2 flex-wrap">{pills(FLOWS, params.flow, (k: string) => update('flow', k))}</div>
          </ControlGroup>
          <ControlGroup label="Spread">
            <div className="flex gap-2 flex-wrap">{pills(SPANS, params.span, (k: number) => update('span', k))}</div>
            <div className="pt-1" style={HINT}>How much of the gradient is across the rig at once</div>
          </ControlGroup>
          <ControlGroup label="Drift">
            <div className="flex gap-2 flex-wrap">{pills(SPINS, params.spin, (k: number) => update('spin', k))}</div>
            <div className="pt-1" style={HINT}>Medium is one lap a minute; the main Speed slider scales everything</div>
          </ControlGroup>
        </ControlGrid>
      )}

      {sub === 'motion' && (
        <>
          <ControlGroup label="Who moves">
            <div className="flex gap-2 flex-wrap">{pills(WHO, params.who, (k: 'both' | 'cannon' | 'projector') => update('who', k))}</div>
          </ControlGroup>
          <ControlGroup label="Motion">
            <div className="flex gap-2 flex-wrap">
              {ANIMS.map((a: Choice) => tile(a.key, a.name, { ...params, anim: a.key }, running && params.anim === a.key, () => update('anim', a.key), a.hint))}
            </div>
          </ControlGroup>
        </>
      )}

      {sub === 'paint' && (
        <ColorPicker hue={hue} saturation={sat} brightness={bright} onHueChange={onHue} onSatChange={onSat} onBrightChange={onBright} compact={compact}>
          <ControlGroup label="Paint">
            <QuickColors hue={hue} saturation={sat} brightness={bright} onHueChange={onHue} onSatChange={onSat} onBrightChange={onBright} />
            <div className="flex gap-2 pt-1 flex-wrap">
              <Pill label="Fill all" active={false} onClick={() => fill(hue, sat)} />
              <Pill label="Fill cannons" active={false} onClick={() => fillKind('cannon', hue, sat)} />
              <Pill label="Fill projectors" active={false} onClick={() => fillKind('projector', hue, sat)} />
            </div>
            <p className="text-sm" style={{ color: 'rgba(136,136,152,0.5)' }}>
              Touch a fixture to give it this colour. Painted fixtures keep it; the rest follow the gradient. Brightness comes
              from the motion either way.
            </p>
          </ControlGroup>
        </ColorPicker>
      )}

      <ControlGroup label="Trim">
        <Trim label="Cannons" value={params.cannon} onChange={(v) => update('cannon', v)} />
        <Trim label="Projectors" value={params.projector} onChange={(v) => update('projector', v)} />
      </ControlGroup>
    </div>
  );
}
