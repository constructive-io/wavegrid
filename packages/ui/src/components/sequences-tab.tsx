import { layoutFilters, showDuration, type ShowPreset, showPresetsForLayout } from '@wavegrid/animations';
import type { Layout } from '@wavegrid/layout/client';
import { useCallback, useMemo } from 'react';

import type { PlaylistState } from '@/lib/use-socket';

import { LayoutFilterChips, useLayoutFilter } from './layout-filter';

type Sequence = ShowPreset & { reason: string };

// ── Helpers ───────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m${s > 0 ? ' ' + s + 's' : ''}` : `${s}s`;
}

function stepLabel(step: { type: string; name?: string }): string {
  if (step.type === 'evalPattern') return 'Custom Pattern';
  return step.name ?? 'Unknown';
}

// ── Component ─────────────────────────────────────────────────────────

export function SequencesTab({
  send,
  playlistState,
  layout
}: {
  send: (msg: Record<string, unknown>) => void;
  playlistState: PlaylistState | null;
  layout: Layout;
}) {
  const [filter, setFilter] = useLayoutFilter('wavegrid-sequence-filter');

  // The rig a sequence is judged against: this installation for "All", or the
  // chosen reference rig — so an operator can see what a Nova show needs even
  // when they are sitting in front of a 7×7.
  const judgedAgainst = useMemo(() => {
    const chosen = layoutFilters().find(f => f.id === filter);
    return chosen?.layout ?? layout;
  }, [filter, layout]);

  const sequences = useMemo(
    () => showPresetsForLayout(judgedAgainst, 'sequence'),
    [judgedAgainst]
  );

  const activeSequenceName = playlistState?.active && playlistState.playlist
    ? findActiveSequenceName(sequences, playlistState.playlist.steps)
    : null;

  const handlePlay = useCallback((seq: Sequence) => {
    send({
      type: 'playlist',
      steps: seq.steps,
      loop: seq.loop,
      transition: seq.transition,
      transitionDuration: seq.transitionDuration
    });
  }, [send]);

  const handleStop = useCallback(() => {
    send({ type: 'playlist_stop' });
  }, [send]);

  const handleSkip = useCallback((direction: 'next' | 'back') => {
    send({ type: 'playlist_skip', direction });
  }, [send]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      {/* Transport controls — always visible, fixed at top */}
      <div style={{ flexShrink: 0 }}>
        <p
          className="text-xs font-medium"
          style={{ color: '#888898', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}
        >
          Now Playing
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSkip('back')}
            disabled={!playlistState?.active}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#1a1a25', border: '1px solid #2a2a35',
              color: playlistState?.active ? '#fff' : '#444', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: playlistState?.active ? 1 : 0.5
            }}
          >
            ⏮
          </button>
          <button
            onClick={handleStop}
            disabled={!playlistState?.active}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: playlistState?.active ? '#3a1515' : '#1a1a25',
              border: '1px solid ' + (playlistState?.active ? '#5a2525' : '#2a2a35'),
              color: playlistState?.active ? '#ff6666' : '#444', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: playlistState?.active ? 1 : 0.5
            }}
          >
            ⏹
          </button>
          <button
            onClick={() => handleSkip('next')}
            disabled={!playlistState?.active}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#1a1a25', border: '1px solid #2a2a35',
              color: playlistState?.active ? '#fff' : '#444', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: playlistState?.active ? 1 : 0.5
            }}
          >
            ⏭
          </button>
          <div style={{ marginLeft: 6, flex: 1, minWidth: 0 }}>
            {playlistState?.active ? (
              <>
                <div style={{ fontSize: 12, color: '#ddd', fontWeight: 600 }}>
                  {activeSequenceName ?? 'Sequence'}
                </div>
                <div style={{ fontSize: 10, color: '#888' }}>
                  Step {(playlistState.currentStep ?? 0) + 1}/{playlistState.playlist?.steps.length ?? '?'}
                  {playlistState.playlist?.steps[playlistState.currentStep] && (
                    <> &middot; {stepLabel(playlistState.playlist.steps[playlistState.currentStep])}</>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: '#555' }}>No sequence playing</div>
            )}
          </div>
        </div>

        {/* Step list — compact, scrollable */}
        {playlistState?.active && playlistState.playlist?.steps && (
          <div style={{ maxHeight: 100, overflowY: 'auto', borderRadius: 6, background: '#0a0a10', padding: 4, marginTop: 6 }}>
            {playlistState.playlist.steps.map((step, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1"
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  background: idx === playlistState.currentStep ? '#1a2a3a' : 'transparent',
                  color: idx === playlistState.currentStep ? '#8cf' : '#666'
                }}
              >
                <span style={{ minWidth: 14 }}>{idx + 1}.</span>
                <span style={{ flex: 1 }}>{stepLabel(step)}</span>
                <span style={{ color: '#444' }}>{formatDuration(step.duration)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sequence presets — fills remaining height, scrolls */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between gap-2" style={{ flexShrink: 0, marginBottom: 8 }}>
          <p
            className="text-xs font-medium"
            style={{ color: '#888898', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Sequences
          </p>
          <LayoutFilterChips value={filter} onChange={setFilter} layout={layout} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 6
          }}>
            {sequences.map((seq) => (
              <SequenceCard
                key={seq.id}
                sequence={seq}
                active={activeSequenceName === seq.name}
                onPlay={() => handlePlay(seq)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SequenceCard({
  sequence,
  active,
  onPlay
}: {
  sequence: Sequence;
  active: boolean;
  onPlay: () => void;
}) {
  const total = showDuration(sequence.steps);
  const mins = Math.round(total / 60);
  const unsuited = sequence.reason !== '';

  return (
    <button
      onClick={onPlay}
      className="text-left transition-transform active:scale-97"
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        background: active
          ? 'linear-gradient(135deg, #1a2a3a, #0a1a2a)'
          : '#0a0a10',
        border: active ? '2px solid #4488cc' : '1.5px solid #1a1a25',
        cursor: 'pointer',
        width: '100%',
        // Still playable: a rig can be re-pointed, and the operator knows more
        // about the room than the layout does.
        opacity: unsuited ? 0.55 : 1
      }}
    >
      <div className="flex items-center gap-2">
        <div
          style={{
            width: 28, height: 28, borderRadius: 7,
            background: sequence.gradient,
            flexShrink: 0
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#eee', fontWeight: 600 }}>
            {sequence.name}
            <span style={{ fontSize: 10, color: '#666', fontWeight: 400, marginLeft: 6 }}>
              {sequence.steps.length} steps &middot; ~{mins}m
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#777', marginTop: 1 }}>
            {sequence.description}
          </div>
          {unsuited && (
            <div style={{ fontSize: 9, color: '#c08040', marginTop: 2 }}>
              {sequence.reason}
            </div>
          )}
        </div>
        {active && (
          <div style={{ fontSize: 9, color: '#4488cc', fontWeight: 600 }}>
            PLAYING
          </div>
        )}
      </div>
    </button>
  );
}

/** Try to match active playlist steps to a known sequence name. */
function findActiveSequenceName(
  sequences: Sequence[],
  steps: Array<{ type: string; name?: string; duration: number }>
): string | null {
  for (const seq of sequences) {
    if (seq.steps.length !== steps.length) continue;
    const match = seq.steps.every((s, i) =>
      s.type === steps[i].type && s.name === steps[i].name && s.duration === steps[i].duration
    );
    if (match) return seq.name;
  }
  return null;
}
