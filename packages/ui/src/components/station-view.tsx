import { type StationColor, type StationMode, stationModes } from '@wavegrid/stations';
import { type PointerEvent, useEffect, useState } from 'react';

import { useSocket } from '@/lib/use-socket';

function paintColor(hex: string): StationColor {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255);
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  const hue = chroma === 0 ? 0 : max === r ? (g - b) / chroma
    : max === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma;
  return { h: (hue * 60 + 360) % 360, s: max ? chroma / max * 100 : 0, b: max * 100 };
}

function displayColor(color?: StationColor): string {
  if (!color) return '#20202c';
  const value = color.b / 100;
  const lightness = value * (1 - color.s / 200);
  const saturation = lightness <= 0 || lightness >= 1
    ? 0 : (value - lightness) / Math.min(lightness, 1 - lightness);
  return `hsl(${color.h} ${saturation * 100}% ${lightness * 100}%)`;
}

export function StationModeControl({ mode, open, send }: {
  mode?: StationMode;
  open?: boolean;
  send: (msg: Record<string, unknown>) => void;
}) {
  if (!mode) return null;
  const set = (value: StationMode) => send({ type: 'station_mode', mode: value });
  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <label htmlFor="station-mode">Station mode</label>
      <select id="station-mode" value={mode} onChange={e => set(e.target.value as StationMode)} className="bg-slate-900 p-1">
        {stationModes.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      {mode !== 'show' && open === false && <button onClick={() => set(mode)}>Resume station paint</button>}
    </div>
  );
}

export function StationView({ slug, token, logout, sessionEnded }: {
  slug: string;
  token: string;
  logout: () => void;
  sessionEnded: () => void;
}) {
  const url = new URL(window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('station', slug);
  const { connected, connection, grid, stationLayout, stationOpen, send } = useSocket(url.toString(), token);
  const [color, setColor] = useState('#45b7ff');
  const active = connected && stationOpen === true;
  useEffect(() => {
    if (connection.state === 'down' && connection.cause === 'sessionExpired') sessionEnded();
  }, [connection.cause, connection.state, sessionEnded]);
  const paint = (index: number) => {
    if (active) send({ type: 'cannon', index, ...paintColor(color) });
  };
  const drag = (e: PointerEvent<SVGCircleElement>, index: number) => {
    if (e.buttons & 1) paint(index);
  };
  return (
    <main className="flex h-dvh min-h-80 flex-col items-center gap-4 bg-[#090911] p-4 text-white">
      <header className="flex w-full max-w-2xl items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{stationLayout?.name ?? slug}</h1>
        <button onClick={logout} className="rounded border border-slate-600 px-3 py-2">Sign out</button>
      </header>
      <p role="status">{!connected ? 'Station unavailable or connecting…' : active ? 'Paint your station' : 'Station painting is paused'}</p>
      <div className="flex items-center gap-3">
        <label>Brush color <input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
        <button disabled={!active} onClick={() => send({ type: 'clear' })} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-50">
          Clear station
        </button>
      </div>
      {stationLayout && <svg
        aria-label="Station fixtures"
        className="min-h-0 w-full max-w-xl flex-1 touch-none"
        viewBox="-6 -6 112 112"
      >
        {stationLayout.fixtures.map((fixture, i) => <circle
          key={fixture.index}
          aria-label={fixture.label}
          role="button"
          tabIndex={active ? 0 : -1}
          cx={fixture.u * 100}
          cy={fixture.v * 100}
          r={Math.min(5, 30 / Math.sqrt(stationLayout.fixtures.length))}
          fill={displayColor(grid[i])}
          stroke="#77809e"
          strokeWidth="0.5"
          onPointerDown={e => {
            if (e.button !== 0) return;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
            paint(fixture.index);
          }}
          onPointerEnter={e => drag(e, fixture.index)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              paint(fixture.index);
            }
          }}
        ><title>{fixture.label}</title></circle>)}
      </svg>}
    </main>
  );
}
