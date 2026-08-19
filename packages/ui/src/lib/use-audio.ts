import { useCallback, useEffect, useRef, useState } from 'react';

import type { CannonColor } from './use-socket';

export type AudioMode =
  | 'spectrum'
  | 'energy'
  | 'drops'
  | 'plasma'
  | 'galaxy'
  | 'fireworks'
  | 'rain'
  | 'matrix'
  | 'confetti';
export type BlendMode = 'replace' | 'multiply' | 'additive' | 'brighten';
export type AudioPalette = 'civic' | 'ocean' | 'sunset' | 'fire' | 'forest' | 'pride' | 'night';

interface PaletteStop {
  h: number;
  s: number;
}

interface Drop {
  x: number;
  y: number;
  tick: number;
  hue: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hue: number;
}

interface RainStreak {
  x: number;
  y: number;
  speed: number;
  len: number;
  hue: number;
}

interface GalaxyStar {
  x: number;
  y: number;
  depth: number;
  hue: number;
  twinkle: number;
}

interface AudioFeatureState {
  energyAvg: number;
  lowAvg: number;
  midAvg: number;
  highAvg: number;
  prevSpectrum: Uint8Array;
  beatPulse: number;
  beatCount: number;
  lastBeatAt: number;
  beatInterval: number;
  lastFrameAt: number;
}

export interface AudioEngineState {
  playing: boolean;
  micActive: boolean;
  fileName: string | null;
  duration: number;
  currentTime: number;
  bpm: number | null;
}

export interface AudioEngine {
  state: AudioEngineState;
  mode: AudioMode;
  blend: BlendMode;
  palette: AudioPalette;
  sensitivity: number;
  sineSpread: boolean;
  loop: boolean;
  setMode: (m: AudioMode) => void;
  setBlend: (b: BlendMode) => void;
  setPalette: (p: AudioPalette) => void;
  setSensitivity: (s: number) => void;
  setSineSpread: (v: boolean) => void;
  setLoop: (v: boolean) => void;
  loadFile: (file: File) => Promise<void>;
  play: () => void;
  stop: () => void;
  seek: (time: number) => void;
  startMic: () => void;
  stopMic: (resumeAmbient?: boolean) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function smooth(value: number): number {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

function paletteHue(t: number, start: number, end: number): number {
  const mix = clamp(t);
  return (start + angleDelta(start, end) * mix + 360) % 360;
}

export const AUDIO_PALETTES: Record<AudioPalette, { label: string; stops: PaletteStop[] }> = {
  civic: { label: 'Civic', stops: [{ h: 210, s: 85 }, { h: 235, s: 90 }, { h: 280, s: 80 }] },
  ocean: { label: 'Ocean', stops: [{ h: 175, s: 75 }, { h: 200, s: 80 }, { h: 230, s: 70 }] },
  sunset: { label: 'Sunset', stops: [{ h: 8, s: 90 }, { h: 28, s: 95 }, { h: 48, s: 88 }] },
  fire: { label: 'Fire', stops: [{ h: 4, s: 96 }, { h: 22, s: 96 }, { h: 48, s: 90 }] },
  forest: { label: 'Forest', stops: [{ h: 105, s: 70 }, { h: 135, s: 78 }, { h: 165, s: 65 }] },
  pride: { label: 'Pride', stops: [{ h: 0, s: 90 }, { h: 55, s: 90 }, { h: 125, s: 85 }, { h: 220, s: 85 }, { h: 285, s: 80 }] },
  night: { label: 'Night', stops: [{ h: 225, s: 55 }, { h: 250, s: 65 }, { h: 205, s: 24 }] }
};

function isAmbientMode(mode: AudioMode): boolean {
  return mode === 'galaxy' || mode === 'confetti' || mode === 'rain' || mode === 'matrix';
}

function paletteAt(palette: AudioPalette, position: number): PaletteStop {
  const stops = AUDIO_PALETTES[palette].stops;
  if (stops.length === 1) return stops[0];
  const scaled = clamp(position) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const from = stops[index];
  const to = stops[index + 1];
  return {
    h: paletteHue(mix, from.h, to.h),
    s: from.s + (to.s - from.s) * mix
  };
}

function blendCell(
  from: { h: number; s: number; b: number },
  to: { h: number; s: number; b: number },
  alpha: number
): { h: number; s: number; b: number } {
  const dh = angleDelta(from.h, to.h);
  return {
    h: (from.h + dh * alpha + 360) % 360,
    s: from.s + (to.s - from.s) * alpha,
    b: from.b + (to.b - from.b) * alpha
  };
}

export function useAudio(
  numCannons: number,
  gridColumns: number,
  _grid: CannonColor[],
  send: (msg: Record<string, unknown>) => void,
  fade: number = 50
): AudioEngine {
  const [audioState, setAudioState] = useState<AudioEngineState>({
    playing: false,
    micActive: false,
    fileName: null,
    duration: 0,
    currentTime: 0,
    bpm: null
  });
  // Energy over replace: the reading an operator wants from audio is level, and
  // replace means what they hear is what the rig shows rather than a tint on
  // whatever was already running.
  const [mode, setMode] = useState<AudioMode>('energy');
  const [blend, setBlend] = useState<BlendMode>('replace');
  const [palette, setPalette] = useState<AudioPalette>('civic');
  const [sensitivity, setSensitivity] = useState(70);
  const [sineSpread, setSineSpread] = useState(true);
  const [loop, setLoop] = useState(true);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropsRef = useRef<Drop[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const rainRef = useRef<RainStreak[]>([]);
  const matrixRef = useRef<RainStreak[]>([]);
  const galaxyRef = useRef<GalaxyStar[]>([]);
  const dropOriginRef = useRef({ position: 0, lastSpawnAt: 0 });
  const smoothedLayerRef = useRef<Array<{ h: number; s: number; b: number }> | null>(null);
  const featureRef = useRef<AudioFeatureState>({
    energyAvg: 0.08,
    lowAvg: 0.08,
    midAvg: 0.08,
    highAvg: 0.08,
    prevSpectrum: new Uint8Array(0),
    beatPulse: 0,
    beatCount: 0,
    lastBeatAt: 0,
    beatInterval: 0.5,
    lastFrameAt: 0
  });
  const sendRef = useRef(send);
  const modeRef = useRef(mode);
  const blendRef = useRef(blend);
  const paletteRef = useRef(palette);
  const sensitivityRef = useRef(sensitivity);
  const sineSpreadRef = useRef(sineSpread);
  const fadeRef = useRef(fade);
  const loopRef = useRef(loop);
  const numCannonsRef = useRef(numCannons);
  const gridColumnsRef = useRef(gridColumns);

  useEffect(() => { sendRef.current = send; }, [send]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { blendRef.current = blend; }, [blend]);
  useEffect(() => { paletteRef.current = palette; }, [palette]);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { sineSpreadRef.current = sineSpread; }, [sineSpread]);
  useEffect(() => { fadeRef.current = fade; }, [fade]);
  useEffect(() => { loopRef.current = loop; }, [loop]);
  useEffect(() => { numCannonsRef.current = numCannons; }, [numCannons]);
  useEffect(() => { gridColumnsRef.current = gridColumns; }, [gridColumns]);

  const resetVisualState = useCallback(() => {
    dropsRef.current = [];
    sparksRef.current = [];
    rainRef.current = [];
    matrixRef.current = [];
    galaxyRef.current = [];
    smoothedLayerRef.current = null;
    featureRef.current.beatPulse = 0;
    featureRef.current.lastFrameAt = 0;
    dropOriginRef.current.lastSpawnAt = 0;
  }, []);

  const setAudioMode = useCallback((nextMode: AudioMode) => {
    resetVisualState();
    setMode(nextMode);
  }, [resetVisualState]);

  const setAudioBlend = useCallback((nextBlend: BlendMode) => {
    smoothedLayerRef.current = null;
    setBlend(nextBlend);
  }, []);

  const setAudioPalette = useCallback((nextPalette: AudioPalette) => {
    smoothedLayerRef.current = null;
    setPalette(nextPalette);
  }, []);

  const processFrame = useCallback(() => {
    const analyser = analyserRef.current;
    const bufLen = analyser?.frequencyBinCount || 128;
    const dataArray = new Uint8Array(bufLen);
    analyser?.getByteFrequencyData(dataArray);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, w, h);
        const barWidth = w / bufLen * 2.5;
        let x = 0;
        for (let i = 0; i < bufLen; i++) {
          const v = dataArray[i] / 255;
          const barH = v * h;
          const hue = (i / bufLen) * 300;
          ctx.fillStyle = `hsl(${hue}, 80%, ${30 + v * 40}%)`;
          ctx.fillRect(x, h - barH, barWidth - 1, barH);
          x += barWidth;
          if (x > w) break;
        }
      }
    }

    const now = performance.now() / 1000;
    const featureState = featureRef.current;
    const dt = featureState.lastFrameAt ? Math.min(0.08, now - featureState.lastFrameAt) : 1 / 60;
    featureState.lastFrameAt = now;

    const sens = sensitivityRef.current / 100;
    const nc = numCannonsRef.current;
    const gc = gridColumnsRef.current;
    const rows = Math.ceil(nc / gc);
    const m = modeRef.current;
    const spread = sineSpreadRef.current;
    const activePalette = paletteRef.current;

    // Build the audio layer — raw audio-derived colors for each cannon
    const layer: Array<{ h: number; s: number; b: number }> = Array.from(
      { length: nc },
      () => ({ h: 0, s: 0, b: 0 })
    );

    const bandAverage = (from: number, to: number) => {
      const start = Math.max(0, Math.min(bufLen - 1, Math.floor(from * bufLen)));
      const end = Math.max(start + 1, Math.min(bufLen, Math.floor(to * bufLen)));
      let sum = 0;
      for (let i = start; i < end; i++) sum += dataArray[i];
      return sum / (end - start) / 255;
    };

    let totalEnergy = 0;
    for (let i = 0; i < bufLen; i++) totalEnergy += dataArray[i];
    totalEnergy = totalEnergy / bufLen / 255;
    const lowEnergy = bandAverage(0, 0.16);
    const midEnergy = bandAverage(0.16, 0.48);
    const highEnergy = bandAverage(0.48, 0.92);

    let flux = 0;
    if (featureState.prevSpectrum.length === bufLen) {
      for (let i = 0; i < bufLen; i++) {
        flux += Math.max(0, dataArray[i] - featureState.prevSpectrum[i]);
      }
      flux = flux / bufLen / 255;
    }
    featureState.prevSpectrum = new Uint8Array(dataArray);

    const avgAlpha = 0.035;
    featureState.energyAvg += (totalEnergy - featureState.energyAvg) * avgAlpha;
    featureState.lowAvg += (lowEnergy - featureState.lowAvg) * avgAlpha;
    featureState.midAvg += (midEnergy - featureState.midAvg) * avgAlpha;
    featureState.highAvg += (highEnergy - featureState.highAvg) * avgAlpha;

    const lowRatio = lowEnergy / Math.max(0.025, featureState.lowAvg);
    const fluxGate = 0.025 + (1 - sens) * 0.04;
    const beatGate = 1.25 + (1 - sens) * 0.5;
    const beatCooldown = Math.max(0.18, featureState.beatInterval * 0.45);
    const isBeat = (
      now - featureState.lastBeatAt > beatCooldown
      && lowEnergy > 0.045
      && lowRatio > beatGate
      && flux > fluxGate
    );

    if (isBeat) {
      if (featureState.lastBeatAt > 0) {
        featureState.beatInterval = clamp(now - featureState.lastBeatAt, 0.24, 0.9);
      }
      featureState.lastBeatAt = now;
      featureState.beatCount += 1;
      featureState.beatPulse = 1;
    } else {
      featureState.beatPulse = Math.max(0, featureState.beatPulse - dt * 2.8);
    }

    const beatPhase = featureState.lastBeatAt > 0
      ? clamp((now - featureState.lastBeatAt) / Math.max(0.24, featureState.beatInterval))
      : 1;
    const beatPulse = smooth(featureState.beatPulse);
    const audioLevel = smooth(clamp(totalEnergy * (0.8 + sens * 2.0)));
    const lowLevel = smooth(clamp(lowEnergy * (0.9 + sens * 2.2)));
    const midLevel = smooth(clamp(midEnergy * (0.85 + sens * 1.8)));
    const highLevel = smooth(clamp(highEnergy * (0.85 + sens * 2.5)));
    const beatTime = featureState.beatCount + beatPhase;
    const cx = (gc - 1) / 2;
    const cy = (rows - 1) / 2;

    const setCell = (idx: number, hue: number, saturation: number, brightness: number) => {
      if (idx < 0 || idx >= nc) return;
      const b = clamp(brightness / 100, 0, 1) * 100;
      if (b >= layer[idx].b) {
        layer[idx] = { h: (hue + 360) % 360, s: saturation, b };
      }
    };

    const setRC = (row: number, col: number, hue: number, saturation: number, brightness: number) => {
      const idx = row * gc + col;
      if (row < 0 || row >= rows || col < 0 || col >= gc || idx >= nc) return;
      setCell(idx, hue, saturation, brightness);
    };

    const colorFor = (t: number) => paletteAt(activePalette, t);
    const setCellFromPalette = (idx: number, position: number, brightness: number, saturationScale = 1) => {
      const color = colorFor(position);
      setCell(idx, color.h, color.s * saturationScale, brightness);
    };

    if (m === 'spectrum') {
      for (let col = 0; col < gc; col++) {
        const bandStart = Math.floor((col / gc) * bufLen);
        const bandEnd = Math.floor(((col + 1) / gc) * bufLen);
        let bandEnergy = 0;
        for (let i = bandStart; i < bandEnd; i++) bandEnergy += dataArray[i];
        bandEnergy = (bandEnergy / (bandEnd - bandStart)) / 255;
        const hue = colorFor(col / Math.max(1, gc - 1)).h;

        for (let row = 0; row < rows; row++) {
          const idx = row * gc + col;
          if (idx >= nc) continue;
          const rowFromBottom = rows - 1 - row;
          const rowThreshold = rowFromBottom / rows;
          const bright = bandEnergy * (0.7 + sens * 1.8) > rowThreshold ? 35 + bandEnergy * 65 : 3;

          if (spread && bright > 5) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dc === 0) continue;
              const nCol = col + dc;
              if (nCol < 0 || nCol >= gc) continue;
              const nIdx = row * gc + nCol;
              if (nIdx >= nc) continue;
              const falloff = Math.cos((Math.PI / 2) * Math.abs(dc));
              const nb = bright * falloff * 0.4;
              layer[nIdx] = { h: hue, s: 85, b: Math.max(layer[nIdx].b, nb) };
            }
          }
          layer[idx] = { h: hue, s: 85, b: bright };
        }
      }
    } else if (m === 'energy') {
      const color = colorFor(lowLevel * 0.85 + beatPulse * 0.15);
      const hue = color.h;
      const bright = 8 + audioLevel * 50 + beatPulse * 20;
      for (let i = 0; i < nc; i++) layer[i] = { h: hue, s: 80, b: bright };
    } else if (m === 'drops') {
      const perimeter = Math.max(1, (gc + rows - 2) * 2);
      const travel = (0.16 + lowLevel * 0.18 + beatPulse * 0.08) * dt;
      dropOriginRef.current.position = (dropOriginRef.current.position + travel) % perimeter;

      const perimeterPoint = (position: number) => {
        const p = ((position % perimeter) + perimeter) % perimeter;
        if (p < gc) return { x: p, y: 0 };
        if (p < gc + rows - 1) return { x: gc - 1, y: p - gc + 1 };
        if (p < gc * 2 + rows - 2) return { x: gc - 2 - (p - gc - rows + 1), y: rows - 1 };
        return { x: 0, y: rows - 2 - (p - (gc * 2 + rows - 2)) };
      };

      const origin = perimeterPoint(dropOriginRef.current.position);
      let activeBands = 0;
      for (let col = 0; col < gc; col++) {
        const bandStart = Math.floor((col / gc) * bufLen);
        const bandEnd = Math.floor(((col + 1) / gc) * bufLen);
        let bandEnergy = 0;
        for (let i = bandStart; i < bandEnd; i++) bandEnergy += dataArray[i];
        bandEnergy = (bandEnergy / (bandEnd - bandStart)) / 255;
        if (bandEnergy * sens > 0.5) activeBands++;
      }

      const alreadyActive = dropsRef.current.some((drop) => drop.tick < 3);
      if (activeBands > 0 && !alreadyActive) {
        dropOriginRef.current.lastSpawnAt = now;
        const colorPosition = dropOriginRef.current.position / perimeter;
        const spawnCount = Math.min(3, activeBands);
        for (let n = 0; n < spawnCount; n++) {
          dropsRef.current.push({
            x: origin.x,
            y: origin.y,
            tick: -n,
            hue: colorFor((colorPosition + n * 0.08) % 1).h
          });
        }
      }

      const contrib = new Float32Array(nc);
      const hues = new Float32Array(nc);
      const counts = new Float32Array(nc);
      const maxRadius = rows * 1.5;
      const speedMult = 0.4;
      const ringWidth = 2;
      const decayRate = 0.7;

      for (let d = dropsRef.current.length - 1; d >= 0; d--) {
        const drop = dropsRef.current[d];
        const radius = drop.tick * speedMult;
        if (radius > maxRadius + ringWidth) {
          dropsRef.current.splice(d, 1);
          continue;
        }
        for (let i = 0; i < nc; i++) {
          const r = Math.floor(i / gc);
          const c = i % gc;
          const dist = Math.sqrt((r - drop.y) * (r - drop.y) + (c - drop.x) * (c - drop.x));
          const delta = Math.abs(dist - radius);
          if (delta > ringWidth) continue;
          const ringFalloff = 1 - (delta / ringWidth);
          const ageFalloff = Math.pow(decayRate, drop.tick * 0.3);
          const intensity = ringFalloff * ageFalloff * 80 * sens;
          if (intensity < 1) continue;
          contrib[i] += intensity;
          hues[i] += drop.hue * intensity;
          counts[i] += intensity;
        }
        drop.tick++;
      }

      for (let i = 0; i < nc; i++) {
        if (counts[i] > 0) {
          layer[i] = { h: (hues[i] / counts[i] + 360) % 360, s: 90, b: Math.min(100, contrib[i]) };
        } else {
          layer[i] = { h: 220, s: 0, b: 3 };
        }
      }
    } else if (m === 'plasma') {
      const t = now * (0.42 + midLevel * 0.9) + featureState.beatCount * 0.16;
      for (let i = 0; i < nc; i++) {
        const row = Math.floor(i / gc);
        const col = i % gc;
        const dx = col - cx;
        const dy = row - cy;
        const dist = Math.hypot(dx, dy);
        const v = (
          Math.sin(col * 1.1 + t * 2.2)
          + Math.sin(row * 1.4 - t * 1.7)
          + Math.sin((col + row) * 0.9 + t * 1.2)
          + Math.sin(dist * 1.8 - t * 2.4)
        ) * 0.125 + 0.5;
        const crest = smooth((v - 0.38) / 0.62);
        setCellFromPalette(i, (v + beatPulse * 0.08 + beatTime * 0.02) % 1, crest * (18 + audioLevel * 38) + beatPulse * 10);
      }
    } else if (m === 'galaxy') {
      if (galaxyRef.current.length !== nc) {
        galaxyRef.current = Array.from({ length: nc }, () => ({
          x: Math.random() * gc,
          y: Math.random() * rows,
          depth: 0.2 + Math.random(),
          hue: Math.random(),
          twinkle: Math.random() * Math.PI * 2
        }));
      }
      const drift = (0.55 + audioLevel * 2.2 + beatPulse * 1.6) * dt;
      for (const star of galaxyRef.current) {
        star.x -= drift * star.depth;
        if (star.x < -0.5) {
          star.x += gc + 1;
          star.y = Math.random() * rows;
          star.depth = 0.2 + Math.random();
          star.hue = Math.random();
        }
        const twinkle = 0.45 + 0.55 * Math.sin(now * 3 * star.depth + star.twinkle);
        const color = colorFor(star.hue);
        setRC(Math.round(star.y), Math.round(star.x), color.h, color.s * (0.75 + star.depth * 0.2), (14 + star.depth * 48) * twinkle + beatPulse * 10);
      }
    } else if (m === 'fireworks') {
      if ((isBeat || Math.random() < highLevel * 0.018) && sparksRef.current.length < 80) {
        const bursts = isBeat ? 1 + Math.floor(lowLevel * 1.5) : 1;
        for (let burst = 0; burst < bursts; burst++) {
          const bx = 1 + Math.random() * Math.max(1, gc - 2);
          const by = 1 + Math.random() * Math.max(1, rows - 3);
          const hue = Math.random();
          const count = 7 + Math.floor(audioLevel * 10);
          for (let j = 0; j < count; j++) {
            const angle = (j / count) * Math.PI * 2 + Math.random() * 0.4;
            const speed = 2.0 + Math.random() * 3.2 + lowLevel * 2.0;
            sparksRef.current.push({
              x: bx,
              y: by,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 0.5,
              life: 0.75 + Math.random() * 0.55,
              hue: (hue + Math.random() * 0.22) % 1
            });
          }
        }
      }
      for (const spark of sparksRef.current) {
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 3.6 * dt;
        spark.life -= dt * 0.9;
        const color = colorFor(spark.hue);
        setRC(Math.round(spark.y), Math.round(spark.x), color.h, color.s, spark.life * 78);
        setRC(Math.round(spark.y - spark.vy * 0.08), Math.round(spark.x - spark.vx * 0.08), color.h, color.s, spark.life * 36);
      }
      sparksRef.current = sparksRef.current.filter(s => s.life > 0 && s.x > -1 && s.x < gc + 1 && s.y > -1 && s.y < rows + 1);
    } else if (m === 'rain' || m === 'matrix') {
      const streaks = m === 'rain' ? rainRef.current : matrixRef.current;
      const spawnChance = m === 'rain' ? 0.09 + highLevel * 0.16 + beatPulse * 0.08 : 0.07 + midLevel * 0.1;
      if (Math.random() < spawnChance) {
        streaks.push({
          x: Math.floor(Math.random() * gc),
          y: -1,
          speed: 3.5 + Math.random() * 4.5 + audioLevel * 5,
          len: m === 'rain' ? 2 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 4),
          hue: Math.random()
        });
      }
      for (const streak of streaks) {
        streak.y += streak.speed * dt;
        for (let j = 0; j < streak.len; j++) {
          const row = Math.round(streak.y - j);
          const falloff = 1 - j / streak.len;
          const color = m === 'matrix' ? colorFor(0.34 + falloff * 0.22) : colorFor(streak.hue);
          setRC(row, streak.x, color.h, m === 'matrix' ? Math.min(100, color.s * 1.1) : color.s, (20 + audioLevel * 42) * falloff);
        }
      }
      if (m === 'rain') rainRef.current = streaks.filter(s => s.y - s.len < rows + 1);
      else matrixRef.current = streaks.filter(s => s.y - s.len < rows + 1);
    } else if (m === 'confetti') {
      const spawnCount = Math.floor(1 + highLevel * 3 + beatPulse * 5);
      for (let n = 0; n < spawnCount && sparksRef.current.length < 75; n++) {
        if (Math.random() > 0.22 + highLevel * 0.25 + beatPulse * 0.35 && !isBeat) continue;
        sparksRef.current.push({
          x: Math.random() * gc,
          y: Math.random() * rows,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          life: 0.45 + Math.random() * 0.65,
          hue: Math.random()
        });
      }
      for (const dot of sparksRef.current) {
        dot.x += dot.vx * dt;
        dot.y += dot.vy * dt;
        dot.life -= dt * (0.7 + (1 - highLevel) * 0.7);
        const color = colorFor(dot.hue);
        setRC(Math.round(dot.y), Math.round(dot.x), color.h, color.s, dot.life * 72);
      }
      sparksRef.current = sparksRef.current.filter(s => s.life > 0);
    }

    if (blendRef.current === 'replace') {
      for (const cell of layer) {
        if (cell.b <= 0) continue;
        cell.b = Math.min(100, Math.max(cell.b * 1.45, cell.b + 12));
      }
    }

    const fadePct = fadeRef.current;
    const layerAlpha = Math.max(0.06, Math.min(0.8, Math.pow(10, -1.8 * (fadePct / 100)) * 3.2));
    const prevLayer = smoothedLayerRef.current;
    const outputLayer = prevLayer && prevLayer.length === layer.length
      ? layer.map((cell, index) => blendCell(prevLayer[index], cell, layerAlpha))
      : layer;
    smoothedLayerRef.current = outputLayer;

    // Send the full audio layer to the Simulator for server-side compositing
    sendRef.current({
      type: 'audio_layer',
      blend: blendRef.current,
      grid: outputLayer
    });

    if (audioContextRef.current) {
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current + offsetRef.current;
      const dur = audioBufferRef.current?.duration || 1;
      setAudioState((s) => ({
        ...s,
        currentTime: Math.min(elapsed, dur)
      }));
    }

    if (analyserRef.current || isAmbientMode(modeRef.current)) {
      animFrameRef.current = requestAnimationFrame(processFrame);
    } else {
      animFrameRef.current = 0;
    }
  }, []);

  const startAmbientLoop = useCallback(() => {
    if (analyserRef.current || animFrameRef.current || !isAmbientMode(modeRef.current)) return;
    resetVisualState();
    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [processFrame, resetVisualState]);

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
      } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    analyserRef.current = null;
    resetVisualState();
    offsetRef.current = 0;
    // Clear the audio overlay on the Simulator so base grid shows through
    sendRef.current({ type: 'audio_layer_clear' });
    setAudioState((s) => ({ ...s, playing: false, currentTime: 0 }));
  }, [resetVisualState]);

  const startPlaybackAt = useCallback((offset: number) => {
    if (!audioBufferRef.current || !audioContextRef.current) return;

    // Stop mic if active
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    setAudioState((s) => ({ ...s, micActive: false }));

    // Stop any existing source without clearing state
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
      } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    resetVisualState();

    const ctx = audioContextRef.current;
    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
    sourceRef.current = source;
    offsetRef.current = offset;
    startTimeRef.current = ctx.currentTime;

    source.onended = () => {
      if (loopRef.current && audioBufferRef.current) {
        // Restart from beginning
        startPlaybackAt(0);
      } else {
        resetVisualState();
        sendRef.current({ type: 'audio_layer_clear' });
        setAudioState((s) => ({ ...s, playing: false, currentTime: 0 }));
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = 0;
        }
        analyserRef.current = null;
      }
    };

    const dur = audioBufferRef.current.duration;
    const clampedOffset = Math.min(offset, dur - 0.01);
    source.start(0, clampedOffset, dur - clampedOffset);
    setAudioState((s) => ({ ...s, playing: true, currentTime: clampedOffset }));
    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [processFrame, resetVisualState]);

  const startPlayback = useCallback(() => {
    startPlaybackAt(0);
  }, [startPlaybackAt]);

  const seek = useCallback((time: number) => {
    if (!audioBufferRef.current) return;
    const wasPlaying = !!sourceRef.current;
    if (wasPlaying) {
      startPlaybackAt(time);
    } else {
      offsetRef.current = time;
      setAudioState((s) => ({ ...s, currentTime: time }));
    }
  }, [startPlaybackAt]);

  const detectBPM = useCallback((buffer: AudioBuffer): number | null => {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.05);
    const energies: number[] = [];
    for (let i = 0; i < data.length - windowSize; i += windowSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) energy += data[i + j] * data[i + j];
      energies.push(energy / windowSize);
    }
    const peaks: number[] = [];
    const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
    for (let i = 1; i < energies.length - 1; i++) {
      if (energies[i] > avgEnergy * 1.5 && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
        peaks.push(i);
      }
    }
    if (peaks.length < 4) return null;
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) intervals.push((peaks[i] - peaks[i - 1]) * 0.05);
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (median <= 0) return null;
    const bpm = Math.round(60 / median);
    if (bpm < 60) return bpm * 2;
    if (bpm > 200) return Math.round(bpm / 2);
    return bpm;
  }, []);

  const stopMic = useCallback((resumeAmbient = true) => {
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    analyserRef.current = null;
    resetVisualState();
    sendRef.current({ type: 'audio_layer_clear' });
    setAudioState((s) => ({ ...s, micActive: false }));
    if (resumeAmbient) startAmbientLoop();
  }, [resetVisualState, startAmbientLoop]);

  const startMic = useCallback(async () => {
    // Stop any file playback first
    stopPlayback();

    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    // Don't connect to destination — avoid feedback loop
    micSourceRef.current = source;
    analyserRef.current = analyser;

    resetVisualState();
    setAudioState((s) => ({ ...s, micActive: true }));
    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [stopPlayback, processFrame, resetVisualState]);

  const loadFile = useCallback(async (file: File) => {
    // Stop mic if active
    stopMic();
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    audioBufferRef.current = audioBuffer;
    const bpm = detectBPM(audioBuffer);
    setAudioState({ playing: false, micActive: false, fileName: file.name, duration: audioBuffer.duration, currentTime: 0, bpm });
  }, [detectBPM, stopMic]);

  useEffect(() => {
    if (isAmbientMode(mode)) {
      startAmbientLoop();
    } else if (!analyserRef.current && animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
      resetVisualState();
      sendRef.current({ type: 'audio_layer_clear' });
    }
  }, [mode, resetVisualState, startAmbientLoop]);

  useEffect(() => {
    return () => {
      stopPlayback();
      stopMic();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [stopPlayback, stopMic]);

  return {
    state: audioState,
    mode,
    blend,
    palette,
    sensitivity,
    sineSpread,
    loop,
    setMode: setAudioMode,
    setBlend: setAudioBlend,
    setPalette: setAudioPalette,
    setSensitivity,
    setSineSpread,
    setLoop,
    loadFile,
    play: startPlayback,
    stop: stopPlayback,
    seek,
    startMic,
    stopMic,
    canvasRef
  };
}
