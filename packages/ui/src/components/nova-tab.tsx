import { useCallback, useState } from 'react';

import { ControlGrid, ControlGroup } from './control-grid';
import { MiniGridPreview } from './mini-grid-preview';
import { NovaSlots } from './nova-slots';

// ── Palettes (HSB triples), sent to the server as source strings ───────────
// A 6-laser ring can't draw shapes — Nova is about colour and feeling. Every
// motion below moves colour or brightness *around the ring* using the fixture
// angle (ctx.polar) so it reads as a ring, never a rectangle.

interface Palette {
  colorsCode: string;
  css: string;
}

const NOVA_COLORS: Palette = {
  colorsCode: `var COLORS = [[275,90,100],[315,100,100],[190,95,100],[275,90,100]];`,
  css: 'conic-gradient(#7c4aff, #ff3cc7, #23d3ff, #7c4aff)'
};

const ISRAEL_COLORS: Palette = {
  colorsCode: `var COLORS = [[214,80,95],[0,0,100],[214,80,95],[0,0,100]];`,
  css: 'conic-gradient(#2a5bd7, #ffffff, #2a5bd7, #ffffff)'
};

const PRIDE_COLORS: Palette = {
  colorsCode: `var COLORS = [[0,100,100],[35,100,100],[55,100,100],[130,90,90],[215,100,100],[285,90,95]];`,
  css: 'conic-gradient(#e40303, #ff8c00, #ffed00, #008026, #004dff, #750787, #e40303)'
};

const FIRE_COLORS: Palette = {
  colorsCode: `var COLORS = [[0,100,100],[16,100,100],[36,100,100],[16,100,100]];`,
  css: 'conic-gradient(#ff2200, #ff7a00, #ffb300, #ff2200)'
};

const OCEAN_COLORS: Palette = {
  colorsCode: `var COLORS = [[190,90,100],[210,95,95],[165,80,95],[190,90,100]];`,
  css: 'conic-gradient(#00d5ff, #0066ff, #00ffb3, #00d5ff)'
};

const SUNSET_COLORS: Palette = {
  colorsCode: `var COLORS = [[8,100,100],[28,100,100],[330,75,100],[275,70,90]];`,
  css: 'conic-gradient(#ff3b1f, #ff9a3c, #ff4da6, #a24dff)'
};

// Amber is its own family: one hue for the whole ring, so every amber look
// below says what it has to say with brightness alone.
const AMBER_COLORS: Palette = {
  colorsCode: `var COLORS = [[40,100,100]];`,
  css: 'conic-gradient(#ffb000, #7a4f00, #ffb000)'
};

const RAINBOW_COLORS: Palette = {
  colorsCode: `var COLORS = [[0,100,100],[60,100,100],[120,100,100],[180,100,100],[240,100,100],[300,100,100]];`,
  css: 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
};

// ── Ring helpers shared by every pattern below ─────────────────────────────

function colorHelpersCode(): string {
  return `
function lerpColor(a, b, t) {
  var dh = b[0] - a[0];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return [
    ((a[0] + dh * t) % 360 + 360) % 360,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}
function colorAt(pos) {
  var p = ((pos % 1) + 1) % 1;
  var scaled = p * COLORS.length;
  var idx = Math.floor(scaled);
  var mix = scaled - idx;
  var a = COLORS[idx % COLORS.length];
  var b = COLORS[(idx + 1) % COLORS.length];
  return lerpColor(a, b, mix);
}
// Normalized 0..1 position of fixture i around the ring, from its angle.
function ringPos(ctx, i) {
  var ang = ctx.polar(i)[1];
  return ((ang / (Math.PI * 2)) % 1 + 1) % 1;
}
// Shortest 0..0.5 distance between two 0..1 ring positions.
function ringDist(a, b) {
  var d = Math.abs(a - b);
  return d > 0.5 ? 1 - d : d;
}
`;
}

function wrap(name: string, body: string, colorsCode: string): string {
  return `(function(){\n${colorsCode}\n${colorHelpersCode()}\nreturn {\nrender: function(ctx) {\n${body}\n},\nmeta: { name: '${name}' }\n};\n})()`;
}

/** Colour gradient slowly rotating around the ring. */
function ringSpin(name: string, colorsCode: string): string {
  return wrap(name, `  var spin = ctx.t * 0.05;
  for (var i = 0; i < ctx.count; i++) {
    var c = colorAt(ringPos(ctx, i) + spin);
    ctx.set(i, c[0], c[1], 100);
  }`, colorsCode);
}

/** A bright comet head travels the ring, tail fading; colour fixed per position. */
function ringComet(name: string, colorsCode: string): string {
  return wrap(name, `  var head = (ctx.t * 0.09) % 1;
  for (var i = 0; i < ctx.count; i++) {
    var pos = ringPos(ctx, i);
    var d = ringDist(pos, head);
    var b = Math.max(0, 100 - d * ctx.count * 42);
    var c = colorAt(pos);
    ctx.set(i, c[0], c[1], b);
  }`, colorsCode);
}

/** Brightness wave sweeping around the ring; hue drifts slowly. */
function ringPulseWave(name: string, colorsCode: string): string {
  return wrap(name, `  var c = colorAt(ctx.t * 0.02);
  for (var i = 0; i < ctx.count; i++) {
    var pos = ringPos(ctx, i);
    var phase = Math.sin((pos - ctx.t * 0.08) * Math.PI * 2);
    var b = 35 + 65 * (0.5 + 0.5 * phase);
    ctx.set(i, c[0], c[1], b);
  }`, colorsCode);
}

/** Whole ring breathes as one, colour slowly cycling. */
function ringBreathe(name: string, colorsCode: string): string {
  return wrap(name, `  var c = colorAt(ctx.t * 0.02);
  var b = 55 + 45 * Math.sin(ctx.t * 0.5);
  ctx.fill(c[0], c[1], Math.max(5, b));`, colorsCode);
}

/** Colour drifts slowly while a gentle brightness shimmer rolls around. */
function ringAurora(name: string, colorsCode: string): string {
  return wrap(name, `  for (var i = 0; i < ctx.count; i++) {
    var pos = ringPos(ctx, i);
    var c = colorAt(pos * 0.5 + ctx.t * 0.04);
    var b = 70 + 30 * Math.sin((pos - ctx.t * 0.06) * Math.PI * 2);
    ctx.set(i, c[0], c[1], Math.max(25, b));
  }`, colorsCode);
}

/** Static ring: each slot a colour spread evenly around the palette. */
function ringStatic(name: string, colorsCode: string): string {
  return wrap(name, `  for (var i = 0; i < ctx.count; i++) {
    var c = colorAt(i / ctx.count);
    ctx.set(i, c[0], c[1], 100);
  }`, colorsCode);
}

// ── Amber: one hue, brightness only ───────────────────────────────────────
// These mirror the shared amber looks in @wavegrid/animations so the artist UI
// and the desktop Nova panel offer the same vocabulary. LEVELS is the same
// brightness ladder: six steps for six lasers.
function amber(name: string, body: string): string {
  return wrap(name, body, `${AMBER_COLORS.colorsCode}\nvar LEVELS = [100,74,52,34,20,10];`);
}

/** Which of the ring's slots a fixture sits in, from its angle. */
const AMBER_SLOT = `  var slot = Math.round(ringPos(ctx, i) * ctx.count) % ctx.count;`;

/** Every laser at one brightness. */
function amberFlat(name: string, level: number): string {
  return amber(name, `  ctx.fill(40, 100, ${level});`);
}

const AMBER_PRESETS_CODE = {
  alternate: amber('amber-alternate', `  for (var i = 0; i < ctx.count; i++) {
${AMBER_SLOT}
    ctx.set(i, 40, 100, slot % 2 === 0 ? 100 : 22);
  }`),
  ramp: amber('amber-ramp', `  for (var i = 0; i < ctx.count; i++) {
${AMBER_SLOT}
    ctx.set(i, 40, 100, LEVELS[slot % LEVELS.length]);
  }`),
  horizon: amber('amber-horizon', `  for (var i = 0; i < ctx.count; i++) {
    ctx.set(i, 40, 100, ringPos(ctx, i) < 0.5 ? 100 : 25);
  }`)
};

const AMBER_MOTION_CODE = {
  chase: amber('amber-chase', `  var lit = Math.floor(ctx.t * 4) % ctx.count;
  for (var i = 0; i < ctx.count; i++) {
${AMBER_SLOT}
    ctx.set(i, 40, 100, slot === lit ? 100 : 8);
  }`),
  levels: amber('amber-levels', `  var offset = Math.floor(ctx.t * 3);
  for (var i = 0; i < ctx.count; i++) {
${AMBER_SLOT}
    ctx.set(i, 40, 100, LEVELS[(slot + offset) % LEVELS.length]);
  }`),
  heartbeat: amber('amber-heartbeat', `  var swing = 0.5 + 0.5 * Math.sin(ctx.t * 2);
  for (var i = 0; i < ctx.count; i++) {
${AMBER_SLOT}
    var level = slot % 2 === 0 ? swing : 1 - swing;
    ctx.set(i, 40, 100, 12 + 88 * level);
  }`),
  embers: amber('amber-embers', `  for (var i = 0; i < ctx.count; i++) {
    var pos = ringPos(ctx, i);
    var flicker = Math.sin(ctx.t * 1.3 + pos * 11) * 0.6 + Math.sin(ctx.t * 0.8 + pos * 27) * 0.4;
    ctx.set(i, 40, 100, Math.max(5, 55 + 40 * flicker));
  }`)
};

interface PatternDef {
  name: string;
  gradient: string;
  code: string;
}

const NOVA_SIGNATURE: PatternDef[] = [
  { name: 'Nova Spin', gradient: NOVA_COLORS.css, code: ringSpin('nova-spin', NOVA_COLORS.colorsCode) },
  { name: 'Nova Comet', gradient: NOVA_COLORS.css, code: ringComet('nova-comet', NOVA_COLORS.colorsCode) },
  { name: 'Nova Aurora', gradient: NOVA_COLORS.css, code: ringAurora('nova-aurora', NOVA_COLORS.colorsCode) },
  { name: 'Nova Pulse', gradient: NOVA_COLORS.css, code: ringPulseWave('nova-pulse', NOVA_COLORS.colorsCode) },
  { name: 'Nova Breathe', gradient: 'radial-gradient(circle, #ff3cc7, #7c4aff, #23d3ff)', code: ringBreathe('nova-breathe', NOVA_COLORS.colorsCode) }
];

const COLOR_AROUND: PatternDef[] = [
  { name: 'Israel', gradient: ISRAEL_COLORS.css, code: ringSpin('israel-spin', ISRAEL_COLORS.colorsCode) },
  { name: 'Pride', gradient: PRIDE_COLORS.css, code: ringSpin('pride-spin', PRIDE_COLORS.colorsCode) },
  { name: 'Fire', gradient: FIRE_COLORS.css, code: ringSpin('fire-spin', FIRE_COLORS.colorsCode) },
  { name: 'Ocean', gradient: OCEAN_COLORS.css, code: ringSpin('ocean-spin', OCEAN_COLORS.colorsCode) },
  { name: 'Sunset', gradient: SUNSET_COLORS.css, code: ringSpin('sunset-spin', SUNSET_COLORS.colorsCode) },
  { name: 'Rainbow', gradient: RAINBOW_COLORS.css, code: ringSpin('rainbow-spin', RAINBOW_COLORS.colorsCode) }
];

const BRIGHTNESS_AROUND: PatternDef[] = [
  { name: 'Israel Comet', gradient: ISRAEL_COLORS.css, code: ringComet('israel-comet', ISRAEL_COLORS.colorsCode) },
  { name: 'Pride Comet', gradient: PRIDE_COLORS.css, code: ringComet('pride-comet', PRIDE_COLORS.colorsCode) },
  { name: 'Fire Comet', gradient: FIRE_COLORS.css, code: ringComet('fire-comet', FIRE_COLORS.colorsCode) },
  { name: 'Ocean Wave', gradient: OCEAN_COLORS.css, code: ringPulseWave('ocean-wave', OCEAN_COLORS.colorsCode) },
  { name: 'Sunset Wave', gradient: SUNSET_COLORS.css, code: ringPulseWave('sunset-wave', SUNSET_COLORS.colorsCode) },
  { name: 'Fire Breathe', gradient: 'radial-gradient(circle, #ffb300, #ff2200)', code: ringBreathe('fire-breathe', FIRE_COLORS.colorsCode) }
];

const AMBER_PRESETS: PatternDef[] = [
  { name: 'Amber', gradient: AMBER_COLORS.css, code: amberFlat('amber', 100) },
  { name: 'Glow', gradient: AMBER_COLORS.css, code: amberFlat('amber-glow', 45) },
  { name: 'Alternate', gradient: AMBER_COLORS.css, code: AMBER_PRESETS_CODE.alternate },
  { name: 'Ramp', gradient: AMBER_COLORS.css, code: AMBER_PRESETS_CODE.ramp },
  { name: 'Horizon', gradient: AMBER_COLORS.css, code: AMBER_PRESETS_CODE.horizon }
];

const AMBER_MOTION: PatternDef[] = [
  { name: 'Chase', gradient: AMBER_COLORS.css, code: AMBER_MOTION_CODE.chase },
  { name: 'Comet', gradient: AMBER_COLORS.css, code: ringComet('amber-comet', AMBER_COLORS.colorsCode) },
  { name: 'Wave', gradient: AMBER_COLORS.css, code: ringPulseWave('amber-wave', AMBER_COLORS.colorsCode) },
  { name: 'Levels', gradient: AMBER_COLORS.css, code: AMBER_MOTION_CODE.levels },
  { name: 'Heartbeat', gradient: AMBER_COLORS.css, code: AMBER_MOTION_CODE.heartbeat },
  { name: 'Embers', gradient: AMBER_COLORS.css, code: AMBER_MOTION_CODE.embers },
  { name: 'Breathe', gradient: 'radial-gradient(circle, #ffc44d, #7a4f00)', code: ringBreathe('amber-breathe', AMBER_COLORS.colorsCode) }
];

const RING_COLORS: PatternDef[] = [
  { name: 'Israel', gradient: ISRAEL_COLORS.css, code: ringStatic('israel-static', ISRAEL_COLORS.colorsCode) },
  { name: 'Pride', gradient: PRIDE_COLORS.css, code: ringStatic('pride-static', PRIDE_COLORS.colorsCode) },
  { name: 'Nova', gradient: NOVA_COLORS.css, code: ringStatic('nova-static', NOVA_COLORS.colorsCode) },
  { name: 'Sunset', gradient: SUNSET_COLORS.css, code: ringStatic('sunset-static', SUNSET_COLORS.colorsCode) },
  { name: 'Rainbow', gradient: RAINBOW_COLORS.css, code: ringStatic('rainbow-static', RAINBOW_COLORS.colorsCode) }
];

function PatternTile({
  pattern,
  active,
  onClick,
  showPreview,
  speed,
  ring
}: {
  pattern: PatternDef;
  active: boolean;
  onClick: () => void;
  showPreview?: boolean;
  speed?: number;
  ring: number;
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
        background: showPreview ? '#0a0a12' : pattern.gradient,
        border: active ? '2.5px solid #fff' : '2.5px solid transparent'
      }}
    >
      {showPreview ? (
        <MiniGridPreview
          source={pattern.code}
          speed={speed}
          size={tileSize}
          isPattern
          ring={ring}
        />
      ) : null}
      <span
        className="absolute bottom-1 left-0 right-0 text-center text-white font-semibold"
        style={{
          fontSize: 9,
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          letterSpacing: '0.02em'
        }}
      >
        {pattern.name}
      </span>
    </button>
  );
}

function PreviewToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
      style={{
        background: enabled ? '#2563eb' : '#1a1a25',
        color: enabled ? '#fff' : '#888898',
        border: '1px solid ' + (enabled ? '#3b82f6' : '#2a2a35')
      }}
      title={enabled ? 'Hide previews' : 'Show animated previews'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {enabled ? (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        ) : (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </>
        )}
      </svg>
      Preview
    </button>
  );
}

export function NovaTab({
  send,
  activePattern,
  onPatternSelect,
  animSpeed,
  onAnimSpeed,
  numCannons,
  gridColumns
}: {
  send: (msg: Record<string, unknown>) => void;
  activePattern: string | null;
  onPatternSelect: (id: string) => void;
  animSpeed: number;
  onAnimSpeed: (v: number) => void;
  numCannons: number;
  gridColumns: number;
}) {
  const [showPreview, setShowPreview] = useState(true);
  const ring = numCannons > 0 ? numCannons : 6;

  const handleSelect = useCallback((groupPrefix: string, pattern: PatternDef) => {
    const id = `${groupPrefix}-${pattern.name}`;
    onPatternSelect(id);
    send({ type: 'evalPattern', code: pattern.code, params: {} });
  }, [send, onPatternSelect]);

  const renderGroup = (label: string, prefix: string, patterns: PatternDef[]) => (
    <ControlGroup label={label}>
      <div className="flex gap-2.5 flex-wrap overflow-y-auto" style={{ maxHeight: showPreview ? 320 : undefined }}>
        {patterns.map((p) => (
          <PatternTile
            key={`${prefix}-${p.name}`}
            pattern={p}
            active={activePattern === `${prefix}-${p.name}`}
            onClick={() => handleSelect(prefix, p)}
            showPreview={showPreview}
            speed={animSpeed}
            ring={ring}
          />
        ))}
      </div>
    </ControlGroup>
  );

  return (
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
        <PreviewToggle enabled={showPreview} onToggle={() => setShowPreview(!showPreview)} />
      </div>

      <ControlGrid minCellWidth={200}>
        {renderGroup('Nova — Signature', 'nova-sig', NOVA_SIGNATURE)}
        {renderGroup('Amber — Presets', 'amber-preset', AMBER_PRESETS)}
        {renderGroup('Amber — Motion', 'amber-motion', AMBER_MOTION)}
        {renderGroup('Colour Around the Ring', 'nova-color', COLOR_AROUND)}
        {renderGroup('Brightness Around the Ring', 'nova-bright', BRIGHTNESS_AROUND)}
        {renderGroup('Ring Colours', 'nova-ring', RING_COLORS)}

        <ControlGroup label="Laser Map">
          <NovaSlots numCannons={ring} gridColumns={gridColumns} send={send} />
        </ControlGroup>
      </ControlGrid>
    </div>
  );
}
