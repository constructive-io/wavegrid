import type { BrainConnection, BrainExtensionRegistration, BrainMessage } from '@wavegrid/extensions';

import { resolveStations, type Station, type StationConfig } from './config';
import {
  compositeStationPaint,
  dispatchStationTool,
  isStationMode,
  StationPaint
} from './paint';
import { createStationProjectPolicy, type StationStore } from './project';

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

export function stationExtension<LayoutSpec>(
  config: StationConfig | undefined,
  layout: StationLayout,
  resolveLayout: (spec: LayoutSpec) => StationLayout
): BrainExtensionRegistration<StationStore<LayoutSpec>> {
  const scopeSlug = ({ principal, url }: BrainConnection) =>
    principal ? url.searchParams.get('station') ?? principal.station : undefined;
  return {
    enabled: config?.enabled === true,
    requiresScope: connection => scopeSlug(connection) !== undefined,
    extension: {
      id: 'stations',
      setup(ctx) {
        const stations = resolveStations(config, layout);
        if (!stations.length) return {};
        const policy = createStationProjectPolicy(config, layout, resolveLayout);
        const paint = new StationPaint();
        let calibrationActive = false;
        const snapshot = () => paint.snapshot(layout.fixtures.length);
        const overlay = (): BrainMessage => ({ type: 'command', action: 'stationOverlay', cells: snapshot() });
        const publish = () => ctx.publish('receiver', overlay());
        const isCurrent = (scope: Station) => {
          const target = ctx.getProject();
          const current = target && policy.currentStations(target).find(station => station.slug === scope.slug);
          return !!current && JSON.stringify(current.fixtures) === JSON.stringify(scope.fixtures);
        };
        const validScope = (connection: BrainConnection, scope: Station) => {
          const principal = connection.principal;
          const target = ctx.getProject();
          if (!principal?.sid || principal.station !== scope.slug || !target) return false;
          return policy.sessionValid(
            target, { ...principal, station: scope.slug }, target.store.getSession(target.project, principal.sid), scope
          );
        };
        const validOperator = ({ principal }: BrainConnection) => {
          if (!principal || principal.station !== undefined) return true;
          const target = ctx.getProject();
          return !target || !target.store.listAccessKeys(target.project)
            .some(key => key.name === principal.sub && key.station !== undefined);
        };
        return {
          authorize(connection) {
            const slug = scopeSlug(connection);
            if (slug === undefined) return validOperator(connection) ? undefined : false;
            const scope = stations.find(station => station.slug === slug);
            if (!scope || !validScope(connection, scope)) return false;
            return {
              onMessage(message) { if (dispatchStationTool(message, scope, paint)) publish(); },
              onConnect: () => [{ type: 'station_layout', layout: projectStationLayout(layout, scope) }],
              projectState: ({ grid }) => ({
                type: 'state',
                grid: scope.fixtures.map(idx => grid[idx] ?? { h: 0, s: 0, b: 0 }),
                stationOpen: paint.acceptsInput
              }),
              revalidate: () => validScope(connection, scope)
            };
          },
          onOperatorMessage(message) {
            if (message.type === 'station_mode' && isStationMode(message.mode)) {
              if (calibrationActive) return true;
              paint.setMode(message.mode);
              publish();
              return true;
            }
            if (message.type === 'calibration_mode') calibrationActive = Boolean(message.enabled);
            const identify = message.type === 'physical_preview' && typeof message.physicalIndex === 'number';
            if (identify) calibrationActive = true;
            if (message.type === 'clear' || message.type === 'stopPattern' ||
                (message.type === 'animation' && message.name === 'stop') || identify ||
                (message.type === 'calibration_mode' && calibrationActive)) {
              paint.stop();
              publish();
            }
            return false;
          },
          projectState: state => ({ ...state, stationMode: paint.currentMode, stationOpen: paint.acceptsInput }),
          onConnect: ({ principal }) => principal ? [] : [overlay()],
          compositeOutput: frame => compositeStationPaint(frame, snapshot()),
          beforeRevalidate() {
            if (paint.acceptsInput && stations.some(scope => !isCurrent(scope))) {
              paint.stop();
              publish();
            }
          },
          revalidate: validOperator
        };
      }
    }
  };
}
