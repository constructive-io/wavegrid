import type { BrainPrincipal, BrainProject } from '@wavegrid/extensions';

import { resolveStations, type Station, type StationConfig, type StationGrant, stationLayoutKey } from './config';

type Layout = Parameters<typeof resolveStations>[1];
type ScopedIdentity = BrainPrincipal & StationGrant;
type AccessKey = StationGrant & { name: string; enabled: boolean };
type Session = StationGrant & { username: string };

export interface StationStore<LayoutSpec> {
  getProjectConfig(project: string): { layout?: LayoutSpec; stations?: StationConfig } | null;
  listAccessKeys(project: string): AccessKey[];
  getSession(project: string, sid: string): Session | null;
}

export function createStationProjectPolicy<LayoutSpec>(
  config: StationConfig | undefined,
  layout: Layout,
  resolveLayout: (spec: LayoutSpec) => Layout
) {
  const layoutKey = stationLayoutKey(layout);
  function currentStations({ store, project }: BrainProject<StationStore<LayoutSpec>>) {
    if (!config?.enabled) return [];
    const saved = store.getProjectConfig(project);
    try {
      if (saved?.layout && stationLayoutKey(resolveLayout(saved.layout)) !== layoutKey) return [];
      return resolveStations(saved ? saved.stations : config, layout);
    } catch {
      return [];
    }
  }

  function sessionValid(target: BrainProject<StationStore<LayoutSpec>>, principal: ScopedIdentity, session: Session | null, scope?: Station) {
    const key = target.store.listAccessKeys(target.project).find(item => item.name === principal.sub);
    if (key?.station === undefined && principal.station === undefined && session?.station === undefined) return true;
    return key?.enabled === true && session?.username === principal.sub &&
      key.station === principal.station && key.station === session.station &&
      currentStations(target).some(station => station.slug === key.station &&
        (!scope || JSON.stringify(station.fixtures) === JSON.stringify(scope.fixtures)));
  }

  return { currentStations, sessionValid };
}

export function stationLoginError(requested: string | undefined, grant: StationGrant, available: (slug: string) => boolean) {
  if (requested !== undefined && grant.station !== requested) return 'This passcode does not grant access to that station';
  if (grant.station !== undefined && !available(grant.station)) return 'Station unavailable';
  return null;
}
