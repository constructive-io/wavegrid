import { useState } from 'react';

import { ANIMS, type Choice, FLOWS, gracePaintPattern, hasPaint } from '@/lib/grace-paint';
import { type Gradient, gradientCss, GRADIENTS } from '@/lib/grace-rings';
import type { GracePaintControls } from '@/lib/use-grace-paint';

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
  showPreview,
  speed,
  easing,
  params,
  fixtures
}: {
  anim: Choice;
  active: boolean;
  onClick: () => void;
  showPreview: boolean;
  speed: number;
  easing: PreviewEasing;
  params: Record<string, unknown>;
  fixtures?: PreviewFixture[];
}) {
  const tileSize = showPreview ? 96 : 72;
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
      {showPreview ? (
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
      ) : null}
      <span
        className="absolute bottom-1 left-0 right-0 text-center text-white font-semibold"
        style={{ fontSize: 9, textShadow: '0 1px 4px rgba(0,0,0,0.8)', letterSpacing: '0.02em' }}
      >
        {anim.name}
      </span>
    </button>
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
  hue,
  sat,
  bright,
  onHue,
  onSat,
  onBright,
  animSpeed,
  onAnimSpeed,
  easing,
  fixtures,
  compact = false
}: {
  controls: GracePaintControls;
  hue: number;
  sat: number;
  bright: number;
  onHue: (h: number) => void;
  onSat: (s: number) => void;
  onBright: (b: number) => void;
  animSpeed: number;
  onAnimSpeed: (v: number) => void;
  easing: PreviewEasing;
  fixtures?: PreviewFixture[];
  compact?: boolean;
}) {
  const [showPreview, setShowPreview] = useState(true);
  const { params, running, start, update, fill, clearPaint } = controls;
  const painted = hasPaint(params.paint);
  const activeGradient = GRADIENTS.find(
    (g) => g.stops.length === params.stops.length && g.stops.every(([h, s], k) => params.stops[k][0] === h && params.stops[k][1] === s)
  );
  const previewParams: Record<string, unknown> = { ...params };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 px-2">
        <span
          className="text-xs font-medium shrink-0"
          style={{ color: '#888898', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}
        >
          Speed
        </span>
        <input
          type="range"
          className="flex-1"
          style={{ minWidth: 120, height: 28 }}
          min={0}
          max={1000}
          value={Math.round(Math.log(animSpeed / 0.001) / Math.log(5.0 / 0.001) * 1000)}
          onChange={(e) => {
            const t = parseInt(e.target.value, 10) / 1000;
            onAnimSpeed(0.001 * Math.pow(5.0 / 0.001, t));
          }}
        />
        <span className="text-xs font-mono shrink-0" style={{ color: '#888898', minWidth: 36, textAlign: 'right' }}>
          {animSpeed < 0.1 ? animSpeed.toFixed(3) : animSpeed < 1 ? animSpeed.toFixed(2) : animSpeed.toFixed(1)}x
        </span>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
          style={{
            background: showPreview ? '#2563eb' : '#1a1a25',
            color: showPreview ? '#fff' : '#888898',
            border: '1px solid ' + (showPreview ? '#3b82f6' : '#2a2a35')
          }}
          title={showPreview ? 'Hide previews' : 'Show animated previews'}
        >
          Preview
        </button>
        {!running ? (
          <button
            onClick={start}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{ background: '#1a1a25', color: '#fff', border: '1px solid #2a2a35' }}
            title="Start GracePaint with the current colours and animation"
          >
            Start
          </button>
        ) : null}
      </div>

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
            <Pill
              label={painted ? 'Clear paint' : 'Nothing painted'}
              active={false}
              onClick={clearPaint}
              title="Let every pane follow the gradient again"
            />
          </div>
          <p className="text-sm" style={{ color: 'rgba(136,136,152,0.5)' }}>
            Touch a pane to give it this colour. Painted panes keep their colour;
            the rest follow the gradient. Brightness comes from the animation
            either way, so paint while it plays.
          </p>
        </ControlGroup>
      </ColorPicker>

      <ControlGrid minCellWidth={220}>
        <ControlGroup label={`Gradient — ${activeGradient?.name ?? 'Custom'}`}>
          <div className="flex gap-2 flex-wrap">
            {GRADIENTS.map((g) => (
              <GradientSwatch
                key={g.name}
                gradient={g}
                active={g === activeGradient}
                onClick={() => update('stops', g.stops.map(([h, s]) => [h, s] as [number, number]))}
              />
            ))}
          </div>
          <div className="pt-1" style={{ fontSize: 10, color: '#888898' }}>
            Colour of the unpainted panes
          </div>
        </ControlGroup>
        <ControlGroup label="Gradient Motion">
          <div className="flex gap-2 flex-wrap">
            {FLOWS.map((f) => (
              <Pill key={f.key} label={f.name} active={params.flow === f.key} onClick={() => update('flow', f.key)} title={f.hint} />
            ))}
          </div>
          <div className="pt-1" style={{ fontSize: 10, color: '#888898' }}>
            One lap about a minute at 1×
          </div>
        </ControlGroup>
        <ControlGroup label="Brightness">
          <div className="flex items-center gap-3">
            <input
              type="range"
              className="flex-1"
              style={{ minWidth: 120, height: 28 }}
              min={0}
              max={100}
              value={params.level}
              onChange={(e) => update('level', Number(e.target.value))}
            />
            <span className="text-xs font-mono shrink-0" style={{ color: '#888898', minWidth: 36, textAlign: 'right' }}>
              {params.level}%
            </span>
          </div>
        </ControlGroup>
      </ControlGrid>

      <ControlGroup label="Animation">
        <div className="flex gap-2.5 flex-wrap overflow-y-auto" style={{ maxHeight: showPreview ? 340 : undefined }}>
          {ANIMS.map((a) => (
            <AnimTile
              key={a.key}
              anim={a}
              active={running && params.anim === a.key}
              onClick={() => update('anim', a.key)}
              showPreview={showPreview}
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
