import { DEFAULT_CONFIG, resolveLayout } from '@wavegrid/layout';
import { stationLayoutKey, validateStations } from '@wavegrid/stations';

import { type Flags, getStore, resolveProjectName } from '../project';

const USAGE = 'Usage: wavegrid stations list|disable|remove <slug>|add|set <slug> <zero-based-index,...> ["name"]';

export function runStations(args: string[], flags: Flags): void {
  if (flags.help || flags.h) {
    console.log(USAGE);
    return;
  }
  const store = getStore();
  const project = resolveProjectName(store, flags);
  const config = store.getProjectConfig(project) ?? {};
  const layout = resolveLayout(config.layout ?? DEFAULT_CONFIG.layout);
  const layoutKey = stationLayoutKey(layout);
  const existing = config.stations?.stations ?? [];
  const [verb = 'list', slug, indices, name] = args;
  if (verb === 'list') {
    console.log(`Stations: ${config.stations?.enabled ? 'enabled' : 'disabled'}${config.stations && config.stations.layout !== layoutKey ? ' (layout mismatch)' : ''}`);
    for (const station of existing) console.log(`${station.slug}\t${station.name}\t${station.fixtures.join(',')}`);
    return;
  }
  if (verb === 'disable') {
    if (config.stations) store.saveProjectConfig(project, { ...config, stations: { ...config.stations, enabled: false } });
    return;
  }
  if (!slug || !['add', 'set', 'remove'].includes(verb)) {
    throw new Error(USAGE);
  }
  const old = existing.find(station => station.slug === slug);
  if (verb === 'add' && old) throw new Error(`Station "${slug}" already exists.`);
  if (verb !== 'add' && !old) throw new Error(`Unknown station "${slug}".`);
  const stations = existing.filter(station => station.slug !== slug);
  if (verb !== 'remove') {
    if (!indices || !/^\d+(,\d+)*$/.test(indices)) throw new Error('Provide comma-separated zero-based fixture indices.');
    stations.push({ slug, name: name ?? old?.name ?? slug, fixtures: indices.split(',').map(Number) });
  }
  if (stations.length && config.stations && config.stations.layout !== layoutKey &&
      (verb !== 'set' || existing.length !== 1) && verb !== 'remove') {
    throw new Error('Layout changed. Remove the obsolete stations before adding stations for the new layout.');
  }
  if (verb !== 'remove') validateStations(stations, layout.count);
  store.saveProjectConfig(project, {
    ...config,
    stations: {
      enabled: verb !== 'remove' || (config.stations?.enabled === true && stations.length > 0),
      layout: verb === 'remove' ? config.stations?.layout ?? layoutKey : layoutKey,
      stations
    }
  });
}
