/**
 * The sidebar's shape, grouped by *when* you reach for something rather than by
 * what it is: running a show is the show itself and its health; everything a
 * project needs is under "Set up", and the vocabulary that scares a
 * non-technical operator lives under "Advanced". Projects is not a destination
 * — the switcher in the sidebar header owns choosing one and links to the
 * manage screen.
 *
 * Two things deliberately absent: Nova, which belongs to the artist UI the show
 * serves rather than to the shell around it, and OSC debugging, which is a tab
 * of Output — you go there because of where you send, so that is where the tool
 * for proving it lives.
 */
export type Route =
  | 'show'
  | 'status'
  | 'projects'
  | 'config'
  | 'access'
  | 'lights'
  | 'output'
  | 'devices'
  | 'settings';

export const ROUTE_LABEL: Record<Route, string> = {
  show: 'Show',
  status: 'Status',
  projects: 'Projects',
  config: 'Layout',
  access: 'People & Keys',
  lights: 'Lights',
  output: 'Output',
  devices: 'Devices',
  settings: 'Settings'
};

export const ROUTES = Object.keys(ROUTE_LABEL) as Route[];

export interface NavGroup {
  id: string;
  label: string;
  routes: Route[];
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'run', label: 'Run', routes: ['show', 'status'] },
  { id: 'setup', label: 'Set up', routes: ['config', 'lights', 'output'] },
  { id: 'advanced', label: 'Advanced', routes: ['devices', 'access', 'settings'] }
];

/** Routes reachable other than from a sidebar group. */
export const UNLISTED_ROUTES: Route[] = ['projects'];

/** Which group a route sits in, for the breadcrumb. */
export const ROUTE_GROUP: Partial<Record<Route, string>> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.routes.map((r) => [r, g.label]))
);

export function isRoute(value: string): value is Route {
  return (ROUTES as string[]).includes(value);
}
