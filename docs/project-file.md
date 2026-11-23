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
`[{ "title": "Color", "controls": [] }]`. Controls are carried as data; their
schema and rendering come later. `showWhen` is `"always"`, `"never"`, or an object
whose `fixtureKind`, `topology`, `minFixtures` and `layoutId` conditions are ANDed.
An empty object always matches. Tab ids in `/api/config` are `<pluginId>/<tabId>`.

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
Saving within the original folder leaves source folders alone. Export bundles
carry plugin files as base64; older bundles without plugins still import.

The server loads plugins at startup and serves their files at
`/plugins/<id>/<file>` with traversal protection and `nosniff`. Plugin JavaScript
is never evaluated on the host. This step adds no plugin UI rendering.

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
