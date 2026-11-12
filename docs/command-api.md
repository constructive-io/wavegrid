# Command Mode API Reference

The wavegrid server operates as a lightweight command relay. Clients send JSON messages over WebSocket to the server, which relays them to receivers as `{type: "command", action: "...", ...}` packets. Receivers run animations locally at 60fps — the server never computes or streams full grid state.

---

## Commands

All commands are JSON objects sent to the server WebSocket (default port 3000).

### Animations

```json
{"action": "animation", "name": "wave"}
```

Start a built-in animation. Available names: `wave`, `breathe`, `rainbow`, `fire`, `matrix`, `sparkle`, `pulse`, `cascade`, `plasma`, `ripple`, `pride-flow`, `pride-breathe`, `pride-rotate`, `pride-ring`.

### Scenes

```json
{"action": "scene", "name": "ocean"}
```

Set a static color scene.

### Stop / Clear

```json
{"action": "stop"}
{"action": "clear"}
```

`stop` — stops the current animation and shift. `clear` — stops everything and sets all cells to black.

### Paint

```json
{"action": "cannon", "index": 5, "h": 200, "s": 100, "b": 80}
{"action": "selection", "indices": [0, 1, 2], "h": 120, "s": 100, "b": 90}
```

Paint individual cells or multi-select. HSB values: `h` = 0-360, `s` = 0-100, `b` = 0-100.

### Brightness

```json
{"action": "master_brightness", "value": 75}
```

Global brightness cap (0-100).

### Projector controls (dormant — no UI yet)

```json
{"action": "projector", "indices": [1, 3], "control": {"size": 60, "rotoz": 45, "anispeed": 120, "fx": [3, -1, -1, -1]}}
{"action": "projector_cue", "command": {"cueDown": {"page": 0, "cue": 2}}}
{"action": "projector_cue", "command": {"stopZone": 1}}
{"action": "projector_cue", "command": {"stopAllNow": true}}
```

Projector-only live controls for fixtures whose layout `kind` is `projector` (e.g. the interleaved 12×2 preset). `indices` are **logical** indices; the server drops any that are not projectors, and a receiver's routed output drops any route that is not `kind: "projector"`, so a cannon can never be resized or moved by this path. Fields map 1:1 onto BEYOND zone livecontrol functions with Pangolin's documented ranges: `size`/`sizex`/`sizey` −400..400, `zoom` 0..100, `posx`/`posy` −32768..32768, `anglez` ±2880, `rotoz` ±1440 °/s, `anispeed` 0..400, `scanrate` 10..200, `visiblepoints` 0..100, `fx` four slots −1 (stop)..47. `projector_cue` is show-level (`/beyond/general/CueDown|StopZone|StopAllNow`). Colour and brightness are **not** here — projectors take HSB through `cannon`/`selection`/scenes like every other fixture. Laser-emission enable/disable is deliberately not exposed.

### Smoothness (Fade)

```json
{"action": "smoothness", "value": 0.05}
```

LP filter alpha (0-1). Lower = smoother/slower transitions. Higher = snappier.

### Attack

```json
{"action": "attack", "value": 0.8}
```

Blend strength when setting new targets (0-1).

### Animation Speed

```json
{"action": "anim_speed", "value": 0.5}
```

Speed multiplier for built-in animations (0.1-5.0). Does not affect eval patterns.

### Shift

```json
{"action": "shift", "vx": 1, "vy": 0}
```

Wrap-around shift velocity. `vx`/`vy` in cells per second.

---

## Pattern Evaluation (QuickJS Sandbox)

Dynamic JavaScript patterns can be sent to receivers for local evaluation in a sandboxed QuickJS VM. This is the "escape hatch" for custom animations that aren't built in.

Pattern evaluation is always available — the server relays `evalPattern` commands to receivers.

### Send a Pattern

```json
{
  "action": "evalPattern",
  "code": "({ render(ctx) { ctx.fill(ctx.t * 60 % 360, 100, 80); } })",
  "params": {"speed": 2.0}
}
```

The `code` field is a JavaScript expression that evaluates to a pattern object. The `params` field is optional initial parameters accessible via `ctx.p`.

### Update a Parameter

```json
{"action": "setPatternParam", "name": "speed", "value": 3.0}
```

Updates a single parameter on the running pattern. Calls `onParam(name, value, ctx)` if defined, and updates `ctx.p[name]`.

### Stop the Pattern

```json
{"action": "stopPattern"}
```

Disposes the sandbox and returns to idle. Also triggered by `stop` and `clear` commands.

---

## Writing Patterns

A pattern is a JavaScript object expression with the following shape:

```js
({
  // Required: called once per frame (~60fps)
  render(ctx) {
    for (let i = 0; i < ctx.count; i++) {
      const [u, v] = ctx.uv(i);
      const hue = (ctx.t * 60 + u * 360) % 360;
      ctx.set(i, hue, 100, 80);
    }
  },

  // Optional: called once when pattern loads
  init(ctx) {
    ctx.log('Pattern initialized');
  },

  // Optional: called when a parameter changes
  onParam(name, value, ctx) {
    ctx.log('Param ' + name + ' = ' + value);
  },

  // Optional: metadata
  meta: {
    name: 'rainbow-sweep'
  }
})
```

### Important: the code must be an expression

Wrap the object in parentheses `({ ... })` so it evaluates as an expression, not a block. Alternatively, you can use:

```js
__pattern = { render(ctx) { ... } }
```

The sandbox assigns the result of `evalCode(code)` to `__pattern`, so as long as the code produces a pattern object (either as the return value of an expression or by setting `__pattern` directly), it will work.

### The `ctx` Object

| Property / Method | Description |
|---|---|
| `ctx.cols` | Grid width (e.g. 7) |
| `ctx.rows` | Grid height (e.g. 7 or 2) |
| `ctx.count` | Total cells (`cols * rows`) |
| `ctx.t` | Time in seconds since pattern loaded |
| `ctx.dt` | Delta time per frame (~0.0167) |
| `ctx.frame` | Frame counter (1, 2, 3, ...) |
| `ctx.p` | Parameters object (from `params` or `setPatternParam`) |

#### Grid Indexing

| Method | Returns | Description |
|---|---|---|
| `ctx.xy(i)` | `[x, y]` | Column/row for cell index |
| `ctx.index(x, y)` | `number` | Cell index for column/row |
| `ctx.uv(i)` | `[u, v]` | Normalized 0-1 coordinates |
| `ctx.polar(i)` | `[r, theta]` | Polar coords from grid center (r normalized 0-1) |

#### Color Output (HSB)

Colors use **HSB**: hue 0-360, saturation 0-100, brightness 0-100.

| Method | Description |
|---|---|
| `ctx.set(i, h, s, b)` | Set cell `i` to HSB color |
| `ctx.setXY(x, y, h, s, b)` | Set cell at column `x`, row `y` |
| `ctx.fill(h, s, b)` | Fill entire grid with one color |
| `ctx.clear()` | Set all cells to black (0, 0, 0) |
| `ctx.get(i)` | Read back `[h, s, b]` for cell `i` |

#### Math Utilities

| Method | Description |
|---|---|
| `ctx.lerp(a, b, t)` | Linear interpolation |
| `ctx.clamp(v, min, max)` | Clamp value (defaults: 0, 1) |
| `ctx.smoothstep(edge0, edge1, x)` | Hermite smoothstep |
| `ctx.fract(v)` | Fractional part |
| `ctx.map(v, inLo, inHi, outLo, outHi)` | Remap range |
| `ctx.noise(x, y?, z?)` | Value noise (0-1) |
| `ctx.rand()` | Deterministic random 0-1 |
| `ctx.rand(max)` | Deterministic random 0-max |
| `ctx.rand(min, max)` | Deterministic random min-max |
| `ctx.randInt(min, max)` | Deterministic random integer [min, max] |

#### Logging

```js
ctx.log('debug message', someValue);
```

Logs to the receiver console prefixed with `[pattern]`.

### Safety Limits

| Limit | Value |
|---|---|
| CPU per `render()` call | 6ms |
| CPU for pattern load | 2000ms |
| Memory | 64MB |
| Stack | 512KB |

If `render()` exceeds 6ms, the VM is interrupted and that frame is skipped. The pattern continues running on the next frame.

---

## Example Patterns

### Solid Color Cycle

```js
({
  render(ctx) {
    ctx.fill(ctx.t * 30 % 360, 100, 80);
  }
})
```

### Rainbow Columns

```js
({
  render(ctx) {
    for (let i = 0; i < ctx.count; i++) {
      const [x] = ctx.xy(i);
      ctx.set(i, (x / ctx.cols * 360 + ctx.t * 40) % 360, 100, 85);
    }
  }
})
```

### Noise Field

```js
({
  render(ctx) {
    for (let i = 0; i < ctx.count; i++) {
      const [u, v] = ctx.uv(i);
      const n = ctx.noise(u * 3, v * 3, ctx.t * 0.5);
      ctx.set(i, n * 360, 80, n * 100);
    }
  }
})
```

### Radial Pulse

```js
({
  render(ctx) {
    for (let i = 0; i < ctx.count; i++) {
      const [r] = ctx.polar(i);
      const wave = Math.sin(r * 6 - ctx.t * 3) * 0.5 + 0.5;
      ctx.set(i, 200 + wave * 60, 90, wave * 100);
    }
  }
})
```

### Parameterized Pattern

```js
({
  init(ctx) {
    ctx.log('Speed:', ctx.p.speed || 1);
  },
  render(ctx) {
    const speed = ctx.p.speed || 1;
    const hueBase = ctx.p.hue || 0;
    for (let i = 0; i < ctx.count; i++) {
      const [u, v] = ctx.uv(i);
      const h = (hueBase + u * 120 + ctx.t * 60 * speed) % 360;
      ctx.set(i, h, 100, 85);
    }
  },
  onParam(name, value, ctx) {
    ctx.log('Updated', name, '=', value);
  },
  meta: { name: 'configurable-sweep' }
})
```

Send with params:
```json
{
  "action": "evalPattern",
  "code": "({ init(ctx) { ... }, render(ctx) { ... }, ... })",
  "params": {"speed": 0.5, "hue": 180}
}
```

Then update at runtime:
```json
{"action": "setPatternParam", "name": "speed", "value": 2.0}
```

---

## Interaction With Existing Controls

When a pattern is running, the existing slider controls still work:

| Control | Effect on eval pattern |
|---|---|
| **Fade (smoothness)** | Smooths pattern output transitions via LP filter |
| **Attack** | Controls blend strength toward pattern's target colors |
| **Brightness** | Caps final brightness globally |
| **Shift** | Applies wrap-around shift to grid independently |
| **Stop / Clear** | Kills the pattern and disposes the sandbox |
| **Animation Speed** | No effect (patterns control their own speed via `ctx.t`) |
| **Paint** | Can paint over cells while a pattern is running |

Pattern output goes through the same pipeline as built-in animations: `pattern render → setTarget() → LP filter → brightness cap → OSC output`.
