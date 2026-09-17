import type { PoolMode, PoolSettings } from '@wavegrid/pool';

import { ColorPicker, QuickColors } from './color-wheel';
import { ControlGrid, ControlGroup } from './control-grid';

const MODES: { key: PoolMode; label: string; hint: string }[] = [
  {
    key: 'flow',
    label: 'Flow',
    hint: 'Soft strokes that drift, blend and dissolve.'
  },
  {
    key: 'spiral',
    label: 'Spiral',
    hint: 'A slowly turning field. Circle to set the spin; hands off and it keeps turning.'
  },
  {
    key: 'droplets',
    label: 'Droplets',
    hint: 'Slow rings that widen and thin from wherever you touch.'
  }
];

interface PoolTabProps {
  settings: PoolSettings;
  onSettings: (s: PoolSettings) => void;
  hue: number;
  sat: number;
  bright: number;
  onHue: (h: number) => void;
  onSat: (s: number) => void;
  onBright: (b: number) => void;
  /** Show only what the lasers do: the beam markers, no field haze. */
  beamsOnly: boolean;
  onBeamsOnly: (v: boolean) => void;
  compact?: boolean;
  /** Dissolve the field over about a second; the lasers follow it down. */
  onRelease: () => void;
  /** The show's immediate stop, plus the field emptied so nothing comes back. */
  onStop: () => void;
}

export function PoolTab({
  settings,
  onSettings,
  hue,
  sat,
  bright,
  onHue,
  onSat,
  onBright,
  beamsOnly,
  onBeamsOnly,
  onRelease,
  onStop,
  compact = false
}: PoolTabProps) {
  const set = <K extends keyof PoolSettings>(key: K, value: PoolSettings[K]) =>
    onSettings({ ...settings, [key]: value });
  const mode = MODES.find((m) => m.key === settings.mode) ?? MODES[0];
  const hold = settings.hold === true;

  return (
    <div className="space-y-3">
      <ColorPicker
        hue={hue}
        saturation={sat}
        brightness={bright}
        onHueChange={onHue}
        onSatChange={onSat}
        onBrightChange={onBright}
        compact={compact}
      >
        <ControlGroup label="Colour">
          <QuickColors
            hue={hue}
            saturation={sat}
            brightness={bright}
            onHueChange={onHue}
            onSatChange={onSat}
            onBrightChange={onBright}
          />
          <p className="text-sm" style={{ color: 'rgba(136,136,152,0.5)' }}>
            Same wheel as Paint. New touches take this colour; what is already
            in the pool keeps its own.
          </p>
        </ControlGroup>
      </ColorPicker>

      <ControlGrid minCellWidth={220}>
        <ControlGroup label="Mode">
          <div className="flex gap-2">
            {MODES.map((m) => {
              const active = m.key === settings.mode;
              return (
                <button
                  key={m.key}
                  onClick={() => set('mode', m.key)}
                  className="flex-1 transition-all"
                  style={{
                    height: 44,
                    borderRadius: 10,
                    background: active ? 'rgba(74,124,255,0.15)' : '#12121a',
                    border: active ? '1px solid #4a7cff' : '1px solid #1a1a25',
                    color: active ? '#4a7cff' : '#888898',
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <p
            className="text-sm"
            style={{ color: 'rgba(136,136,152,0.6)', minHeight: 36 }}
          >
            {mode.hint}
          </p>
          <button
            onClick={() => onBeamsOnly(!beamsOnly)}
            className="w-full transition-all"
            title="Hide the field and show only what the lasers do"
            style={{
              height: 44,
              borderRadius: 10,
              background: beamsOnly ? 'rgba(74,124,255,0.15)' : '#12121a',
              border: beamsOnly ? '1px solid #4a7cff' : '1px solid #1a1a25',
              color: beamsOnly ? '#4a7cff' : '#888898',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            Beams only
          </button>
          <div className="flex gap-2">
            <button
              onClick={onRelease}
              className="flex-1 transition-all"
              title="Let the field dissolve"
              style={{
                height: 44,
                borderRadius: 10,
                background: '#12121a',
                border: '1px solid #1a1a25',
                color: '#888898',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              Dissolve
            </button>
            <button
              onClick={onStop}
              className="flex-1 transition-all"
              title="Blackout now"
              style={{
                height: 44,
                borderRadius: 10,
                background: 'rgba(255,80,80,0.12)',
                border: '1px solid rgba(255,80,80,0.4)',
                color: '#ff6b6b',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              Blackout
            </button>
          </div>
        </ControlGroup>

        <ControlGroup label="Feel">
          <div className="flex gap-2">
            {[
              {
                hold: false,
                label: 'Fade',
                hint: 'Strokes dissolve on Linger.'
              },
              {
                hold: true,
                label: 'Hold',
                hint: 'Strokes stay, like Paint, until Dissolve or Blackout.'
              }
            ].map((o) => {
              const active = o.hold === hold;
              return (
                <button
                  key={o.label}
                  onClick={() => set('hold', o.hold)}
                  className="flex-1 transition-all"
                  title={o.hint}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    background: active ? 'rgba(74,124,255,0.15)' : '#12121a',
                    border: active ? '1px solid #4a7cff' : '1px solid #1a1a25',
                    color: active ? '#4a7cff' : '#888898',
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="text-sm" style={{ color: 'rgba(136,136,152,0.6)' }}>
            {!hold
              ? 'What you paint dissolves on its own.'
              : settings.mode === 'droplets'
                ? 'Ripples still travel out, but each leaves its colour behind.'
                : 'What you paint stays and keeps drifting; painting over it recolours it.'}
          </p>
          {[
            { label: 'Motion', key: 'motion' as const, val: settings.motion },
            { label: 'Spread', key: 'spread' as const, val: settings.spread },
            {
              label: 'Linger',
              key: 'persistence' as const,
              val: settings.persistence
            }
          ].map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-3"
              style={
                s.key === 'persistence' && hold ? { opacity: 0.35 } : undefined
              }
            >
              <span
                className="text-sm font-medium shrink-0"
                style={{ color: '#888898', minWidth: 48 }}
              >
                {s.label}
              </span>
              <input
                type="range"
                className="flex-1"
                min={0}
                max={100}
                value={Math.round(s.val * 100)}
                disabled={s.key === 'persistence' && hold}
                onChange={(e) => set(s.key, Number(e.target.value) / 100)}
              />
              <span
                className="text-sm font-mono shrink-0"
                style={{ color: '#888898', minWidth: 28, textAlign: 'right' }}
              >
                {Math.round(s.val * 100)}
              </span>
            </div>
          ))}
          <p className="text-sm" style={{ color: 'rgba(136,136,152,0.5)' }}>
            Intensity and fade are the master sliders above; Clear up top
            dissolves too.
          </p>
        </ControlGroup>
      </ControlGrid>
    </div>
  );
}
