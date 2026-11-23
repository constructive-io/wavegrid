export interface Station {
  slug: string;
  name: string;
  fixtures: number[];
}

export interface StationConfig {
  enabled: boolean;
  layout: string;
  stations: Station[];
}

export interface StationGrant {
  station?: string;
}

interface LayoutIdentity {
  id: string;
  topology: string;
  fixtures: readonly {
    index: number;
    u: number;
    v: number;
    kind: string;
    label: string;
  }[];
}

export const stationSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function stationLayoutKey(layout: LayoutIdentity): string {
  return JSON.stringify([
    layout.id,
    layout.topology,
    layout.fixtures.map(({ index, u, v, kind, label }) => [index, u, v, kind, label])
  ]);
}

export function validateStations(stations: unknown, count: number): asserts stations is Station[] {
  if (!Array.isArray(stations)) throw new Error('Stations must be an array.');
  const slugs = new Set<string>();
  const fixtures = new Set<number>();
  for (const station of stations) {
    if (!station || typeof station.slug !== 'string' || !stationSlug.test(station.slug) || slugs.has(station.slug)) {
      throw new Error('Station slugs must be unique lowercase names with optional dashes.');
    }
    if (typeof station.name !== 'string' || !station.name.trim() || !Array.isArray(station.fixtures) || !station.fixtures.length) {
      throw new Error(`Station "${station.slug}" needs a name and at least one fixture.`);
    }
    slugs.add(station.slug);
    for (const idx of station.fixtures) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= count || fixtures.has(idx)) {
        throw new Error(`Station "${station.slug}": fixture ${idx} must be in range and assigned only once.`);
      }
      fixtures.add(idx);
    }
  }
}

export function resolveStations(config: StationConfig | undefined, layout: LayoutIdentity): Station[] {
  if (config?.enabled !== true || config.layout !== stationLayoutKey(layout)) return [];
  try {
    validateStations(config.stations, layout.fixtures.length);
    return config.stations;
  } catch {
    return [];
  }
}
