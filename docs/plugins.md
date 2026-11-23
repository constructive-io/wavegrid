# Writing a plugin

Plugins live beside a `.wavegrid` project, not inside Wavegrid's application code.
They supply parameterized patterns, presets, native control cards and optionally
custom UI tabs in sandboxed iframes. Metadata is validated by settings at project
open and by doctor; neither executes project JavaScript on the host.

## Start with a scaffold

```sh
wavegrid plugins new my-show --project venue.wavegrid
wavegrid plugins new my-view --project venue.wavegrid --view --audio grace
```

The command creates `plugins/<id>/` next to the project and appends
`{ "path": "plugins/<id>" }` to its `plugins` array. Existing references, unknown
fields and all other project data are retained; JSON is reformatted with two-space
indentation and atomically replaced, as with project save. Existing folders,
including empty ones, are never overwritten. IDs use the existing plugin/project
rule: letters, digits, `.`, `_`, `-`, but not `.` or `..`. Paths and spaces are not
IDs. A duplicate loaded manifest ID is also rejected.

Without `--project`, the active store project's linked file is used (or the
project named by `WAVEGRID_PROJECT`). An unlinked project needs an explicit file.
The command edits the project file, not its store copy: reopen it after editing,
then restart any running server to load the new assets:

```sh
wavegrid projects open venue.wavegrid --activate
wavegrid doctor
wavegrid server
```

```text
venue.wavegrid
plugins/my-show/
  plugin.json
  tab.json
  pattern.js
  presets.json
  view/index.html     # only with --view
```

Templates ship as files in the CLI package. `--audio` currently accepts only
`grace`; unsupported modes fail validation without creating the plugin. The
starter pattern uses hue/saturation shifts, while the optional view demonstrates
start/stop, live params and shared-brush messages.

## Manifest, tabs and catalogs

`plugin.json` declares `id`, `name`, `version`, `apiVersion: 1`, optional
`wavegrid: "0.5.0"` (minimum runtime/protocol version, not npm version),
`pattern: "pattern.js"`, `tabs: ["tab.json"]`, and `presets: "presets.json"`.
All referenced files must exist inside the plugin folder. Use additional tab
files for additional interfaces; tab IDs are namespaced as `<pluginId>/<tabId>`.

`tab.json` has `id`, `label`, optional `pattern` override, optional `view`,
optional `showWhen`, and `cards: [{ "title": "Color", "controls": [...] }]`.
Cards support slider, toggle, select, color and start/stop button controls.
Non-button controls declare a unique `param` and a typed `default`; sliders
also need finite `min` and `max`. Changing controls starts or updates the pattern.
See the [control schema](project-file.md#controls-and-presets) for every field.

Presets are editable JSON: `[{ "name": "Blue", "params": { "hue": 210 } }]`.
They merge into the current params and start the pattern if stopped. Custom
views may load other editable catalogs from their own asset folder and use
structured JSON params. Never put credentials in these public files.

`showWhen` defaults to `"always"`; it also accepts `"never"` or an object with
`fixtureKind`, `topology`, `minFixtures`, `layoutId` and `pluginAudio`, ANDed
together. `{ "pluginAudio": true }` requires any retained loaded audio binding;
`{ "pluginAudio": "grace" }` requires an exact mode match. Missing binding
context fails closed. This describes loaded capabilities, not current playback
or the selected mode. Hidden/unmounted tabs still contribute their binding.

## Pattern context API

`pattern.js` is a JavaScript object expression with `render(ctx)`, optional
`init(ctx)` and `onParam(name, value, ctx)`, and optional `meta.params` defaults.
It is **not** an ESM or Node module. It runs in the shared QuickJS runtime on the
brain and receivers, without DOM, filesystem, network or Node globals.

```js
({
  render(ctx) {
    for (let i = 0; i < ctx.count; i++) {
      const [radius, angle] = ctx.polar(i);
      const hue = ctx.kind(i) === 'projector' ? 240 : (angle * 180 / Math.PI + 360) % 360;
      ctx.set(i, hue, 100, ctx.p.brightness ?? 70);
    }
  }
})
```

| API | Meaning |
| --- | --- |
| `p` | Live JSON params; supply fallbacks for undeclared params |
| `t`, `dt`, `frame` | Elapsed seconds, frame delta seconds and frame number |
| `count`, `cols`, `rows` | Fixture count and layout grid dimensions |
| `kind(i)` | `"cannon"` or `"projector"`; default/fallback is `"cannon"` |
| `uv(i)` | Resolved normalized `[u, v]` geometry |
| `polar(i)` | Resolved `[radius, angle]`, angle in radians |
| `xy(i)` | `[col, row]` for gridded fixtures, else physical `[x, y]` |
| `index(x, y)` | Grid index `y * cols + x`; prefer geometry for non-grids |
| `set(i, h, s, b)`, `setXY(x, y, h, s, b)` | Write HSB: hue wraps to 0–360, saturation/brightness clamp to 0–100 |
| `fill(h, s, b)`, `clear()`, `get(i)` | Fill, clear to black, read `[h, s, b]` |
| `lerp(a,b,t)`, `clamp(v,a=0,b=1)`, `smoothstep(e0,e1,x)`, `fract(v)`, `map(v,a,b,c,d)` | Math helpers |
| `noise(x,y,z)`, `rand()`, `rand(max)`, `rand(min,max)`, `randInt(min,max)` | Noise and deterministic seeded random helpers (`randInt` inclusive) |
| `log(...values)` | Captured runtime diagnostics |

Use `ctx.count` and resolved geometry, not hard-coded fixture counts or routing
assumptions. Use `ctx.kind(i)` when mixed projector/cannon layouts need different
behavior. Pattern targets remain subject to normal host compositing and safety.

## Views, bridge and brush

`--view` adds `view/index.html`, referenced by `tab.view`. Views run in an
opaque-origin `sandbox="allow-scripts"` iframe, never with `allow-same-origin`.
Relative asset/module fetches are credentialless. Native form submission is not
available; use scripted actions. No auth token, socket URL or unrestricted
command channel is given to the view.

Messages are objects `{ wg: 1, type, ...fields }`. Send with
`parent.postMessage(message, '*')`; receive only if `event.source === parent`.
The host checks the mounted active view's window, not merely its `"null"` origin.

- Host → view: `init` includes layout, `pattern: { running, params }`,
  `brush: { h, s, b }` and scoped Looks. `state` supplies live `running` and
  `params`; `brush` supplies updated `h`, `s`, `b`; `looks` updates scoped Looks.
  A `paint: true` tab also receives grid `paint` events.
- View → host: `start` with optional `params`, `stop`, `setParams` with a JSON
  patch, `setBrush` with at least one finite `h`, `s`, `b`, scoped `saveLook`,
  `renameLook`, `deleteLook`, and `resize` with a height. `setParams` starts a
  stopped pattern; untouched params are preserved. The host fetches configured
  pattern source; the view cannot submit code or arbitrary commands.
- Brush updates share the Paint tab's color. `setBrush` clamps hue to 0–360 and
  saturation/brightness to 0–100. Brush changes do not automatically change a
  pattern: decide when to send `setParams`, as the scaffold demonstrates.

See the [bridge message table](project-file.md#views) for exact
fields, scoped Look ownership and truncation behavior.

## Audio bindings

`--audio grace` adds a declarative host-owned binding:

```json
"audio": {
  "mode": "grace",
  "params": { "hueShift": "hueShift", "satShift": "satShift" }
}
```

`params` maps GraceAudioOutput fields to pattern param names. An optional `step`
cycles a parameter through a JSON values catalog on beats and applies additional
`set` params; see the [full binding schema](project-file.md#declarative-audio-bindings).
Bindings work even while their tab is unmounted. Only the first binding for each
mode across loaded tabs is retained; conflicts produce doctor warnings.
Updates require the configured pattern's source to be active, regardless of
which tab started it. Beats never start a pattern. Stopping Grace audio or
changing mode resets mapped params to zero only for bindings that participated
in that run. Manual params are not reset just by opening or starting a pattern.
The Audio tab appears for loaded Grace bindings through `showWhen.pluginAudio`.

## Limits and examples

Plugin folders allow **200 files**, **1 MiB per file**, **5 MiB total**, and
**16 nested directories**. Symlinks, unsafe paths and nonregular entries are
rejected; hidden files are not copied. Metadata/control params reject reserved
names such as `__proto__`, `constructor`, `prototype`. Bridge messages are capped
at **256 KiB UTF-8 JSON**, params at 64 nesting levels, and resize at 120–1600 px.
QuickJS defaults: **64 MiB memory**, **512 KiB stack**, **2000 ms load/init** and
**6 ms render** budgets. Keep per-frame work bounded and handle runtime errors
via Wavegrid diagnostics; settings validates metadata, not renderer behavior.

Real project examples in `illuminate-sf/wavegrid-projects`:

- [Palace](https://github.com/illuminate-sf/wavegrid-projects/tree/main/2026-11-palace-of-fine-arts/plugins/palace)
- [Pride](https://github.com/illuminate-sf/wavegrid-projects/tree/main/2026-06-embarcadero-market-street/plugins/pride)
- [Grace and GracePaint](https://github.com/illuminate-sf/wavegrid-projects/tree/main/2026-08-grace-cathedral/plugins/grace)
- [USA](https://github.com/illuminate-sf/wavegrid-projects/tree/main/2026-06-civic-center/plugins/usa)

They demonstrate editable catalogs, parameterized patterns, scoped Looks and
QuickJS frame-parity tests. Also see the small `examples/plugins/pulse-demo` in
this repository.
