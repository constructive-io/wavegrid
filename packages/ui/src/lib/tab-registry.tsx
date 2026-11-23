import { matchesShowWhen, type ShowWhen } from '@wavegrid/animations';
import type { Layout } from '@wavegrid/layout/client';
import type { PoolSettings } from '@wavegrid/pool';
import type { ReactNode } from 'react';

import { AudioTab } from '@/components/audio-tab';
import { BrightnessTab, useBrightnessAnimation } from '@/components/brightness-tab';
import { ColorWheel } from '@/components/color-wheel';
import { ControlGrid, ControlGroup } from '@/components/control-grid';
import { DropsControls } from '@/components/drops-tab';
import { FlagsTab, useFlagAnimation } from '@/components/flags-tab';
import { GracePaintTab } from '@/components/grace-paint-tab';
import { GraceTab, type PreviewEasing } from '@/components/grace-tab';
import { GradientBar, useGradient } from '@/components/gradient-tab';
import { LooksTab } from '@/components/looks-tab';
import type { PreviewFixture } from '@/components/mini-grid-preview';
import { PalaceTab } from '@/components/palace-tab';
import { AnimationPalette, ScenePalette } from '@/components/palette';
import { PatternsTab } from '@/components/patterns-tab';
import { PlaylistTab } from '@/components/playlist-tab';
import { PluginTab } from '@/components/plugin-tab';
import { PoolTab } from '@/components/pool-tab';
import { PrideTab } from '@/components/pride-tab';
import { SequencesTab } from '@/components/sequences-tab';
import { ShiftDial } from '@/components/shift-dial';
import { UsaTab } from '@/components/usa-tab';
import { VideoTab } from '@/components/video-tab';
import type { UIPlugin } from '@/lib/plugin-data';
import type { RegisterPluginPaint } from '@/lib/plugin-view-bridge';
import type { PatternState } from '@/lib/socket-state';
import { useAudio } from '@/lib/use-audio';
import type { GracePaintControls } from '@/lib/use-grace-paint';
import type { PalaceControls } from '@/lib/use-palace';
import type { Look, PlaylistState } from '@/lib/use-socket';

export interface ToolContentProps {
  hue: number; sat: number; bright: number; brushSize: number; softEdge: boolean; trailFade: boolean;
  setHue: (v: number) => void; setSat: (v: number) => void; setBright: (v: number) => void;
  setBrushSize: (v: number) => void; setSoftEdge: (v: boolean) => void; setTrailFade: (v: boolean) => void;
  gradient: ReturnType<typeof useGradient>;
  dropsConfig: { spectrumStart: number; spectrumEnd: number; speed: number; decay: number; width: number };
  setDropsConfig: (c: ToolContentProps['dropsConfig']) => void;
  poolSettings: PoolSettings;
  setPoolSettings: (s: PoolSettings) => void;
  onPoolRelease: () => void;
  onPoolStop: () => void;
  poolBeamsOnly: boolean;
  setPoolBeamsOnly: (v: boolean) => void;
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
  fixtures?: PreviewFixture[];
  layout: Layout;
  activePattern: string | null;
  onPatternSelect: (id: string) => void;
  playlistState: PlaylistState | null;
  easing: PreviewEasing;
  gracePaint: GracePaintControls;
  palace: PalaceControls;
  looks: Look[];
  pattern: PatternState | null;
  registerPluginPaint: RegisterPluginPaint;
}

export interface TabDef {
  id: string;
  label: string;
  showWhen: ShowWhen;
  render: (props: ToolContentProps) => ReactNode;
}

export const allTabs: TabDef[] = [
  {
    id: 'paint', label: 'Paint', showWhen: 'always',
    render: ({ hue, sat, bright, brushSize, softEdge, trailFade, setHue, setSat, setBright, setBrushSize, setSoftEdge, setTrailFade, isPhone }) => (
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
    )
  },
  {
    id: 'palace', label: 'Palace', showWhen: { fixtureKind: 'projector' },
    render: ({ hue, sat, bright, setHue, setSat, setBright, animSpeed, isPhone, fixtures, easing, palace, looks }) => (
      <PalaceTab
        controls={palace}
        looks={looks}
        hue={hue}
        sat={sat}
        bright={bright}
        onHue={setHue}
        onSat={setSat}
        onBright={setBright}
        animSpeed={animSpeed}
        easing={easing}
        fixtures={fixtures}
        compact={isPhone}
      />
    )
  },
  {
    id: 'pool', label: 'Pool', showWhen: 'always',
    render: ({ hue, sat, bright, setHue, setSat, setBright, poolSettings, setPoolSettings, onPoolRelease, onPoolStop, poolBeamsOnly, setPoolBeamsOnly, isPhone }) => (
      <PoolTab
        settings={poolSettings}
        onSettings={setPoolSettings}
        hue={hue}
        sat={sat}
        bright={bright}
        onHue={setHue}
        onSat={setSat}
        onBright={setBright}
        beamsOnly={poolBeamsOnly}
        onBeamsOnly={setPoolBeamsOnly}
        onRelease={onPoolRelease}
        onStop={onPoolStop}
        compact={isPhone}
      />
    )
  },
  {
    id: 'gradient', label: 'Gradient', showWhen: 'always',
    render: ({ hue, sat, bright, gradient }) => (
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
    )
  },
  {
    id: 'scenes', label: 'Scenes', showWhen: 'never',
    render: ({ activeScene, handleScene }) => (
      <ScenePalette active={activeScene} onSelect={handleScene} />
    )
  },
  {
    id: 'animations', label: 'Anim', showWhen: 'never',
    render: ({ activeAnim, handleAnim, animSpeed, onAnimSpeed, brightness, onShift }) => (
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
    )
  },
  {
    id: 'pride', label: 'Pride', showWhen: 'never',
    render: ({ animSpeed, onAnimSpeed, send, activePattern, onPatternSelect }) => (
      <PrideTab
        send={send}
        activePattern={activePattern}
        onPatternSelect={onPatternSelect}
        animSpeed={animSpeed}
        onAnimSpeed={onAnimSpeed}
      />
    )
  },
  {
    id: 'usa', label: 'USA', showWhen: 'never',
    render: ({ animSpeed, onAnimSpeed, send, activePattern, onPatternSelect }) => (
      <UsaTab
        send={send}
        activePattern={activePattern}
        onPatternSelect={onPatternSelect}
        animSpeed={animSpeed}
        onAnimSpeed={onAnimSpeed}
      />
    )
  },
  {
    id: 'grace', label: 'Grace', showWhen: { topology: 'rings' },
    render: ({ animSpeed, onAnimSpeed, send, fixtures, activePattern, onPatternSelect, easing }) => (
      <GraceTab
        send={send}
        activePattern={activePattern}
        onPatternSelect={onPatternSelect}
        animSpeed={animSpeed}
        onAnimSpeed={onAnimSpeed}
        easing={easing}
        fixtures={fixtures}
      />
    )
  },
  {
    id: 'gracepaint', label: 'GracePaint', showWhen: { topology: 'rings' },
    render: ({ hue, sat, bright, setHue, setSat, setBright, animSpeed, isPhone, fixtures, easing, gracePaint }) => (
      <GracePaintTab
        controls={gracePaint}
        hue={hue}
        sat={sat}
        bright={bright}
        onHue={setHue}
        onSat={setSat}
        onBright={setBright}
        animSpeed={animSpeed}
        easing={easing}
        fixtures={fixtures}
        compact={isPhone}
      />
    )
  },
  {
    id: 'looks', label: 'Looks', showWhen: 'never',
    render: ({ animSpeed, fixtures, easing, gracePaint, looks }) => (
      <LooksTab
        looks={looks}
        current={gracePaint.params}
        speed={animSpeed}
        easing={easing}
        fixtures={fixtures}
        onSave={gracePaint.saveLook}
        onApply={gracePaint.applyLook}
        onRename={gracePaint.renameLook}
        onDelete={gracePaint.deleteLook}
      />
    )
  },
  {
    id: 'patterns', label: 'Patterns', showWhen: 'never',
    render: ({ animSpeed, onAnimSpeed, send }) => (
      <PatternsTab send={send} animSpeed={animSpeed} onAnimSpeed={onAnimSpeed} />
    )
  },
  {
    id: 'sequences', label: 'Sequences', showWhen: 'never',
    render: ({ send, layout, playlistState }) => (
      <SequencesTab send={send} playlistState={playlistState} layout={layout} />
    )
  },
  {
    id: 'playlist', label: 'Playlist', showWhen: 'never',
    render: ({ send, layout, playlistState }) => (
      <PlaylistTab
        send={send}
        playlistState={playlistState as Parameters<typeof PlaylistTab>[0]['playlistState']}
        layout={layout}
      />
    )
  },
  {
    id: 'flags', label: 'Flags', showWhen: 'never',
    render: ({ flags }) => (
      <FlagsTab
        activeFlag={flags.activeFlag}
        effect={flags.effect}
        purpleBlack={flags.purpleBlack}
        onSelectFlag={flags.selectFlag}
        onEffect={flags.setEffect}
        onPurpleBlack={flags.setPurpleBlack}
      />
    )
  },
  {
    id: 'drops', label: 'Drops', showWhen: 'never',
    render: ({ dropsConfig, setDropsConfig }) => (
      <DropsControls config={dropsConfig} onChange={setDropsConfig} />
    )
  },
  {
    id: 'audio', label: 'Audio', showWhen: 'never',
    render: ({ audio }) => (
      <AudioTab audio={audio} />
    )
  },
  {
    id: 'video', label: 'Video', showWhen: 'never',
    render: ({ send, numCannons, gridColumns }) => (
      <VideoTab send={send} numCannons={numCannons} gridColumns={gridColumns} />
    )
  }
];

export function registryFor(plugins: UIPlugin[]): TabDef[] {
  return [...allTabs, ...plugins.flatMap(plugin => plugin.tabs.map(tab => ({
    id: tab.id, label: tab.label, showWhen: tab.showWhen,
    render: ({ send, pattern, onPatternSelect, layout, looks, registerPluginPaint }: ToolContentProps) => (
      <PluginTab key={tab.id} pluginId={plugin.id} tab={tab} presetsFile={plugin.presetsFile} send={send} pattern={pattern}
        onPatternSelect={onPatternSelect} layout={layout} looks={looks} registerPluginPaint={registerPluginPaint} />
    )
  })))];
}

export function tabById(id: string, registry: TabDef[] = allTabs): TabDef | undefined {
  return registry.find(tab => tab.id === id);
}

export function tabsFor(layout: Layout, registry: TabDef[] = allTabs): TabDef[] {
  return registry.filter(tab => matchesShowWhen(tab.showWhen, layout));
}
