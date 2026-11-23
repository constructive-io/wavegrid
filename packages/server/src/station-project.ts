import { type ResolvedConfig,resolveLayout } from '@wavegrid/layout';
import type { ProjectConfig } from '@wavegrid/settings';
import { resolveStations, type Station,stationLayoutKey } from '@wavegrid/stations';

export function projectStations(resolved: ResolvedConfig, config: ProjectConfig | null): Station[] {
  if (!resolved.config.stations?.enabled) return [];
  try {
    if (config?.layout && stationLayoutKey(resolveLayout(config.layout)) !== stationLayoutKey(resolved.layout)) return [];
    return resolveStations(config ? config.stations : resolved.config.stations, resolved.layout);
  } catch {
    return [];
  }
}
