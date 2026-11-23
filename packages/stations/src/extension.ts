import { resolveStations, type Station } from './config';
import {
  compositeStationPaint,
  dispatchStationTool,
  isStationMode,
  type StationCell,
  type StationColor,
  StationPaint
} from './paint';

export interface BrainExtensionHooks {
  onScopedMessage(handler: (message: Record<string, unknown>, scope: Station) => boolean): void;
  onOperatorMessage(handler: (message: Record<string, unknown>) => boolean): void;
  projectState(handler: (frame: StationColor[], scope: Station) => StationColor[]): void;
  compositeOutput(handler: (frame: StationColor[]) => StationColor[]): void;
  publishOutput(cells: StationCell[]): void;
}

export interface StationFixture { index: number; u: number; v: number; label: string; kind: string }
export interface StationProjection { id: string; name: string; fixtures: StationFixture[] }
interface StationLayout {
  id: string;
  topology: string;
  fixtures: readonly StationFixture[];
}

export function projectStationLayout(
  layout: StationLayout,
  station: Station
): StationProjection {
  const entries = station.fixtures.map(idx => layout.fixtures[idx]);
  const us = entries.map(f => f.u);
  const vs = entries.map(f => f.v);
  const x = Math.min(...us);
  const y = Math.min(...vs);
  const size = Math.max(Math.max(...us) - x, Math.max(...vs) - y) || 1;
  const centerU = (Math.max(...us) + x) / 2;
  const centerV = (Math.max(...vs) + y) / 2;
  return {
    id: station.slug,
    name: station.name,
    fixtures: entries.map(({ index, label, kind, u, v }) => ({
      index, label, kind, u: (u - centerU) / size + 0.5, v: (v - centerV) / size + 0.5
    }))
  };
}

export function registerStations(
  config: Parameters<typeof resolveStations>[0],
  layout: StationLayout,
  hooks: BrainExtensionHooks
) {
  const stations = resolveStations(config, layout);
  const paint = new StationPaint();
  const snapshot = () => paint.snapshot(layout.fixtures.length);
  const publish = () => hooks.publishOutput(snapshot());
  if (stations.length) {
    hooks.onScopedMessage((message, scope) => {
      if (!dispatchStationTool(message, scope, paint)) return false;
      publish();
      return true;
    });
    hooks.onOperatorMessage(message => {
      if (message.type === 'station_mode' && isStationMode(message.mode)) {
        paint.setMode(message.mode);
        publish();
        return true;
      }
      if (message.type === 'clear' || message.type === 'stopPattern' ||
          (message.type === 'animation' && message.name === 'stop') ||
          (message.type === 'calibration_mode' && message.enabled === true)) {
        paint.stop();
        publish();
      }
      return false;
    });
    hooks.projectState((frame, scope) => scope.fixtures.map(idx => frame[idx] ?? { h: 0, s: 0, b: 0 }));
    hooks.compositeOutput(frame => compositeStationPaint(frame, snapshot()));
  }
  return {
    stations,
    snapshot,
    mode: () => paint.currentMode,
    acceptsInput: () => paint.acceptsInput,
    suspend: () => { paint.stop(); publish(); }
  };
}
