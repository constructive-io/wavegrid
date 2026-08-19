import { layoutFilters, type LookDef, looksForLayout, type ShowPreset, showPresetsForLayout } from '@wavegrid/animations';
import type { Layout } from '@wavegrid/layout/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LayoutFilterChips, useLayoutFilter } from './layout-filter';

interface PlaylistStep {
  type: 'animation' | 'scene' | 'evalPattern';
  name?: string;
  code?: string;
  duration: number;
}

type Look = LookDef & { reason: string };

interface PlaylistDef {
  steps: PlaylistStep[];
  loop: boolean;
  transition: 'cut' | 'fade';
  transitionDuration: number;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s > 0 ? s + 's' : ''}`.trim() : `${s}s`;
}

/**
 * One option per look, labelled with what it needs when this rig can't give it
 * — the list stays complete so a look is never silently missing.
 */
function LookOptions({ looks }: { looks: Look[] }) {
  return (
    <>
      {looks.map(l => (
        <option key={l.id} value={l.id}>
          {l.label}{l.reason ? ` — ${l.reason}` : ''}
        </option>
      ))}
    </>
  );
}

function StepRow({
  step,
  index,
  animations,
  scenes,
  onRemove,
  onUpdate
}: {
  step: PlaylistStep;
  index: number;
  animations: Look[];
  scenes: Look[];
  onRemove: () => void;
  onUpdate: (s: PlaylistStep) => void;
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: '8px 12px',
        borderRadius: 12,
        background: '#0a0a10',
        border: '1px solid #1a1a25'
      }}
    >
      <span style={{ fontSize: 11, color: '#555', minWidth: 18 }}>{index + 1}.</span>

      {/* Type selector */}
      <select
        value={step.type}
        onChange={(e) => {
          const type = e.target.value as PlaylistStep['type'];
          if (type === 'animation') onUpdate({ type, name: animations[0]?.id, duration: step.duration });
          else if (type === 'scene') onUpdate({ type, name: scenes[0]?.id, duration: step.duration });
          else onUpdate({ type, code: '({ render(ctx) { ctx.fill(ctx.t * 30 % 360, 100, 80); } })', duration: step.duration });
        }}
        style={{
          fontSize: 12,
          background: '#12121a',
          border: '1px solid #1a1a25',
          borderRadius: 8,
          padding: '4px 8px',
          color: '#c8c8d8'
        }}
      >
        <option value="animation">Anim</option>
        <option value="scene">Scene</option>
        <option value="evalPattern">Code</option>
      </select>

      {/* Name/code selector */}
      {step.type === 'animation' && (
        <select
          value={step.name || ''}
          onChange={(e) => onUpdate({ ...step, name: e.target.value })}
          style={{
            flex: 1,
            fontSize: 12,
            background: '#12121a',
            border: '1px solid #1a1a25',
            borderRadius: 8,
            padding: '4px 8px',
            color: '#c8c8d8'
          }}
        >
          <LookOptions looks={animations} />
        </select>
      )}

      {step.type === 'scene' && (
        <select
          value={step.name || ''}
          onChange={(e) => onUpdate({ ...step, name: e.target.value })}
          style={{
            flex: 1,
            fontSize: 12,
            background: '#12121a',
            border: '1px solid #1a1a25',
            borderRadius: 8,
            padding: '4px 8px',
            color: '#c8c8d8'
          }}
        >
          <LookOptions looks={scenes} />
        </select>
      )}

      {step.type === 'evalPattern' && (
        <input
          type="text"
          value={step.code || ''}
          onChange={(e) => onUpdate({ ...step, code: e.target.value })}
          placeholder="({ render(ctx) { ... } })"
          style={{
            flex: 1,
            fontSize: 11,
            fontFamily: 'monospace',
            background: '#12121a',
            border: '1px solid #1a1a25',
            borderRadius: 8,
            padding: '4px 8px',
            color: '#c8c8d8'
          }}
        />
      )}

      {/* Duration */}
      <input
        type="number"
        min={5}
        max={3600}
        value={step.duration}
        onChange={(e) => onUpdate({ ...step, duration: Math.max(5, Number(e.target.value)) })}
        style={{
          width: 60,
          fontSize: 12,
          background: '#12121a',
          border: '1px solid #1a1a25',
          borderRadius: 8,
          padding: '4px 8px',
          color: '#c8c8d8',
          textAlign: 'center'
        }}
      />
      <span style={{ fontSize: 10, color: '#666', minWidth: 10 }}>s</span>

      {/* Remove */}
      <button
        onClick={onRemove}
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          background: 'transparent',
          border: '1px solid #333',
          color: '#f87171',
          fontSize: 14,
          lineHeight: 1,
          cursor: 'pointer'
        }}
      >
        ×
      </button>
    </div>
  );
}

export function PlaylistTab({
  send,
  playlistState,
  layout
}: {
  send: (msg: Record<string, unknown>) => void;
  playlistState: { active: boolean; playlist: PlaylistDef | null } | null;
  layout: Layout;
}) {
  const [filter, setFilter] = useLayoutFilter('wavegrid-playlist-filter');

  // "All" means this installation; a named rig lets an operator build a show
  // for a rig they are not standing in front of.
  const judgedAgainst = useMemo(() => {
    const chosen = layoutFilters().find(f => f.id === filter);
    return chosen?.layout ?? layout;
  }, [filter, layout]);

  const animationLooks = useMemo(() => looksForLayout(judgedAgainst, 'animation'), [judgedAgainst]);
  const sceneLooks = useMemo(() => looksForLayout(judgedAgainst, 'scene'), [judgedAgainst]);
  const presets = useMemo(() => showPresetsForLayout(judgedAgainst, 'playlist'), [judgedAgainst]);

  const [steps, setSteps] = useState<PlaylistStep[]>([
    { type: 'animation', name: 'rainbow', duration: 180 },
    { type: 'animation', name: 'wave', duration: 180 },
    { type: 'animation', name: 'breathe', duration: 120 }
  ]);
  const [loop, setLoop] = useState(true);
  const [transition, setTransition] = useState<'cut' | 'fade'>('fade');
  const [transitionDuration, setTransitionDuration] = useState(2);

  // Sync with server state on load
  useEffect(() => {
    if (playlistState?.playlist) {
      setSteps(playlistState.playlist.steps);
      setLoop(playlistState.playlist.loop);
      setTransition(playlistState.playlist.transition);
      setTransitionDuration(playlistState.playlist.transitionDuration);
    }
  }, [playlistState]);

  const handlePlay = useCallback(() => {
    send({
      type: 'playlist',
      steps,
      loop,
      transition,
      transitionDuration
    });
  }, [send, steps, loop, transition, transitionDuration]);

  const handleStop = useCallback(() => {
    send({ type: 'playlist_stop' });
  }, [send]);

  const addStep = useCallback(() => {
    setSteps(prev => [...prev, { type: 'animation', name: animationLooks[0]?.id ?? 'rainbow', duration: 60 }]);
  }, [animationLooks]);

  const removeStep = useCallback((idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateStep = useCallback((idx: number, step: PlaylistStep) => {
    setSteps(prev => prev.map((s, i) => i === idx ? step : s));
  }, []);

  const loadPreset = useCallback((preset: ShowPreset) => {
    setSteps(preset.steps);
    setLoop(preset.loop);
    setTransition(preset.transition);
    setTransitionDuration(preset.transitionDuration);
  }, []);

  const totalDuration = steps.reduce((acc, s) => acc + s.duration, 0);
  const isActive = playlistState?.active ?? false;

  return (
    <div className="flex flex-col gap-4">
      <LayoutFilterChips value={filter} onChange={setFilter} layout={layout} />

      {/* Presets */}
      <div className="flex gap-2 flex-wrap">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => loadPreset(p)}
            title={p.reason || p.description}
            style={{
              padding: '6px 12px',
              borderRadius: 16,
              fontSize: 12,
              fontWeight: 500,
              background: '#12121a',
              border: '1px solid #1a1a25',
              color: '#888898',
              opacity: p.reason ? 0.55 : 1
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Steps list */}
      <div className="flex flex-col gap-2">
        {steps.map((step, idx) => (
          <StepRow
            key={idx}
            step={step}
            index={idx}
            animations={animationLooks}
            scenes={sceneLooks}
            onRemove={() => removeStep(idx)}
            onUpdate={(s) => updateStep(idx, s)}
          />
        ))}
      </div>

      {/* Add step */}
      <button
        onClick={addStep}
        style={{
          padding: '8px 16px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 500,
          background: '#12121a',
          border: '1px dashed #333',
          color: '#888898',
          cursor: 'pointer'
        }}
      >
        + Add Step
      </button>

      {/* Settings row */}
      <div className="flex gap-4 items-center flex-wrap" style={{ fontSize: 12, color: '#888898' }}>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
          />
          Loop
        </label>

        <label className="flex items-center gap-2">
          Transition:
          <select
            value={transition}
            onChange={(e) => setTransition(e.target.value as 'cut' | 'fade')}
            style={{
              fontSize: 12,
              background: '#12121a',
              border: '1px solid #1a1a25',
              borderRadius: 8,
              padding: '3px 8px',
              color: '#c8c8d8'
            }}
          >
            <option value="cut">Cut</option>
            <option value="fade">Fade</option>
          </select>
        </label>

        {transition === 'fade' && (
          <label className="flex items-center gap-2">
            Fade:
            <input
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              value={transitionDuration}
              onChange={(e) => setTransitionDuration(Number(e.target.value))}
              style={{
                width: 50,
                fontSize: 12,
                background: '#12121a',
                border: '1px solid #1a1a25',
                borderRadius: 8,
                padding: '3px 8px',
                color: '#c8c8d8',
                textAlign: 'center'
              }}
            />
            s
          </label>
        )}

        <span style={{ color: '#555' }}>
          Total: {formatDuration(totalDuration)}
        </span>
      </div>

      {/* Play/Stop controls */}
      <div className="flex gap-2 items-center">
        <button
          onClick={handlePlay}
          style={{
            padding: '10px 24px',
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 600,
            background: isActive ? '#1a3a2a' : '#1a1a2e',
            border: isActive ? '1px solid #2a5a3a' : '1px solid #333',
            color: isActive ? '#4ade80' : '#e8e8f0'
          }}
        >
          {isActive ? 'Update' : 'Play'}
        </button>
        <button
          onClick={handleStop}
          style={{
            padding: '10px 24px',
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 600,
            background: '#1a1a2e',
            border: '1px solid #333',
            color: '#f87171'
          }}
        >
          Stop
        </button>
        {isActive && (
          <span style={{ fontSize: 12, color: '#4ade80' }}>
            Playlist running ({steps.length} steps, {formatDuration(totalDuration)}{loop ? ', looping' : ''})
          </span>
        )}
      </div>
    </div>
  );
}
