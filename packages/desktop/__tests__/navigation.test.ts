import {
  isRoute,
  NAV_GROUPS,
  ROUTE_GROUP,
  ROUTE_LABEL,
  ROUTES,
  UNLISTED_ROUTES
} from '../src/renderer/lib/navigation';

describe('sidebar navigation', () => {
  it('places every route in a group or names it explicitly unlisted', () => {
    const grouped = NAV_GROUPS.flatMap((g) => g.routes);
    const orphans = ROUTES.filter((r) => !grouped.includes(r) && !UNLISTED_ROUTES.includes(r));
    expect(orphans).toEqual([]);
  });

  it('never lists a route twice', () => {
    const grouped = NAV_GROUPS.flatMap((g) => g.routes);
    expect(grouped.length).toBe(new Set(grouped).size);
  });

  it('keeps running a show to the show, its looks, and its health, ahead of everything else', () => {
    expect(NAV_GROUPS[0]).toEqual({ id: 'run', label: 'Run', routes: ['show', 'nova', 'status'] });
  });

  it('hides the admin vocabulary under Advanced', () => {
    const advanced = NAV_GROUPS.find((g) => g.id === 'advanced')?.routes ?? [];
    expect(advanced).toContain('access');
    expect(advanced).toContain('settings');
    expect(advanced).toContain('devices');
  });

  it('labels every route', () => {
    expect(ROUTES.filter((r) => !ROUTE_LABEL[r])).toEqual([]);
  });

  it('breadcrumbs a grouped route, but not one reached from the switcher', () => {
    expect(ROUTE_GROUP.lights).toBe('Set up');
    expect(ROUTE_GROUP.projects).toBeUndefined();
  });

  it('only accepts known hash routes', () => {
    expect(isRoute('lights')).toBe(true);
    expect(isRoute('nope')).toBe(false);
  });
});
