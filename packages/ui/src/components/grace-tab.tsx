import { useCallback, useMemo, useState } from 'react';

import {
  graceMotion,
  graceStills,
  hsbCss,
  type Look,
  pairGradient,
  PAIRS,
  type RingPair
} from '@/lib/grace-rings';

import { ControlGrid, ControlGroup } from './control-grid';
import { MiniGridPreview, type PreviewFixture } from './mini-grid-preview';

const STILL_PREFIX = 'grace-still';
const MOTION_PREFIX = 'grace-motion';

/** The two rings of twelve, so a tile reads as the room even without previews. */
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

function LookTile({
  look,
  pair,
  active,
  onClick,
  showPreview,
  speed,
  fixtures
}: {
  look: Look;
  pair: RingPair;
  active: boolean;
  onClick: () => void;
  showPreview: boolean;
  speed: number;
  fixtures?: PreviewFixture[];
}) {
  const tileSize = showPreview ? 96 : 72;
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden transition-all active:scale-93"
      style={{
        width: tileSize,
        height: tileSize,
        borderRadius: 16,
        background: showPreview ? '#0a0a12' : pairGradient(pair),
        border: active ? '2.5px solid #fff' : '2.5px solid transparent'
      }}
    >
      {showPreview ? (
        <MiniGridPreview source={look.code} speed={speed} size={tileSize} isPattern fixtures={fixtures} />
      ) : null}
      <span
        className="absolute bottom-1 left-0 right-0 text-center text-white font-semibold"
        style={{ fontSize: 9, textShadow: '0 1px 4px rgba(0,0,0,0.8)', letterSpacing: '0.02em' }}
      >
        {look.name}
      </span>
    </button>
  );
}

/**
 * Grace Cathedral: two concentric rings of twelve and a centre cannon. Colour
 * belongs to the ring, so the operator picks a pair and then a look — changing
 * the pair re-colours whatever is already running rather than stopping the show.
 */
export function GraceTab({
  send,
  activePattern,
  onPatternSelect,
  animSpeed,
  onAnimSpeed,
  fixtures
}: {
  send: (msg: Record<string, unknown>) => void;
  activePattern: string | null;
  onPatternSelect: (id: string) => void;
  animSpeed: number;
  onAnimSpeed: (v: number) => void;
  fixtures?: PreviewFixture[];
}) {
  const [showPreview, setShowPreview] = useState(true);
  const [pairName, setPairName] = useState(PAIRS[0].name);
  const pair = useMemo(() => PAIRS.find((p) => p.name === pairName) ?? PAIRS[0], [pairName]);

  const stills = useMemo(() => graceStills(pair), [pair]);
  const motion = useMemo(() => graceMotion(pair), [pair]);

  const pickPair = useCallback((next: RingPair) => {
    setPairName(next.name);
    if (!activePattern) return;
    const running = [
      ...graceStills(next).map((l) => [STILL_PREFIX, l] as const),
      ...graceMotion(next).map((l) => [MOTION_PREFIX, l] as const)
    ].find(([prefix, l]) => activePattern === `${prefix}-${l.name}`);
    if (running) send({ type: 'evalPattern', code: running[1].code, params: {} });
  }, [activePattern, send]);

  const handleSelect = useCallback((prefix: string, look: Look) => {
    onPatternSelect(`${prefix}-${look.name}`);
    send({ type: 'evalPattern', code: look.code, params: {} });
  }, [onPatternSelect, send]);

  const renderGroup = (label: string, prefix: string, looks: Look[]) => (
    <ControlGroup label={label}>
      <div className="flex gap-2.5 flex-wrap overflow-y-auto" style={{ maxHeight: showPreview ? 320 : undefined }}>
        {looks.map((l) => (
          <LookTile
            key={`${prefix}-${l.name}`}
            look={l}
            pair={pair}
            active={activePattern === `${prefix}-${l.name}`}
            onClick={() => handleSelect(prefix, l)}
            showPreview={showPreview}
            speed={animSpeed}
            fixtures={fixtures}
          />
        ))}
      </div>
    </ControlGroup>
  );

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
      </div>

      <ControlGrid minCellWidth={200}>
        <ControlGroup label={`Ring Colours — ${pair.name}`}>
          <div className="flex gap-2.5 flex-wrap">
            {PAIRS.map((p) => (
              <PairSwatch key={p.name} pair={p} active={p.name === pair.name} onClick={() => pickPair(p)} />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1" style={{ fontSize: 10, color: '#888898' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: hsbCss(pair.outer) }} />
            Outer 12
            <span style={{ width: 12, height: 12, borderRadius: 3, background: hsbCss(pair.inner), marginLeft: 8 }} />
            Inner 12
          </div>
        </ControlGroup>
        {renderGroup('Shapes', STILL_PREFIX, stills)}
        {renderGroup('Droplets & Chases', MOTION_PREFIX, motion)}
      </ControlGrid>
    </div>
  );
}
