---
name: wavegrid-js-pattern-evaluation
description: How to write and send dynamic JavaScript patterns to wavegrid receivers via the evalPattern command. Covers the pattern ABI, ctx API, safety limits, wire format, and interaction with existing controls. Use when building or debugging JS patterns for the wavegrid laser system.
---

# Writing & Sending JavaScript Patterns for Wavegrid

## Overview

Wavegrid receivers evaluate dynamic JavaScript patterns in a sandboxed QuickJS VM. This is the "escape hatch" for custom animations that aren't built in. Patterns run locally on the receiver at 60fps — the server only relays the initial code.

## Wire Format

All commands are JSON objects sent over WebSocket to the wavegrid server, which relays them to the receiver.

### Send a Pattern

```json
{
  "action": "evalPattern",
  "code": "({ render(ctx) { ctx.fill(ctx.t * 30 % 360, 100, 80); } })",
  "params": {"speed": 1.0}
}
```

- `code` (string, required): JavaScript expression that evaluates to a pattern object
- `params` (object, optional): Initial parameters accessible via `ctx.p`

### Update a Parameter at Runtime

```json
{"action": "setPatternParam", "name": "speed", "value": 2.0}
```

Updates `ctx.p[name]` and calls `onParam(name, value, ctx)` if defined.

### Stop a Pattern

```json
{"action": "stopPattern"}
```

Disposes the QuickJS sandbox. Also triggered by `stop` and `clear` commands.

## Pattern ABI

A pattern is a JavaScript **object expression** (not a block statement). It must be wrapped in parentheses `({ ... })`.

```js
({
  // Required — called once per frame (~60fps)
  render(ctx) {
    for (let i = 0; i < ctx.count; i++) {
      const [u, v] = ctx.uv(i);
      ctx.set(i, (ctx.t * 60 + u * 360) % 360, 100, 80);
    }
  },

  // Optional — called once when pattern loads
  init(ctx) {
    ctx.log('Pattern loaded');
  },

  // Optional — called when setPatternParam arrives
  onParam(name, value, ctx) {
    ctx.log('Param ' + name + ' = ' + value);
  },

  // Optional — metadata
  meta: {
    name: 'my-pattern'
  }
})
```

### Critical: Expression, Not Block

The code **must** be an expression, not a block. Use `({ ... })` with outer parentheses:

```js
// CORRECT — expression
({ render(ctx) { ctx.fill(0, 100, 50); } })

// WRONG — block statement, will fail
{ render(ctx) { ctx.fill(0, 100, 50); } }
```

Alternatively, assign to `__pattern` directly:

```js
__pattern = { render(ctx) { ctx.fill(0, 100, 50); } }
```

## The `ctx` Object

### Properties

| Property | Type | Description |
|---|---|---|
| `ctx.cols` | number | Grid width (e.g. 7) |
| `ctx.rows` | number | Grid height (e.g. 7 or 2) |
| `ctx.count` | number | Total cells (`cols * rows`) |
| `ctx.t` | number | Seconds since pattern loaded (wall clock) |
| `ctx.dt` | number | Delta time per frame (~0.0167) |
| `ctx.frame` | number | Frame counter (1, 2, 3, ...) |
| `ctx.p` | object | Parameters from `params` or `setPatternParam` |

### Grid Indexing

| Method | Returns | Description |
|---|---|---|
| `ctx.xy(i)` | `[x, y]` | Column/row for flat cell index |
| `ctx.index(x, y)` | number | Flat cell index for column/row |
| `ctx.uv(i)` | `[u, v]` | Normalized 0-1 coordinates |
| `ctx.polar(i)` | `[r, theta]` | Polar coords from grid center (r is 0-1) |
| `ctx.kind(i)` | `'cannon'` or `'projector'` | Fixture kind from the resolved layout; missing kinds and out-of-range indices return `'cannon'` |

Cells are indexed left-to-right, top-to-bottom: index 0 is top-left, index `count-1` is bottom-right.

### Color Output (HSB)

All colors are **HSB**: hue 0-360, saturation 0-100, brightness 0-100.

| Method | Description |
|---|---|
| `ctx.set(i, h, s, b)` | Set cell `i` to HSB color |
| `ctx.setXY(x, y, h, s, b)` | Set cell at column `x`, row `y` |
| `ctx.fill(h, s, b)` | Fill entire grid with one color |
| `ctx.clear()` | Set all cells to black |
| `ctx.get(i)` | Read back `[h, s, b]` for cell `i` |

### Math Utilities

| Method | Description |
|---|---|
| `ctx.lerp(a, b, t)` | Linear interpolation |
| `ctx.clamp(v, min?, max?)` | Clamp value (defaults: 0, 1) |
| `ctx.smoothstep(edge0, edge1, x)` | Hermite smoothstep |
| `ctx.fract(v)` | Fractional part |
| `ctx.map(v, inLo, inHi, outLo, outHi)` | Remap range |
| `ctx.noise(x, y?, z?)` | Value noise (0-1) |
| `ctx.rand()` | Deterministic random 0-1 |
| `ctx.rand(max)` | Deterministic random 0-max |
| `ctx.rand(min, max)` | Deterministic random min-max |
| `ctx.randInt(min, max)` | Deterministic random integer [min, max] |

### Logging

```js
ctx.log('debug message', someValue);
```

Logs to the receiver console prefixed with `[pattern]`.

## Safety Limits

| Limit | Value |
|---|---|
| CPU per `render()` call | 6ms |
| CPU for pattern load + `init()` | 2000ms |
| Memory | 64MB |
| Stack | 512KB |

If `render()` exceeds 6ms, the QuickJS VM is interrupted and that frame is skipped. The pattern continues on the next frame. If the pattern load exceeds 2000ms or hits a memory limit, the sandbox is disposed.

## Interaction With Existing Controls

Pattern output feeds into the **same pipeline** as built-in animations. All existing controls still work:

| Control | Effect on eval pattern |
|---|---|
| **Fade (smoothness)** | Smooths pattern output via LP filter — high fade makes pattern transitions appear slower |
| **Attack** | Controls blend strength toward pattern's target colors |
| **Brightness** | Caps final brightness globally |
| **Shift** | Applies wrap-around shift independently |
| **Stop / Clear** | Kills the pattern and disposes the sandbox |
| **Paint** | Can paint over cells while a pattern runs |
| **Animation Speed** | No effect — patterns control speed via `ctx.t` |

The JS function is **never modified** by these controls. They operate on the output downstream:
```
pattern render() → setTarget() → LP filter (fade) → brightness cap → OSC output
```

## Example Patterns

### Solid Color Cycle

```json
{
  "action": "evalPattern",
  "code": "({ render(ctx) { ctx.fill(ctx.t * 30 % 360, 100, 80); } })"
}
```

### Rainbow Columns

```json
{
  "action": "evalPattern",
  "code": "({ render(ctx) { for (let i = 0; i < ctx.count; i++) { const [x] = ctx.xy(i); ctx.set(i, (x / ctx.cols * 360 + ctx.t * 40) % 360, 100, 85); } } })"
}
```

### Noise Field

```json
{
  "action": "evalPattern",
  "code": "({ render(ctx) { for (let i = 0; i < ctx.count; i++) { const [u, v] = ctx.uv(i); const n = ctx.noise(u * 3, v * 3, ctx.t * 0.5); ctx.set(i, n * 360, 80, n * 100); } } })"
}
```

### Radial Pulse

```json
{
  "action": "evalPattern",
  "code": "({ render(ctx) { for (let i = 0; i < ctx.count; i++) { const [r] = ctx.polar(i); const w = Math.sin(r * 6 - ctx.t * 3) * 0.5 + 0.5; ctx.set(i, 200 + w * 60, 90, w * 100); } } })"
}
```

### Parameterized Pattern (with init + onParam)

```json
{
  "action": "evalPattern",
  "code": "({ init(ctx) { ctx.log('Speed:', ctx.p.speed || 1); }, render(ctx) { const speed = ctx.p.speed || 1; const hue = ctx.p.hue || 0; for (let i = 0; i < ctx.count; i++) { const [u] = ctx.uv(i); ctx.set(i, (hue + u * 120 + ctx.t * 60 * speed) % 360, 100, 85); } }, onParam(name, val, ctx) { ctx.log(name + ' = ' + val); }, meta: { name: 'configurable-sweep' } })",
  "params": {"speed": 0.5, "hue": 180}
}
```

Update at runtime:
```json
{"action": "setPatternParam", "name": "speed", "value": 2.0}
{"action": "setPatternParam", "name": "hue", "value": 0}
```

## Grid Sizes

| Grid | Dimensions | Cell Count |
|---|---|---|
| Main (7×7) | 7 columns × 7 rows | 49 cells |
| Pride (7×2) | 7 columns × 2 rows | 14 cells |

Patterns auto-adapt to the grid via `ctx.cols`, `ctx.rows`, and `ctx.count`. Always loop `0..ctx.count` and use `ctx.uv(i)` / `ctx.polar(i)` for position-independent effects.

## Architecture Notes

- Patterns run on the **receiver** (not the server). The server only relays the `evalPattern` command.
- The QuickJS sandbox is an emscripten-compiled VM — patterns cannot access the filesystem, network, or Node.js APIs.
- Only one pattern runs at a time. Sending a new `evalPattern` disposes the previous sandbox.
- `ctx.rand()` is deterministic (seeded PRNG) — the same pattern produces the same random sequence on reload.
- Source files: `packages/receiver/src/sandbox-engine.ts`, `packages/receiver/src/sandbox-prelude.ts`

## Common Mistakes

1. **Forgetting parentheses** — `{ render(ctx) { ... } }` is a block, not an object. Use `({ render(ctx) { ... } })`.
2. **Using `export`** — The sandbox strips `export` keywords automatically, but avoid them for clarity.
3. **Exceeding CPU budget** — Complex noise or nested loops on large grids can exceed 6ms. Profile with `ctx.log(Date.now())`.
4. **Assuming Node.js APIs** — No `require`, `setTimeout`, `fetch`, `Buffer`, `process`, etc. Only ES5/ES6 core language + `Math` object.
