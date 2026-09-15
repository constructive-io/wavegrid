import type { PoolMode, PoolSettings } from '@wavegrid/pool';

import { ControlGrid, ControlGroup } from './control-grid';

const MODES: { key: PoolMode; label: string; hint: string }[] = [
  { key: 'flow', label: 'Flow', hint: 'Soft strokes that drift, blend and dissolve.' },
  { key: 'spiral', label: 'Spiral', hint: 'A slowly turning field. Circle to set the spin; hands off and it keeps turning.' },
  { key: 'droplets', label: 'Droplets', hint: 'Slow rings that widen and thin from wherever you touch.' }
];

/** Quick colours for a hand that would rather not visit the wheel mid-song. */
const SWATCHES: { h: number; s: number; name: string }[] = [
  { h: 200, s: 85, name: 'Pool' },
  { h: 260, s: 70, name: 'Violet' },
  { h: 320, s: 60, name: 'Rose' },
  { h: 28, s: 85, name: 'Amber' },
  { h: 160, s: 60, name: 'Sea' },
  { h: 45, s: 15, name: 'Moon' }
];

interface PoolTabProps {
  settings: PoolSettings;
  onSettings: (s: PoolSettings) => void;
  hue: number;
  sat: number;
  onColor: (h: number, s: number) => void;
  /** Dissolve the field over about a second; the lasers follow it down. */
  onRelease: () => void;
  /** The show's immediate stop, plus the field emptied so nothing comes back. */
  onStop: () => void;
}

export function PoolTab({ settings, onSettings, hue, sat, onColor, onRelease, onStop }: PoolTabProps) {
  const set = <K extends keyof PoolSettings>(key: K, value: PoolSettings[K]) =>
    onSettings({ ...settings, [key]: value });
  const mode = MODES.find((m) => m.key === settings.mode) ?? MODES[0];

  return (
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
        <p className="text-sm" style={{ color: 'rgba(136,136,152,0.6)', minHeight: 36 }}>{mode.hint}</p>
        <div className="flex gap-2">
          <button
            onClick={onRelease}
            className="flex-1 transition-all"
            title="Let the field dissolve"
            style={{ height: 44, borderRadius: 10, background: '#12121a', border: '1px solid #1a1a25', color: '#888898', fontSize: 14, fontWeight: 600 }}
          >
            Dissolve
          </button>
          <button
            onClick={onStop}
            className="flex-1 transition-all"
            title="Blackout now"
            style={{ height: 44, borderRadius: 10, background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.4)', color: '#ff6b6b', fontSize: 14, fontWeight: 600 }}
          >
            Blackout
          </button>
        </div>
      </ControlGroup>

      <ControlGroup label="Feel">
        {[
          { label: 'Motion', key: 'motion' as const, val: settings.motion },
          { label: 'Spread', key: 'spread' as const, val: settings.spread },
          { label: 'Linger', key: 'persistence' as const, val: settings.persistence }
        ].map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span className="text-sm font-medium shrink-0" style={{ color: '#888898', minWidth: 48 }}>{s.label}</span>
            <input
              type="range"
              className="flex-1"
              min={0}
              max={100}
              value={Math.round(s.val * 100)}
              onChange={(e) => set(s.key, Number(e.target.value) / 100)}
            />
            <span className="text-sm font-mono shrink-0" style={{ color: '#888898', minWidth: 28, textAlign: 'right' }}>
              {Math.round(s.val * 100)}
            </span>
          </div>
        ))}
        <p className="text-sm" style={{ color: 'rgba(136,136,152,0.5)' }}>
          Intensity and fade are the master sliders above; Clear up top dissolves too.
        </p>
      </ControlGroup>

      <ControlGroup label="Colour">
        <div className="grid grid-cols-3 gap-2">
          {SWATCHES.map((sw) => {
            const active = Math.abs(sw.h - hue) < 4 && Math.abs(sw.s - sat) < 6;
            return (
              <button
                key={sw.name}
                onClick={() => onColor(sw.h, sw.s)}
                className="flex items-center gap-2 transition-all"
                style={{
                  height: 44,
                  borderRadius: 10,
                  padding: '0 10px',
                  background: '#12121a',
                  border: active ? '1px solid #4a7cff' : '1px solid #1a1a25',
                  color: '#888898',
                  fontSize: 13
                }}
              >
                <span style={{ width: 18, height: 18, borderRadius: 9, background: `hsl(${sw.h}, ${sw.s}%, 55%)`, flexShrink: 0 }} />
                {sw.name}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium shrink-0" style={{ color: '#888898', minWidth: 48 }}>Hue</span>
          <input
            type="range"
            className="flex-1"
            min={0}
            max={359}
            value={hue}
            onChange={(e) => onColor(Number(e.target.value), sat)}
            style={{ accentColor: `hsl(${hue}, ${sat}%, 55%)` }}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium shrink-0" style={{ color: '#888898', minWidth: 48 }}>Sat</span>
          <input
            type="range"
            className="flex-1"
            min={0}
            max={100}
            value={sat}
            onChange={(e) => onColor(hue, Number(e.target.value))}
          />
        </div>
      </ControlGroup>
    </ControlGrid>
  );
}
