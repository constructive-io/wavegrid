# Wavegrid project files

A project file (`<name>.wavegrid`) is the shareable definition of one installation. Keep it in its own repository, a shared drive, or next to the venue's other files — a venue's setup no longer has to live as presets and examples in this repository.

## What it holds, and what it never holds

| In the file | Never in the file |
| --- | --- |
| Layout: a preset, a generated shape, or explicit `fixtures` | Secrets (`jwtSecret`, `receiverKey`) |
| Run settings: mode, server/UI ports, receiver tuning | UI users and passwords |
| OSC targets and the unified routing spec | Access keys |
| Named light maps and which one is active | Device addresses and last-seen times |
| Saved Looks | This machine's identity |
| Planned devices: names and shards | Runtime state |

Because nothing secret or machine-specific goes in, the file is safe to commit and to share.

## Commands

```sh
wavegrid projects open venue.wavegrid --activate   # load it into the store (alias: wavegrid open)
wavegrid start                                     # run it
wavegrid projects save                             # write edits back to the file it came from
wavegrid projects save other/venue.wavegrid        # or to a new path, which becomes the file it saves to
```

Opening the file a project already came from refreshes the project from it — after a `git pull`, say. The file wins for everything it holds; secrets, users and keys stay as this machine has them, and a project with no secrets gets fresh ones as `wavegrid init` would. Opening a file over a project that came from elsewhere needs `--overwrite`, or `--name` to open it as a new project.

The desktop app's **Import project** accepts `.wavegrid` files too.

`projects export` / `projects import` still exist for moving a whole project between laptops: that bundle can carry users and secrets, so it is not meant to be committed.

## Format

JSON, version 1:

```json
{
  "wavegrid": "project",
  "version": 1,
  "name": "warehouse",
  "description": "Back room, 5 cannons around the bar",
  "config": {
    "layout": {
      "kind": "fixtures",
      "name": "Warehouse bar",
      "fixtures": [
        { "x": 0, "y": 0, "label": "door" },
        { "x": 4, "y": 0 },
        { "x": 8, "y": 1 },
        { "x": 6, "y": 5, "kind": "projector", "label": "stage" },
        { "x": 1, "y": 4 }
      ]
    },
    "mode": "simple",
    "activeLightMap": "rewired"
  },
  "lightMaps": [
    { "name": "rewired", "numCannons": 5, "gridColumns": 5, "physicalLights": [0, 2, 1, 3, 4] }
  ],
  "looks": [
    { "id": "look-1", "name": "Slow blue", "params": { "hue": 240, "speed": 0.2 } }
  ],
  "devices": [
    { "id": "dev-abc123", "name": "bar-laptop", "shard": null }
  ]
}
```

- `config` is the same object as the store's `config.json` (see `WavegridConfig` in `@wavegrid/layout`). Paths to files on one machine (`osc.routingConfig`, `receiver.lightMap`) are left out on save with a warning; adopt routing with `wavegrid projects routing import <file>` so it travels as `osc.routing`.
- Opening validates the whole file, including that the layout resolves, before anything is written.
- Readers ignore top-level fields they do not know, and opening then saving keeps them, so a file written by a newer Wavegrid (for example with station definitions) survives a round trip through an older one.

## Plugins

`"plugins": [{ "path": "programs/my-show" }]` lists plugin folders relative to the
`.wavegrid` file. Paths use forward slashes and name a subfolder, not the project
folder itself. Absolute paths and parent (`..`) components are rejected. Duplicate
paths (including aliases such as `show` and `./show`), overlapping folders and
duplicate plugin ids are rejected. The source array is preserved on save.

```text
venue.wavegrid
programs/my-show/
  plugin.json
  pattern.js
  tab.json
  presets.json
```

`plugin.json` version 1:

```json
{
  "id": "my-show", "name": "My show", "version": "1.0.0", "apiVersion": 1,
  "wavegrid": "0.5.0", "pattern": "pattern.js",
  "tabs": ["tab.json"], "presets": "presets.json"
}
```

`id` follows the project-name rule. `wavegrid` is an optional numeric `x.y.z`
minimum against the running brain's protocol/runtime version (currently `0.5.0`),
not the independently versioned npm packages. `pattern`, `tabs` and `presets` are
optional file references relative to the plugin folder; every reference must
exist there. Presets contain arbitrary JSON.

A tab JSON file contains `id`, `label`, optional `showWhen` (default `"always"`),
optional `pattern` overriding the manifest's pattern, and `cards`:
`[{ "title": "Color", "controls": [] }]`. `showWhen` is `"always"`, `"never"`, or an object
whose `fixtureKind`, `topology`, `minFixtures` and `layoutId` conditions are ANDed.
An empty object always matches. Tab ids in `/api/config` are `<pluginId>/<tabId>`.

### Controls and presets

Controls are JSON data, rendered as native Wavegrid cards; plugins never supply
React or host-evaluated JavaScript. Each parameter name is a JavaScript-style
identifier (`[A-Za-z_$][A-Za-z0-9_$]*`) and must be unique within a tab.
`__proto__`, `constructor` and `prototype` are reserved parameter names. Labels are
optional except on buttons. A tab's defaults form its initial pattern params.

| `type` | Fields in addition to `type`, `param`, optional `label` |
| --- | --- |
| `slider` | finite `min`, `max`, `default` within the range; optional positive `step` (UI default: 1) |
| `toggle` | boolean `default` |
| `select` | nonempty `options`: strings or `{ label, value }` objects; `default` must match an option value (string, finite number or boolean) |
| `color` | `default: "#rrggbb"`; params carry the hex string |
| `button` | no `param` or `default`; required `label`, `action: "start"` or `"stop"` |

Unknown types or invalid controls fail project open. The UI also filters malformed
controls and coerces incoming params, clamping sliders and ignoring undeclared
params. A tab fetches its `pattern` file (or inherits the manifest's); changing a
control starts that pattern, or updates its live params if it is already running.
Start and Stop buttons explicitly control playback. Brain-rendered frames appear
in the main grid, as with Patterns. Saved plugin tab selections work after config
loads; unavailable/hidden tabs fall back to Paint.

If the manifest specifies `presets`, that JSON file should contain
`[{ "name": "Slow blue", "params": { "speed": 0.4, "hue": 210 } }]`.
The tab fetches it and renders a Presets card. A preset merges its declared params
into the current values and starts the pattern if necessary. Pattern/preset fetch
errors appear in the tab without taking down the UI. `/api/config` retains parsed
`presets` data and exposes `presetsFile` for this fetch.

Try the complete example (all five control types):

```sh
wavegrid projects open examples/plugins/pulse-demo.wavegrid --activate
wavegrid projects users add --project plugin-demo
wavegrid server --project plugin-demo
```

Open the printed URL, sign in, and choose **Plugin Pulse**. The example uses only
the brain preview; it needs no OSC hardware or receiver.

### Views

A tab may have `"view": "view/index.html"`, cards, or both (the view comes first).
The view file must exist inside the plugin, with the same path checks as patterns.
`"paint": true` opts this tab into main-grid paint gestures while it is active.
The example includes a **Pulse View** tab: fixture swatches, speed, start/stop,
scoped saved Looks, and a paint-event log.

Views run in `<iframe sandbox="allow-scripts">` at `/plugins/<id>/<view>`.
They have an opaque origin, never `allow-same-origin`, and receive no auth token,
socket URL or unrestricted command channel. The plugin route's CSP sandbox still
applies. Bundle scripts into the HTML or use classic scripts: opaque-origin
module/fetch requests need CORS and cannot access the parent application's APIs.

Messages are structured objects with `{ wg: 1, type, ... }`. A view sends them
using `parent.postMessage(message, '*')` and should verify `event.source === parent`
on receipt. The host accepts messages **only** from that iframe's `contentWindow`;
it replies with target origin `'*'` because the view has an opaque origin. Origin
`'null'` alone is not an identity check. Every inbound/outbound message is capped
at **256 KiB of UTF-8 JSON**. Malformed/oversized messages are dropped with a
console warning; unknown types are ignored. JSON params permit nested objects and
arrays (up to 64 levels); non-finite numbers, non-JSON values and reserved top-level
keys `__proto__`, `constructor`, `prototype` are rejected.

| Direction | `type` | Fields / behavior |
|---|---|---|
| Host → view | `init` | `pluginId`, namespaced `tabId`, `layout`, `pattern: { running, params }`, scoped `looks`; sent on iframe load |
| Host → view | `state` | `running`, `params`; updated with pattern state, never another pattern's params |
| Host → view | `looks` | `looks` belonging to this tab |
| Host → view | `paint` | `index`, `h`, `s`, `b`; only for the active `paint: true` view, instead of a `cannon` command |
| View → host | `start` | Optional `params`; starts the host-fetched, tab-configured pattern, not arbitrary submitted code |
| View → host | `stop` | Stops the running pattern |
| View → host | `setParams` | `params` JSON object; merges the patch, starts if stopped, otherwise deep-diffs only patch keys against live params and sends changed keys |
| View → host | `saveLook` | `name`, `params`; host overwrites `params.plugin` with `<pluginId>/<tabId>` |
| View → host | `renameLook` | `id`, `name`; allowed only for a Look tagged for this tab |
| View → host | `deleteLook` | `id`; same ownership check |
| View → host | `resize` | Finite numeric `height`, clamped to 120–1600 px (default 480). `{ wg: 'resize', height }` is also accepted |

`layout` includes `id`, `topology`, `count`, `cols`, `rows`, and fixture geometry
including `kind`, `u`, `v`, and `uv: [u, v]`. No routing or user configuration is
included. Running means an active pattern whose source equals this tab's fetched
source. `start` params merge into the tab's current/default params; `setParams`
preserves untouched values. Views retain arbitrary JSON params, while native card
controls still display defensively coerced values. Presets on view tabs may also
contain structured params. The bridge forwards no view-provided code or URLs.

### Plugin storage

Opening validates all plugins before changing the project, then replaces store
copies (including removal of unlisted plugins). Only regular files are copied;
dotfiles/directories are skipped and symlinks are rejected, even hidden ones.
Limits: **200 files**, **1 MiB per file**, **5 MiB per plugin**, **16 nested
directories**. Manifests, tabs and other assets count toward these limits.
Save-as to another folder copies store plugins beside the target `.wavegrid`.
Saving refuses nonempty plugin destination folders unless the settings API's
`SaveProjectFileOptions.overwrite` is true. Overwrite replaces plugin files only,
never deleting unrelated files (including `.git`). All destinations are checked
before anything is written.
Saving within the original folder leaves existing source folders alone and
restores missing plugin folders from the store (for example after importing a
bundle). Export bundles
carry plugin files as base64; older bundles without plugins still import.

The server loads plugins at startup and serves their files at
`/plugins/<id>/<file>` with traversal protection and `nosniff`. Plugin JavaScript
is never evaluated on the host. Files also receive `Content-Security-Policy:
sandbox allow-scripts`, keeping directly opened plugin pages off the UI's origin.

## Explicit fixture layouts

For a venue whose shape no generator describes, list every fixture:

| Field | Meaning |
| --- | --- |
| `x`, `y` | Position in any unit; only ratios matter. `y` grows downwards, like the UI canvas. |
| `kind` | `cannon` (default) or `projector` |
| `label` | Shown in the UI. Default: the 1-based index. |
| `row`, `col` | Grid coordinates, on every fixture or on none. With them the layout behaves like a grid. |
| `ring` | Concentric ring index (0 = innermost). Default 0. |

Array order is logical order: fixture 0 is cannon 0 for patterns, routing and light maps. Optional layout-level fields: `topology` (`grid` or `ring`; default `grid` when every fixture has `row`/`col`), `perimeter` (indices tracing the outer edge; default all fixtures by angle around the centre), `id` and `name`.
