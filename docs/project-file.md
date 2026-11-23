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
whose `fixtureKind`, `topology`, `minFixtures`, `layoutId` and `pluginAudio` conditions are ANDed.
An empty object always matches. Tab ids in `/api/config` are `<pluginId>/<tabId>`.

### Writing a plugin

Run `wavegrid plugins new my-show --project venue.wavegrid` to create a validated
starter and register it in the file. Add `--view` for a sandboxed iframe and
`--audio grace` for host-owned audio shifts. Without `--project`, the command uses
the active store project's linked file. See the [plugin authoring guide](plugins.md)
for the complete workflow, pattern context API and project examples.

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
The view file must end in lowercase `.html` and exist inside the plugin, with the
same path checks as patterns. Extensions such as `.htm` and `.HTML` are rejected.
`"paint": true` opts this tab into main-grid paint gestures while it is active.
The example includes a **Pulse View** tab: fixture swatches, speed, start/stop,
scoped saved Looks, and a paint-event log.

Views run in `<iframe sandbox="allow-scripts">` at `/plugins/<id>/<view>`.
They have an opaque origin, never `allow-same-origin`, and receive no auth token,
socket URL or unrestricted command channel. The plugin route's CSP sandbox still
applies, including `form-action 'none'`. The bridge trusts only the first load;
later loads immediately revoke the bridge and remount the original view. More
than three remounts in ten seconds stops the view with an error instead of looping.
Plugin assets allow credentialless CORS (`Access-Control-Allow-Origin: *`, never
`Access-Control-Allow-Credentials`), so views may fetch relative JSON/assets or
load modules from their plugin folder. This does not grant access to authenticated
application APIs or the parent document.

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
| Host → view | `init` | `pluginId`, namespaced `tabId`, `layout`, `pattern: { running, params }`, `brush: { h, s, b }`, scoped `looks`; sent on iframe load |
| Host → view | `brush` | `h`, `s`, `b`; sent when the shared app brush changes |
| Host → view | `state` | `running`, `params`; updated with pattern state, never another pattern's params |
| Host → view | `looks` | `looks` belonging to this tab |
| Host → view | `paint` | `index`, `h`, `s`, `b`; only for the active `paint: true` view, instead of a `cannon` command |
| View → host | `start` | Optional `params`; starts the host-fetched, tab-configured pattern, not arbitrary submitted code |
| View → host | `stop` | Stops the running pattern |
| View → host | `setParams` | `params` JSON object; merges the patch, starts if stopped, otherwise deep-diffs only patch keys against live params and sends changed keys |
| View → host | `setBrush` | At least one of `h`, `s`, `b`; finite numbers, clamped to 0–360 for hue and 0–100 for saturation/brightness; changes the same brush used by Paint |
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

`init` and `looks` send scoped Looks newest-first. If the complete set would
exceed the message budget, the host includes the newest Looks that fit and sets
`looksTruncated: true`. A single oversized Look is skipped; layout and pattern
metadata retain their budget instead of being dropped along with the Looks.

### Declarative audio bindings

`showWhen: { "pluginAudio": true }` shows a tab when any loaded project plugin
has a validated audio binding; `showWhen: { "pluginAudio": "grace" }` requires
an exact binding-mode match. Mode names are nonempty strings, not project IDs.
Missing context or no retained bindings means no match. This condition is ANDed
with any layout conditions, for example
`{ "topology": "rings", "pluginAudio": "grace" }`. It is available to both
built-in and plugin tabs. Bindings count even when their owning tab is hidden or
unmounted, since audio dispatch is host-owned. Only validated bindings retained
by first-binding-wins resolution count, not the currently selected audio mode,
running pattern or successful catalog fetch.

The built-in Audio tab uses `{ "pluginAudio": "grace" }`, exposing its source
and mode controls when a loaded plugin supports the currently implemented
binding mode. Thus Grace Cathedral projects show Audio, while projects without
an audio binding (such as Palace) keep it hidden. Opening Audio or selecting
Grace mode does not start or replace a pattern; start the plugin pattern first,
then select a microphone or audio file to drive it. Other Audio modes retain
their existing behavior.

A tab can declare host-owned audio control, independent of whether its view or
cards are mounted. Currently only `mode: "grace"` is supported:

```json
"audio": {
  "mode": "grace",
  "params": { "hueShift": "hueShift", "satShift": "satShift" },
  "step": {
    "param": "stops",
    "values": { "file": "view/gradients.json", "key": "stops" },
    "set": { "paint": [] }
  }
}
```

`params` maps `GraceAudioOutput` fields (`hueShift`, `satShift`, or boolean `step`)
to pattern parameter names. `params` and `step` are individually optional; at
least one is required. On a strong-beat step, the host compares the live value of
`step.param` with the catalog using JSON equality, advances with wraparound, or
uses the first value if none matches. Each `step.set` entry is sent in the same
update (default `{}`). `values.file` must be a JSON file inside the plugin with a
nonempty array; optional `key` extracts that own property from every object in
the array. Without `key`, the array items themselves are the values. Values are
fetched as public plugin assets, like presets; invalid fetches disable stepping
and warn in the console without clearing paint. Parameter names and `key` follow
control identifier rules; `__proto__`, `constructor`, and `prototype` are rejected.

The first binding for each mode wins in plugin/tab load order; later bindings
are ignored with a doctor warning. A binding requires a configured pattern.
The host only updates an active brain pattern with the exact fetched source,
including when another tab sharing that source started it; no plugin tag is
needed.
A beat never starts a plugin pattern. The transition from playing Grace audio to
stopped audio or another mode resets mapped shifts to zero only if the binding
sent an update during that run and its pattern is still active. Manual params
are left alone when Grace audio has not controlled the pattern. Audio → Grace
dispatches only through plugin audio bindings; there is no built-in pattern
consumer or beat auto-start. These updates need neither an iframe nor its
message bridge.

GracePaint is provided by the project's `grace/gracepaint` plugin tab, not a
built-in tab. Plugin views own their scoped Looks; the hidden legacy Looks tab
has been removed. On load or save, the brain scopes legacy GracePaint Looks to
`grace/gracepaint` only when `params.plugin` and `params.kind` are both absent,
`anim` and `flow` are strings, and `stops` and `paint` are arrays. Paint length is
not checked, so the plugin can resize it on recall. The Palace migration stays
independent and existing scopes are never replaced. File migration is atomic,
idempotent, and inserts only the scope property, preserving all other raw bytes.

Brush messages, unlike audio bindings, are only available to the trusted mounted
view of the active tab, under the same source, navigation and size checks as all
other bridge messages. A brush update does not start a pattern or paint fixtures.

### Palace compatibility

Palace is a project plugin, not a built-in tab. Open a Palace project from
`illuminate-sf/wavegrid-projects` with its `plugins/palace` folder to get the
Scenes, Colour, Motion and Paint view on projector layouts. A projector layout
alone no longer adds a Palace tab.

When the brain loads its Looks file, legacy Looks with `params.kind: 'palace'`
and no `params.plugin` are tagged `palace/palace` and written back once. Saving
an unscoped Palace Look applies the same migration. Existing scopes are never
overwritten; IDs, names, timestamps, ordering and all other params are preserved.
Project imports also pass through this migration when the brain next loads them.
The plugin recalls the original stops, motion, trims and hue shift, and resizes
paint to the current fixture count by padding or truncating at the same indices
(not remapping by geometry or kind). The plugin must be installed to recall them.

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
