import { useCallback, useEffect, useRef } from 'react';

import { ControlGrid, ControlGroup } from './control-grid';

interface ColorWheelProps {
  hue: number;
  saturation: number;
  brightness: number;
  brushSize: number;
  softEdge: boolean;
  trailFade: boolean;
  onHueChange: (h: number) => void;
  onSatChange: (s: number) => void;
  onBrightChange: (b: number) => void;
  onBrushSizeChange: (s: number) => void;
  onSoftEdgeChange: (v: boolean) => void;
  onTrailFadeChange: (v: boolean) => void;
  onClear?: () => void;
  compact?: boolean;
}

/** Where the brush lands when a colour is picked out of black. */
const DEFAULT_BRIGHTNESS = 100;

function hslRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)];
}

export function ColorWheel({
  hue,
  saturation,
  brightness,
  brushSize,
  softEdge,
  trailFade,
  onHueChange,
  onSatChange,
  onBrightChange,
  onBrushSizeChange,
  onSoftEdgeChange,
  onTrailFadeChange,
  onClear,
  compact = false
}: ColorWheelProps) {
  const wheelRef = useRef<HTMLCanvasElement>(null);
  const brightBarRef = useRef<HTMLDivElement>(null);
  const draggingWheel = useRef(false);
  const draggingBright = useRef(false);
  const wheelSize = 200;
  const displaySize = compact ? 140 : 200;
  const barWidth = compact ? 32 : 36;
  const barHeight = displaySize;

  useEffect(() => {
    const canvas = wheelRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = wheelSize;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 2;
    const imgData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const sat = (dist / radius) * 100;
        const [r, g, b] = hslRgb(angle, sat, 50);
        const idx = (y * size + x) * 4;
        imgData.data[idx] = r * 255;
        imgData.data[idx + 1] = g * 255;
        imgData.data[idx + 2] = b * 255;
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, []);

  const pickWheel = useCallback((clientX: number, clientY: number) => {
    const canvas = wheelRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = wheelSize / rect.width;
    const px = (clientX - rect.left) * scale;
    const py = (clientY - rect.top) * scale;
    const cx = wheelSize / 2;
    const cy = wheelSize / 2;
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = wheelSize / 2 - 2;
    if (dist > radius) return;
    const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const s = (dist / radius) * 100;
    onHueChange(Math.round(h));
    onSatChange(Math.round(s));
  }, [onHueChange, onSatChange]);

  const pickBright = useCallback((clientY: number) => {
    const bar = brightBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, 100 - ((clientY - rect.top) / rect.height) * 100));
    onBrightChange(Math.round(pct));
  }, [onBrightChange]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (draggingWheel.current) pickWheel(e.clientX, e.clientY);
      if (draggingBright.current) pickBright(e.clientY);
    };
    const onUp = () => {
      draggingWheel.current = false;
      draggingBright.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [pickWheel, pickBright]);

  // Black is the one swatch that is a brightness, not a hue: painting with it
  // sends brightness 0, which turns lasers off. Picking a colour again brings
  // back the brightness the operator was painting at.
  const isBlack = brightness === 0;
  const litBrightness = useRef(brightness > 0 ? brightness : DEFAULT_BRIGHTNESS);
  if (brightness > 0) litBrightness.current = brightness;

  const pickColor = useCallback((h: number, s: number) => {
    onHueChange(h);
    onSatChange(s);
    if (brightness === 0) onBrightChange(litBrightness.current);
  }, [brightness, onBrightChange, onHueChange, onSatChange]);

  const pickBlack = useCallback(() => {
    onBrightChange(0);
  }, [onBrightChange]);

  const radius = wheelSize / 2 - 2;
  const cursorAngle = (hue * Math.PI) / 180;
  const cursorDist = (saturation / 100) * radius;
  const cursorX = wheelSize / 2 + Math.cos(cursorAngle) * cursorDist;
  const cursorY = wheelSize / 2 + Math.sin(cursorAngle) * cursorDist;
  const displayScale = displaySize / wheelSize;
  const cursorDisplayX = cursorX * displayScale;
  const cursorDisplayY = cursorY * displayScale;

  const [pr, pg, pb] = hslRgb(hue, saturation, Math.max(10, brightness * 0.5));
  const previewColor = `rgb(${Math.round(pr * 255)},${Math.round(pg * 255)},${Math.round(pb * 255)})`;
  const previewGlow = `rgba(${Math.round(pr * 255)},${Math.round(pg * 255)},${Math.round(pb * 255)},0.4)`;

  const wheelBlock = (
    <div className="relative shrink-0" style={{ width: displaySize, height: displaySize }}>
      <canvas
        ref={wheelRef}
        width={wheelSize}
        height={wheelSize}
        className="rounded-full cursor-crosshair"
        style={{ width: displaySize, height: displaySize, touchAction: 'none' }}
        onPointerDown={(e) => {
          draggingWheel.current = true;
          pickWheel(e.clientX, e.clientY);
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: '2.5px solid #fff',
          boxShadow: '0 0 8px rgba(0,0,0,0.6)',
          transform: 'translate(-50%, -50%)',
          left: `${cursorDisplayX}px`,
          top: `${cursorDisplayY}px`
        }}
      />
    </div>
  );

  const brightBlock = (
    <div
      ref={brightBarRef}
      className="relative shrink-0 rounded-lg cursor-pointer"
      style={{
        width: barWidth,
        height: barHeight,
        background: `linear-gradient(to bottom, hsl(${hue},${saturation}%,50%), #000)`,
        touchAction: 'none'
      }}
      onPointerDown={(e) => {
        draggingBright.current = true;
        pickBright(e.clientY);
      }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          left: -3,
          right: -3,
          height: 5,
          borderRadius: 3,
          background: '#fff',
          boxShadow: '0 0 8px rgba(0,0,0,0.6)',
          bottom: `${brightness}%`,
          transform: 'translateY(50%)'
        }}
      />
    </div>
  );

  const previewBlock = (
    <div
      className="rounded-xl shrink-0"
      style={{
        width: compact ? 48 : 56,
        height: compact ? 48 : 56,
        background: isBlack ? '#000' : previewColor,
        boxShadow: isBlack ? 'none' : `0 0 24px ${previewGlow}`,
        border: isBlack ? '1px solid rgba(255,255,255,0.55)' : '1px solid rgba(255,255,255,0.1)'
      }}
    />
  );

  return (
    <ControlGrid minCellWidth={240}>
      {/* Cell 1: color picker */}
      <div className="flex items-start gap-4">
        {wheelBlock}
        {brightBlock}
        {previewBlock}
      </div>

      {/* Cell 2: quick colors + brush controls */}
      <ControlGroup label="Brush">
        {/* ROYGBIV quick-pick swatches, plus black to paint lasers off */}
        <div className="flex items-center gap-2 pb-1">
          {[
            { h: 0, s: 100, label: 'Red' },
            { h: 30, s: 100, label: 'Orange' },
            { h: 55, s: 100, label: 'Yellow' },
            { h: 120, s: 100, label: 'Green' },
            { h: 180, s: 100, label: 'Cyan' },
            { h: 225, s: 100, label: 'Blue' },
            { h: 280, s: 100, label: 'Purple' },
            { h: 0, s: 0, label: 'White' }
          ].map((c) => {
            const [r, g, b] = hslRgb(c.h, c.s, 50);
            const bg = c.s === 0 ? '#fff' : `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
            const isActive = !isBlack && Math.abs(hue - c.h) < 5 && Math.abs(saturation - c.s) < 5;
            return (
              <button
                key={c.label}
                onClick={() => pickColor(c.h, c.s)}
                title={c.label}
                className="shrink-0 rounded-full transition-transform"
                style={{
                  width: 26,
                  height: 26,
                  background: bg,
                  border: isActive ? '2.5px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                  boxShadow: isActive ? `0 0 8px ${bg}` : 'none',
                  transform: isActive ? 'scale(1.15)' : 'scale(1)'
                }}
              />
            );
          })}

          {/* Black is no brightness at all, so it paints lasers off. The outline
              is what makes it visible against the panel. */}
          <button
            onClick={pickBlack}
            title="Black — paints lasers off"
            className="shrink-0 rounded-full transition-transform"
            style={{
              width: 26,
              height: 26,
              background: '#000',
              border: isBlack ? '2.5px solid #fff' : '2px solid rgba(255,255,255,0.55)',
              boxShadow: isBlack ? '0 0 8px rgba(255,255,255,0.5)' : 'none',
              transform: isBlack ? 'scale(1.15)' : 'scale(1)'
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium shrink-0" style={{ color: '#888898', minWidth: 36 }}>Size</span>
          <input
            type="range"
            className="flex-1"
            min={1}
            max={5}
            value={brushSize}
            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
          />
          <span className="text-sm font-mono shrink-0" style={{ color: '#888898', minWidth: 20, textAlign: 'right' }}>{brushSize}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onSoftEdgeChange(!softEdge)}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
            style={{
              background: softEdge ? 'rgba(74,124,255,0.15)' : '#12121a',
              color: softEdge ? '#4a7cff' : '#888898',
              border: `1px solid ${softEdge ? '#4a7cff' : '#1a1a25'}`
            }}
          >
            Soft Edge
          </button>

          <button
            onClick={() => onTrailFadeChange(!trailFade)}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
            style={{
              background: trailFade ? 'rgba(74,124,255,0.15)' : '#12121a',
              color: trailFade ? '#4a7cff' : '#888898',
              border: `1px solid ${trailFade ? '#4a7cff' : '#1a1a25'}`
            }}
          >
            Fade Trail
          </button>
        </div>

        <div className="flex items-center gap-3">
          {onClear && (
            <button
              onClick={onClear}
              className="w-full py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: '#12121a',
                color: '#d44',
                border: '1px solid #1a1a25'
              }}
            >
              Clear
            </button>
          )}
        </div>
      </ControlGroup>
    </ControlGrid>
  );
}
