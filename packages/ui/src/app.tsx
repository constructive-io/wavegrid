import { useCallback, useEffect, useRef, useState } from 'react';

import { AudioTab } from '@/components/audio-tab';
import { BottomSheet, type SnapPoint } from '@/components/bottom-sheet';
import { BrightnessTab, useBrightnessAnimation } from '@/components/brightness-tab';
import { ColorWheel } from '@/components/color-wheel';
import { ControlGrid, ControlGroup } from '@/components/control-grid';
import { DropsControls, useDrops } from '@/components/drops-tab';
import { FlagsTab, useFlagAnimation } from '@/components/flags-tab';
import { GradientBar, useGradient } from '@/components/gradient-tab';
import type { GridMode } from '@/components/grid-display';
import { GridDisplay } from '@/components/grid-display';
import { LoginScreen } from '@/components/login-screen';
import { useMotion } from '@/components/motion-tab';
import { NovaTab } from '@/components/nova-tab';
import { AnimationPalette, ScenePalette } from '@/components/palette';
import { PatternsTab } from '@/components/patterns-tab';
import { PlaylistTab } from '@/components/playlist-tab';
import { PrideTab } from '@/components/pride-tab';
import { SequencesTab } from '@/components/sequences-tab';
import { SettingsTab } from '@/components/settings-tab';
import { ShiftDial } from '@/components/shift-dial';
import { StatusDot } from '@/components/status-dot';
import { UsaTab } from '@/components/usa-tab';
import { VideoTab } from '@/components/video-tab';
import { useAudio } from '@/lib/use-audio';
import { useAuth } from '@/lib/use-auth';
import { useConfig } from '@/lib/use-config';
import { useIsPhone } from '@/lib/use-media-query';
import { type PlaylistState, useSocket } from '@/lib/use-socket';

type PanelLayout = 'bottom' | 'right';
type TrailFadeEntry = {
  h: number;
  s: number;
  startBright: number;
  startTime: number;
  duration: number;
};

const tabs: { key: GridMode; label: string }[] = [
  { key: 'paint', label: 'Paint' },
  { key: 'gradient', label: 'Gradient' },
  { key: 'scenes', label: 'Scenes' },
  { key: 'animations', label: 'Anim' },
  { key: 'pride', label: 'Pride' },
  { key: 'usa', label: 'USA' },
  { key: 'nova', label: 'Nova' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'sequences', label: 'Sequences' },
  { key: 'playlist', label: 'Playlist' },
  { key: 'flags', label: 'Flags' },
  { key: 'drops', label: 'Drops' },
  { key: 'audio', label: 'Audio' },
  { key: 'video', label: 'Video' },
  { key: 'debug', label: 'Debug' }
];

/* ---------- Tool content (no tabs, just the active tool) ---------- */

function ToolContent({
  tab,
  hue, sat, bright, brushSize, softEdge, trailFade,
  setHue, setSat, setBright, setBrushSize, setSoftEdge, setTrailFade,
  gradient, dropsConfig, setDropsConfig,
  activeScene, handleScene,
  activeAnim, handleAnim,
  animSpeed, onAnimSpeed,
  send,
  flags, brightness, audio,
  isPhone,
  onShift,
  numCannons, gridColumns,
  activePattern, onPatternSelect,
  playlistState
}: {
  tab: GridMode;
  hue: number; sat: number; bright: number; brushSize: number; softEdge: boolean; trailFade: boolean;
  setHue: (v: number) => void; setSat: (v: number) => void; setBright: (v: number) => void;
  setBrushSize: (v: number) => void; setSoftEdge: (v: boolean) => void; setTrailFade: (v: boolean) => void;
  gradient: ReturnType<typeof useGradient>;
  dropsConfig: { spectrumStart: number; spectrumEnd: number; speed: number; decay: number; width: number };
  setDropsConfig: (c: typeof dropsConfig) => void;
  activeScene: string | null;
  handleScene: (name: string) => void;
  activeAnim: string | null;
  handleAnim: (name: string) => void;
  animSpeed: number;
  onAnimSpeed: (v: number) => void;
  send: (msg: Record<string, unknown>) => void;
  flags: ReturnType<typeof useFlagAnimation>;
  brightness: ReturnType<typeof useBrightnessAnimation>;
  audio: ReturnType<typeof useAudio>;
  isPhone: boolean;
  onShift: (vx: number, vy: number) => void;
  numCannons: number;
  gridColumns: number;
  activePattern: string | null;
  onPatternSelect: (id: string) => void;
  playlistState: PlaylistState | null;
}) {
  return (
    <>
      {tab === 'paint' && (
        <ColorWheel
          hue={hue}
          saturation={sat}
          brightness={bright}
          brushSize={brushSize}
          softEdge={softEdge}
          trailFade={trailFade}
          onHueChange={setHue}
          onSatChange={setSat}
          onBrightChange={setBright}
          onBrushSizeChange={setBrushSize}
          onSoftEdgeChange={setSoftEdge}
          onTrailFadeChange={setTrailFade}
          compact={isPhone}
        />
      )}

      {tab === 'gradient' && (
        <div className="space-y-3">
          <GradientBar
            stops={gradient.stops}
            onAdd={(pos) => gradient.addStop(pos, hue, sat, bright)}
          />
          <button
            onClick={gradient.reset}
            className="px-4 py-2.5 rounded-lg text-sm transition-all"
            style={{
              background: '#12121a',
              color: '#888898',
              border: '1px solid #1a1a25'
            }}
          >
            Reset
          </button>
        </div>
      )}

      {tab === 'drops' && (
        <DropsControls config={dropsConfig} onChange={setDropsConfig} />
      )}

      {tab === 'scenes' && (
        <ScenePalette active={activeScene} onSelect={handleScene} />
      )}

      {tab === 'animations' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 px-2">
            <span className="text-xs font-medium shrink-0" style={{ color: '#888898', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
              Speed
            </span>
            <input
              type="range"
              className="flex-1"
              style={{ minWidth: 120, height: 28 }}
              min={0}
              max={1000}
              value={Math.round(Math.log(animSpeed / 0.01) / Math.log(5.0 / 0.01) * 1000)}
              onChange={(e) => {
                const t = parseInt(e.target.value, 10) / 1000;
                onAnimSpeed(0.01 * Math.pow(5.0 / 0.01, t));
              }}
            />
            <span className="text-xs font-mono shrink-0" style={{ color: '#888898', minWidth: 36, textAlign: 'right' }}>
              {animSpeed < 0.1 ? animSpeed.toFixed(3) : animSpeed < 1 ? animSpeed.toFixed(2) : animSpeed.toFixed(1)}x
            </span>
            <button
              onClick={() => onAnimSpeed(1.0)}
              title="Reset to 1.0x"
              style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: Math.abs(animSpeed - 1.0) < 0.01 ? 'transparent' : 'rgba(59,130,246,0.15)',
                border: 'none', cursor: 'pointer', opacity: Math.abs(animSpeed - 1.0) < 0.01 ? 0.3 : 1
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888898" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>
          <ControlGrid minCellWidth={200}>
            <ControlGroup label="Animations">
              <AnimationPalette
                active={activeAnim}
                onSelect={handleAnim}
                speed={animSpeed}
              />
            </ControlGroup>
            <ControlGroup label="Brightness Effects">
              <BrightnessTab
                config={brightness.config}
                onMode={brightness.setMode}
                onSpeed={brightness.setSpeed}
                onIntensity={brightness.setIntensity}
                onResnapshot={brightness.resnapshot}
              />
            </ControlGroup>
            <ControlGroup label="Shift">
              <ShiftDial onShift={onShift} />
            </ControlGroup>
          </ControlGrid>
        </div>
      )}

      {tab === 'pride' && (
        <PrideTab
          send={send}
          activePattern={activePattern}
          onPatternSelect={onPatternSelect}
          animSpeed={animSpeed}
          onAnimSpeed={onAnimSpeed}
        />
      )}

      {tab === 'usa' && (
        <UsaTab
          send={send}
          activePattern={activePattern}
          onPatternSelect={onPatternSelect}
          animSpeed={animSpeed}
          onAnimSpeed={onAnimSpeed}
        />
      )}

      {tab === 'nova' && (
        <NovaTab
          send={send}
          activePattern={activePattern}
          onPatternSelect={onPatternSelect}
          animSpeed={animSpeed}
          onAnimSpeed={onAnimSpeed}
          numCannons={numCannons}
          gridColumns={gridColumns}
        />
      )}

      {tab === 'patterns' && (
        <PatternsTab send={send} animSpeed={animSpeed} onAnimSpeed={onAnimSpeed} />
      )}

      {tab === 'sequences' && (
        <SequencesTab send={send} playlistState={playlistState} />
      )}

      {tab === 'playlist' && (
        <PlaylistTab send={send} playlistState={playlistState as Parameters<typeof PlaylistTab>[0]['playlistState']} />
      )}

      {tab === 'flags' && (
        <FlagsTab
          activeFlag={flags.activeFlag}
          effect={flags.effect}
          purpleBlack={flags.purpleBlack}
          onSelectFlag={flags.selectFlag}
          onEffect={flags.setEffect}
          onPurpleBlack={flags.setPurpleBlack}
        />
      )}

      {tab === 'audio' && (
        <AudioTab audio={audio} />
      )}

      {tab === 'video' && (
        <VideoTab send={send} numCannons={numCannons} gridColumns={gridColumns} />
      )}

      {tab === 'debug' && (
        <SettingsTab
          numCannons={numCannons}
          gridColumns={gridColumns}
          send={send}
        />
      )}
    </>
  );
}

/* ---------- Tab strip ---------- */

function TabStrip({
  tab,
  setTab,
  variant
}: {
  tab: GridMode;
  setTab: (t: GridMode) => void;
  variant: 'phone' | 'bottom' | 'right';
}) {
  const isPhone = variant === 'phone';
  const isRight = variant === 'right';

  return (
    <div
      className={isRight ? 'flex flex-wrap gap-1 shrink-0' : 'flex gap-1 overflow-x-auto shrink-0'}
      style={{
        padding: isRight ? '10px 10px 6px' : '8px 12px 6px',
        ...(isRight ? {} : { WebkitOverflowScrolling: 'touch' as const })
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className="whitespace-nowrap transition-all"
          style={{
            padding: isPhone ? '10px 16px' : isRight ? '8px 12px' : '10px 18px',
            borderRadius: 22,
            fontSize: isPhone ? 14 : isRight ? 12 : 14,
            fontWeight: 600,
            letterSpacing: '0.02em',
            background: tab === t.key ? '#12121a' : 'transparent',
            border: tab === t.key ? '1px solid #1a1a25' : '1px solid transparent',
            color: tab === t.key ? '#e8e8f0' : '#888898'
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Desktop/tablet ToolPanel (non-phone) ---------- */

function ToolPanel({
  tab,
  setTab,
  layout,
  toolContentProps
}: {
  tab: GridMode;
  setTab: (t: GridMode) => void;
  layout: PanelLayout;
  toolContentProps: Omit<React.ComponentProps<typeof ToolContent>, 'tab'>;
}) {
  const isRight = layout === 'right';

  return (
    <div
      className='flex min-h-0 flex-col'
      style={{
        background: '#0c0c12',
        ...(isRight
          ? { height: '100%', borderLeft: '1px solid #1a1a25', width: 380 }
          : { borderTop: '1px solid #1a1a25' })
      }}
    >
      <TabStrip tab={tab} setTab={setTab} variant={isRight ? 'right' : 'bottom'} />

      <div
        className='flex-1 overflow-y-auto'
        style={{ padding: isRight ? '10px 16px 16px' : '10px 20px 24px', minHeight: isRight ? 0 : 140 }}
      >
        <ToolContent tab={tab} {...toolContentProps} />
      </div>
    </div>
  );
}

/* ---------- Master sliders (top bar on desktop, expandable on phone) ---------- */

function MasterSliders({
  masterBright,
  smoothness,
  attack,
  onMasterBright,
  onSmooth,
  onAttack,
  throttledSlider,
  vertical
}: {
  masterBright: number;
  smoothness: number;
  attack: number;
  onMasterBright: (v: number) => void;
  onSmooth: (v: number) => void;
  onAttack: (v: number) => void;
  throttledSlider: (handler: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  vertical?: boolean;
}) {
  const sliders = [
    { label: 'Bright', value: masterBright, handler: onMasterBright, flex: 1 },
    { label: 'Fade', value: smoothness, handler: onSmooth, flex: 3 },
    { label: 'Attack', value: attack, handler: onAttack, flex: 1 }
  ];

  if (vertical) {
    return (
      <div className="space-y-3 p-4">
        {sliders.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: '#888898', minWidth: 56 }}>
              {s.label}
            </span>
            <input
              type="range"
              className="flex-1"
              min={0}
              max={100}
              value={s.value}
              onChange={throttledSlider(s.handler)}
            />
            <span className="text-sm font-mono" style={{ color: '#888898', minWidth: 32, textAlign: 'right' }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {sliders.map((s) => (
        <div key={s.label} className="flex items-center gap-2" style={{ minWidth: 0, flex: s.flex }}>
          <span className="text-xs font-medium shrink-0" style={{ color: '#888898', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
            {s.label}
          </span>
          <input
            type="range"
            className="flex-1"
            style={{ minWidth: 40 }}
            min={0}
            max={100}
            value={s.value}
            onChange={throttledSlider(s.handler)}
          />
          <span className="text-xs font-mono shrink-0" style={{ color: '#888898', minWidth: 28, textAlign: 'right' }}>
            {s.value}
          </span>
        </div>
      ))}
    </>
  );
}

/* ---------- Main page ---------- */

export default function Home() {
  const [configRev, setConfigRev] = useState(0);
  const config = useConfig(configRev);
  const { user, token, checked, endedSession, lastUser, login, sessionEnded } = useAuth();
  const { connection, grid, orientation, playlistState, settings, send } = useSocket(
    config?.simulatorUrl ?? null,
    token,
    useCallback(() => setConfigRev((n) => n + 1), [])
  );
  const isPhone = useIsPhone();

  const NUM_CANNONS = config?.numCannons ?? 49;
  const GRID_COLUMNS = config?.gridColumns ?? 7;
  const FIXTURES = config?.layout?.fixtures;

  const [tab, setTab] = useState<GridMode>(() => {
    if (typeof window === 'undefined') return 'paint';
    const saved = localStorage.getItem('wavegrid-tab');
    if (saved && tabs.some((t) => t.key === saved)) return saved as GridMode;
    return 'paint';
  });
  const [layout, setLayout] = useState<PanelLayout>('bottom');
  const [hue, setHue] = useState(220);
  const [sat, setSat] = useState(90);
  const [bright, setBright] = useState(100);
  const [brushSize, setBrushSize] = useState(1);
  const [softEdge, setSoftEdge] = useState(false);
  const [trailFade, setTrailFade] = useState(false);
  const [smoothness, setSmoothness] = useState(50);
  const [attack, setAttack] = useState(80);
  const [masterBright, setMasterBright] = useState(100);
  const [sheetSnap, setSheetSnap] = useState<SnapPoint>('peek');
  const [showMasterSliders, setShowMasterSliders] = useState(false);
  const [viewFlip, setViewFlip] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('wavegrid-view-flip');
      return stored === null ? true : stored === 'true';
    }
    return true;
  });

  const toggleViewFlip = useCallback(() => {
    setViewFlip(prev => {
      const next = !prev;
      localStorage.setItem('wavegrid-view-flip', String(next));
      return next;
    });
  }, []);

  // A token the server no longer accepts can only reconnect into the same
  // error, so stop retrying against it and hand the operator the login screen.
  useEffect(() => {
    if (token && connection.state === 'down' && connection.cause === 'sessionExpired') {
      sessionEnded();
    }
  }, [token, connection.state, connection.cause, sessionEnded]);

  // Sync slider state from server on initial connect
  const settingsSyncedRef = useRef(false);
  useEffect(() => {
    if (!settings || settingsSyncedRef.current) return;
    settingsSyncedRef.current = true;
    // Reverse: alpha = 10^(-2.7 * smoothness/100) → smoothness = -100*log10(alpha)/2.7
    const smoothnessFromAlpha = Math.round(Math.max(0, Math.min(100, -100 * Math.log10(settings.alpha) / 2.7)));
    setSmoothness(smoothnessFromAlpha);
    // Reverse: attackValue = 0.05 + (attack/100)*0.95 → attack = (attackValue-0.05)/0.95 * 100
    const attackFromValue = Math.round(Math.max(0, Math.min(100, (settings.attack - 0.05) / 0.95 * 100)));
    setAttack(attackFromValue);
    setAnimSpeed(settings.speed);
  }, [settings]);

  useEffect(() => {
    if (tab === 'debug') return;
    send({ type: 'physical_preview_clear' });
    send({ type: 'calibration_mode', enabled: false });
  }, [send, tab]);

  useEffect(() => {
    const alpha = Math.pow(10, -2.7 * (smoothness / 100));
    const attackValue = 0.05 + (attack / 100) * 0.95;
    send({ type: 'smoothness', value: alpha });
    send({ type: 'attack', value: attackValue });
    send({ type: 'master_brightness', value: masterBright / 100 });
  }, [send]);

  const hasOrientation = orientation.rotation !== 0 || orientation.flipH || orientation.flipV;

  const rafRef = useRef(0);
  const throttledSlider = useCallback((handler: (v: number) => void) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => handler(val));
    };
  }, []);

  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [activeAnim, setActiveAnim] = useState<string | null>(null);
  const [activePattern, setActivePattern] = useState<string | null>(null);
  const [animSpeed, setAnimSpeed] = useState(1.0);
  const [, setShiftActive] = useState(false);
  const [dropsConfig, setDropsConfig] = useState({
    spectrumStart: 0,
    spectrumEnd: 180,
    speed: 5,
    decay: 5,
    width: 2
  });

  const gridData = grid.length > 0 ? grid : Array.from({ length: NUM_CANNONS }, () => ({ h: 220, s: 90, b: 80 }));

  const audio = useAudio(NUM_CANNONS, GRID_COLUMNS, gridData, send, smoothness);
  const { addDrop } = useDrops(NUM_CANNONS, GRID_COLUMNS, dropsConfig, send);
  const motion = useMotion(hue, sat, bright, send);
  const gradient = useGradient();
  const trailFadeEntriesRef = useRef<Map<number, TrailFadeEntry>>(new Map());
  const trailFadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTrailFadeTimers = useCallback(() => {
    if (trailFadeIntervalRef.current) {
      clearInterval(trailFadeIntervalRef.current);
      trailFadeIntervalRef.current = null;
    }
    trailFadeEntriesRef.current.clear();
  }, []);

  const scheduleTrailFade = useCallback((index: number, h: number, s: number, b: number) => {
    trailFadeEntriesRef.current.set(index, {
      h,
      s,
      startBright: b,
      startTime: Date.now(),
      duration: 3200
    });

    if (trailFadeIntervalRef.current) return;

    trailFadeIntervalRef.current = setInterval(() => {
      const now = Date.now();

      for (const [fadeIndex, entry] of trailFadeEntriesRef.current.entries()) {
        const elapsed = now - entry.startTime;
        const progress = Math.min(1, elapsed / entry.duration);
        const nextBright = Math.round(entry.startBright * (1 - progress) ** 2);

        send({
          type: 'cannon',
          index: fadeIndex,
          h: entry.h,
          s: entry.s,
          b: nextBright
        });

        if (progress >= 1 || nextBright <= 0) {
          trailFadeEntriesRef.current.delete(fadeIndex);
        }
      }

      if (trailFadeEntriesRef.current.size === 0 && trailFadeIntervalRef.current) {
        clearInterval(trailFadeIntervalRef.current);
        trailFadeIntervalRef.current = null;
      }
    }, 80);
  }, [send]);

  useEffect(() => clearTrailFadeTimers, [clearTrailFadeTimers]);

  useEffect(() => {
    if (!trailFade) clearTrailFadeTimers();
  }, [clearTrailFadeTimers, trailFade]);

  const handleCannon = useCallback(
    (index: number, h: number, s: number, b: number) => {
      send({ type: 'cannon', index, h, s, b });
      if (trailFade && b > 0) {
        scheduleTrailFade(index, h, s, b);
      }
    },
    [scheduleTrailFade, send, trailFade]
  );

  const flags = useFlagAnimation(send);
  const brightness = useBrightnessAnimation(NUM_CANNONS, GRID_COLUMNS, gridData, send);

  const handleScene = useCallback(
    (name: string) => {
      setActiveScene(name);
      setActiveAnim(null);
      setActivePattern(null);
      send({ type: 'scene', name });
    },
    [send]
  );

  const handleAnim = useCallback(
    (name: string) => {
      setActiveAnim(name);
      setActivePattern(null);
      send({ type: 'animation', name });
    },
    [send]
  );

  const handlePatternSelect = useCallback(
    (id: string) => {
      setActivePattern(id);
      setActiveAnim(null);
      setActiveScene(null);
    },
    []
  );

  const handleAnimSpeed = useCallback(
    (v: number) => {
      setAnimSpeed(v);
      send({ type: 'anim_speed', value: v });
    },
    [send]
  );

  const handleShift = useCallback(
    (vx: number, vy: number) => {
      setShiftActive(vx !== 0 || vy !== 0);
      send({ type: 'shift', vx, vy });
    },
    [send]
  );

  const handleGlobalStop = useCallback(() => {
    setActiveAnim(null);
    setActiveScene(null);
    setActivePattern(null);
    setShiftActive(false);
    send({ type: 'animation', name: 'stop' });
    send({ type: 'stopPattern' });
    send({ type: 'shift', vx: 0, vy: 0 });
    send({ type: 'video_layer_clear' });
    flags.stop();
    brightness.setMode('off');
    audio.stop();
    audio.stopMic(false);
  }, [send, flags, brightness, audio]);

  const handleClear = useCallback(() => {
    clearTrailFadeTimers();
    send({ type: 'clear' });
  }, [clearTrailFadeTimers, send]);

  const handleRotate = useCallback((direction: 'cw' | 'ccw') => {
    send({ type: 'rotate', direction });
  }, [send]);

  const handleMirror = useCallback((axis: 'horizontal' | 'vertical') => {
    send({ type: 'mirror', axis });
  }, [send]);

  const handleSmooth = useCallback(
    (pct: number) => {
      setSmoothness(pct);
      const alpha = Math.pow(10, -2.7 * (pct / 100));
      send({ type: 'smoothness', value: alpha });
    },
    [send]
  );

  const handleAttack = useCallback(
    (pct: number) => {
      setAttack(pct);
      const value = 0.05 + (pct / 100) * 0.95;
      send({ type: 'attack', value });
    },
    [send]
  );

  const handleMasterBright = useCallback(
    (pct: number) => {
      setMasterBright(pct);
      send({ type: 'master_brightness', value: pct / 100 });
    },
    [send]
  );


  const handleGradientDrag = useCallback(
    (startIdx: number, endIdx: number) => {
      const startRow = Math.floor(startIdx / GRID_COLUMNS);
      const startCol = startIdx % GRID_COLUMNS;
      const endRow = Math.floor(endIdx / GRID_COLUMNS);
      const endCol = endIdx % GRID_COLUMNS;
      const dist = Math.sqrt((endRow - startRow) ** 2 + (endCol - startCol) ** 2);
      if (dist < 0.5) return;

      for (let i = 0; i < NUM_CANNONS; i++) {
        const r = Math.floor(i / GRID_COLUMNS);
        const c = i % GRID_COLUMNS;
        const proj = ((r - startRow) * (endRow - startRow) + (c - startCol) * (endCol - startCol)) / (dist * dist);
        const t = Math.max(0, Math.min(1, proj));
        const gc = gradient.colorAt(t);
        send({ type: 'cannon', index: i, h: gc.h, s: gc.s, b: gc.b });
      }
    },
    [send, gradient]
  );

  const handleTabChange = useCallback((t: GridMode) => {
    if (t !== 'debug' && tab === 'debug') {
      send({ type: 'physical_preview_clear' });
      send({ type: 'calibration_mode', enabled: false });
    }
    setTab(t);
    localStorage.setItem('wavegrid-tab', t);
    if (isPhone && sheetSnap === 'peek') {
      setSheetSnap('half');
    }
  }, [isPhone, send, sheetSnap, tab]);

  const toolContentProps = {
    hue, sat, bright, brushSize, softEdge, trailFade,
    setHue, setSat, setBright, setBrushSize, setSoftEdge, setTrailFade,
    gradient, dropsConfig, setDropsConfig,
    activeScene, handleScene,
    activeAnim, handleAnim,
    animSpeed, onAnimSpeed: handleAnimSpeed,
    send,
    flags, brightness, audio,
    isPhone,
    onShift: handleShift,
    numCannons: NUM_CANNONS,
    gridColumns: GRID_COLUMNS,
    activePattern,
    onPatternSelect: handlePatternSelect,
    playlistState
  };

  /* ---------- Loading gates (after all hooks, to respect Rules of Hooks) ---------- */
  if (!config || !checked) {
    return <div style={{ background: '#050508', height: '100dvh' }} />;
  }

  if (!user) {
    return (
      <LoginScreen
        onLogin={login}
        defaultUsername={lastUser}
        notice={
          endedSession
            ? 'Your session ended — it expired, was revoked, or the show switched project.'
            : undefined
        }
      />
    );
  }

  /* ---------- PHONE LAYOUT ---------- */
  if (isPhone) {
    return (
      <div className="flex flex-col" style={{ background: '#050508', height: '100dvh' }}>
        {/* Minimal top bar */}
        <header
          className="flex items-center justify-between px-4 shrink-0"
          style={{ background: '#0c0c12', borderBottom: '1px solid #1a1a25', paddingTop: 'max(8px, env(safe-area-inset-top))', paddingBottom: 8 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: '#888898' }}>Wavegrid</span>
            <StatusDot info={connection} compact />
            {(audio.state.playing || audio.state.micActive) && (
              <span className="text-sm animate-pulse" style={{ color: '#4a7cff' }}>{audio.state.micActive ? '🎤' : '♪'}</span>
            )}
            <span className="text-xs" style={{ color: '#555' }}>
              {user}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="flex items-center justify-center transition-all"
              title="Clear"
              style={{ height: 36, borderRadius: 10, paddingLeft: 12, paddingRight: 12, background: '#12121a', border: '1px solid #1a1a25', color: '#d44', fontSize: 13, fontWeight: 600 }}
            >
              Clear
            </button>
            <button
              onClick={handleGlobalStop}
              className="flex items-center justify-center transition-all"
              title="Stop"
              style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.4)', color: '#ff6b6b', fontSize: 16 }}
            >
              ⏹
            </button>
            <button
              onClick={() => setShowMasterSliders(!showMasterSliders)}
              className="flex items-center justify-center transition-all"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: showMasterSliders ? 'rgba(74,124,255,0.15)' : '#12121a',
                border: `1px solid ${showMasterSliders ? '#4a7cff' : '#1a1a25'}`,
                color: showMasterSliders ? '#4a7cff' : '#888898',
                fontSize: 18
              }}
            >
              ≡
            </button>
          </div>
        </header>

        {/* Always-visible fade slider on mobile */}
        <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ background: '#0a0a10', borderBottom: '1px solid #1a1a25' }}>
          <span className="text-xs font-medium shrink-0" style={{ color: '#888898' }}>Fade</span>
          <input
            type="range"
            className="flex-1"
            style={{ height: 24 }}
            min={0}
            max={100}
            value={smoothness}
            onChange={throttledSlider(handleSmooth)}
          />
          <span className="text-xs font-mono shrink-0" style={{ color: '#888898', minWidth: 24, textAlign: 'right' }}>
            {smoothness}
          </span>
        </div>

        {/* Expandable master sliders */}
        {showMasterSliders && (
          <div style={{ background: '#0c0c12', borderBottom: '1px solid #1a1a25' }}>
            <MasterSliders
              masterBright={masterBright}
              smoothness={smoothness}
              attack={attack}
              onMasterBright={handleMasterBright}
              onSmooth={handleSmooth}
              onAttack={handleAttack}
              throttledSlider={throttledSlider}
              vertical
            />
            <div className="flex items-center gap-3 px-4 pb-4">
              <span className="text-sm font-medium" style={{ color: '#888898', minWidth: 56 }}>Rotate</span>
              <button
                onClick={() => handleRotate('ccw')}
                className="flex items-center justify-center transition-all"
                title="Rotate 90° CCW"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#12121a',
                  border: '1px solid #1a1a25',
                  color: '#888898',
                  fontSize: 18
                }}
              >
                ↺
              </button>
              <button
                onClick={() => handleRotate('cw')}
                className="flex items-center justify-center transition-all"
                title="Rotate 90° CW"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#12121a',
                  border: '1px solid #1a1a25',
                  color: '#888898',
                  fontSize: 18
                }}
              >
                ↻
              </button>
            </div>
            <div className="flex items-center gap-3 px-4 pb-4">
              <span className="text-sm font-medium" style={{ color: '#888898', minWidth: 56 }}>Mirror</span>
              <button
                onClick={() => handleMirror('horizontal')}
                className="flex items-center justify-center transition-all"
                title="Mirror horizontal"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#12121a',
                  border: '1px solid #1a1a25',
                  color: '#888898',
                  fontSize: 18
                }}
              >
                ⇔
              </button>
              <button
                onClick={() => handleMirror('vertical')}
                className="flex items-center justify-center transition-all"
                title="Mirror vertical"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#12121a',
                  border: '1px solid #1a1a25',
                  color: '#888898',
                  fontSize: 18
                }}
              >
                ⇕
              </button>
            </div>
            <div className="flex items-center gap-3 px-4 pb-4">
              <span className="text-sm font-medium" style={{ color: '#888898', minWidth: 56 }}>View</span>
              <button
                onClick={toggleViewFlip}
                className="flex items-center justify-center transition-all"
                title={viewFlip ? 'View: flipped (your perspective)' : 'View: sky perspective'}
                style={{
                  height: 44,
                  borderRadius: 10,
                  paddingLeft: 14,
                  paddingRight: 14,
                  background: viewFlip ? 'rgba(74,124,255,0.15)' : '#12121a',
                  border: `1px solid ${viewFlip ? '#4a7cff' : '#1a1a25'}`,
                  color: viewFlip ? '#4a7cff' : '#888898',
                  fontSize: 14
                }}
              >
                {viewFlip ? 'My View' : 'Sky View'}
              </button>
            </div>
          </div>
        )}

        {/* Grid canvas — takes remaining space above the sheet */}
        <div
          className="flex-1 flex items-center justify-center overflow-hidden"
          style={{ padding: 8, paddingBottom: 80, minHeight: 0 }}
        >
          <GridDisplay
            grid={gridData}
            columns={GRID_COLUMNS}
            fixtures={FIXTURES}
            currentHue={hue}
            currentSat={sat}
            currentBright={bright}
            mode={tab}
            brushSize={brushSize}
            softEdge={softEdge}
            motionPath={motion.state.path}
            viewFlip={viewFlip && hasOrientation ? orientation : null}
            onCannon={handleCannon}
            onDrop={addDrop}
            onMotionPoint={motion.recordPoint}
            onGradientDrag={handleGradientDrag}
          />
        </div>

        {/* Bottom sheet */}
        <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
          <TabStrip tab={tab} setTab={handleTabChange} variant="phone" />
          <div style={{ padding: '4px 16px 24px' }}>
            <ToolContent tab={tab} {...toolContentProps} />
          </div>
        </BottomSheet>
      </div>
    );
  }

  /* ---------- TABLET / DESKTOP LAYOUT ---------- */
  const headerBtnStyle = {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: '#12121a',
    border: '1px solid #1a1a25',
    color: '#888898',
    fontSize: 16
  } as const;

  return (
    <div className="flex flex-col" style={{ background: '#050508', height: '100dvh' }}>
      {/* Top Bar — two rows: brand row + controls row */}
      <header
        className="shrink-0"
        style={{ background: '#0c0c12', borderBottom: '1px solid #1a1a25' }}
      >
        {/* Row 1: brand + identity */}
        <div
          className="flex items-center justify-between px-5"
          style={{ paddingTop: 10, paddingBottom: 6 }}
        >
          <div className="flex items-center gap-3">
            <span
              className="text-sm font-medium tracking-wider"
              style={{ color: '#888898', letterSpacing: '0.04em' }}
            >
              Wavegrid
            </span>
            <StatusDot info={connection} />
            {(audio.state.playing || audio.state.micActive) && (
              <span className="text-sm animate-pulse" style={{ color: '#4a7cff' }}>{audio.state.micActive ? '🎤' : '♪'}</span>
            )}
            <span className="text-xs" style={{ color: '#555' }}>
              {user}
            </span>
          </div>

          {/* Orientation + layout + stop buttons (always visible top-right) */}
          <div className="flex items-center gap-3">
            {/* Orientation group */}
            <div className="flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '2px 3px' }}>
              <button onClick={() => handleRotate('ccw')} className="flex items-center justify-center transition-all" title="Rotate 90° CCW" style={headerBtnStyle}>↺</button>
              <button onClick={() => handleRotate('cw')} className="flex items-center justify-center transition-all" title="Rotate 90° CW" style={headerBtnStyle}>↻</button>
              <button onClick={() => handleMirror('horizontal')} className="flex items-center justify-center transition-all" title="Mirror horizontal" style={headerBtnStyle}>⇔</button>
              <button onClick={() => handleMirror('vertical')} className="flex items-center justify-center transition-all" title="Mirror vertical" style={headerBtnStyle}>⇕</button>
              <button
                onClick={toggleViewFlip}
                className="flex items-center justify-center transition-all"
                title={viewFlip ? 'View: flipped (your perspective)' : 'View: sky perspective'}
                style={{
                  ...headerBtnStyle,
                  background: viewFlip ? 'rgba(74,124,255,0.15)' : headerBtnStyle.background,
                  border: viewFlip ? '1px solid #4a7cff' : headerBtnStyle.border,
                  color: viewFlip ? '#4a7cff' : headerBtnStyle.color
                }}
              >
                {viewFlip ? '⊙' : '◎'}
              </button>
            </div>
            {/* Layout toggle */}
            <button
              onClick={() => setLayout((l) => l === 'bottom' ? 'right' : 'bottom')}
              className="flex items-center justify-center transition-all"
              title={layout === 'bottom' ? 'Panel: right side' : 'Panel: bottom'}
              style={headerBtnStyle}
            >
              {layout === 'bottom' ? '⊟' : '⊞'}
            </button>
            <button
              onClick={handleClear}
              className="flex items-center justify-center transition-all"
              title="Clear"
              style={{ ...headerBtnStyle, width: 64, background: '#12121a', border: '1px solid #1a1a25', color: '#d44', fontSize: 13, fontWeight: 600 }}
            >
              Clear
            </button>
            {/* Global stop animation */}
            <button
              onClick={handleGlobalStop}
              className="flex items-center justify-center transition-all"
              title={`Stop ${activeAnim ?? activeScene ?? flags.activeFlag ?? (audio.state.micActive ? 'mic' : audio.state.playing ? 'audio' : 'animation')}`}
              style={{ ...headerBtnStyle, background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.4)', color: '#ff6b6b' }}
            >
              ⏹
            </button>
          </div>
        </div>

        {/* Row 2: master sliders (full width, always visible) */}
        <div
          className="flex items-center gap-4 px-5"
          style={{ paddingTop: 2, paddingBottom: 10 }}
        >
          <MasterSliders
            masterBright={masterBright}
            smoothness={smoothness}
            attack={attack}
            onMasterBright={handleMasterBright}
            onSmooth={handleSmooth}
            onAttack={handleAttack}
            throttledSlider={throttledSlider}
          />
        </div>
      </header>

      {/* Main content: canvas + tool panel */}
      <div className={`flex-1 flex ${layout === 'right' ? 'flex-row' : 'flex-col'} overflow-hidden`} style={{ minHeight: 0 }}>
        {/* Grid Canvas */}
        <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ padding: 16, minHeight: 0, minWidth: 0 }}>
          <GridDisplay
            grid={gridData}
            columns={GRID_COLUMNS}
            fixtures={FIXTURES}
            currentHue={hue}
            currentSat={sat}
            currentBright={bright}
            mode={tab}
            brushSize={brushSize}
            softEdge={softEdge}
            motionPath={motion.state.path}
            viewFlip={viewFlip && hasOrientation ? orientation : null}
            onCannon={handleCannon}
            onDrop={addDrop}
            onMotionPoint={motion.recordPoint}
            onGradientDrag={handleGradientDrag}
          />
        </div>

        {/* Tool Panel — capped at half the height under the canvas, so a tall
            tab (Patterns) scrolls inside itself instead of squeezing the grid
            out of the window. */}
        <div
          className={layout === 'right' ? 'shrink-0 h-full' : 'shrink-0 flex flex-col'}
          style={layout === 'right' ? undefined : { maxHeight: '50%', minHeight: 0 }}
        >
          <ToolPanel
            tab={tab}
            setTab={handleTabChange}
            layout={layout}
            toolContentProps={toolContentProps}
          />
        </div>
      </div>
    </div>
  );
}
