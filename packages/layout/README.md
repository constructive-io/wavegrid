# @wavegrid/layout

<p align="center" width="100%">
  <img height="250" src="https://raw.githubusercontent.com/constructive-io/constructive/refs/heads/main/assets/outline-logo.svg" />
</p>


Config-driven fixture layouts — the single source of truth for cannon geometry.

Every other package (patterns, animations, scenes, the artist UI, the 3D viewer,
OSC routing) reads positions from a `Layout` instead of re-deriving them from
`(numCannons, gridColumns)`. A `Layout` is plain, JSON-serializable data, so the
server resolves it once and broadcasts it to every client.

## Shapes

```ts
import { gridLayout, ringLayout, ringsLayout, annulusLayout, filledRingLayout, resolveLayout, parseLayoutSpec } from '@wavegrid/layout';

gridLayout({ cols: 7, rows: 7 });      // the OG 49-cannon grid
gridLayout({ cols: 7, rows: 2 });      // 7×2
ringLayout({ count: 6 });              // 6 cannons in a circle
filledRingLayout({ count: 25 });       // 25 in a filled disc (grid + circular mask)

// Concentric rings — the general round shape. Radii are relative, 0 is the centre.
ringsLayout({ rings: [{ count: 16, radius: 1 }, { count: 8, radius: 0.6, phase: 22.5 }] });
annulusLayout({ count: 25, innerRadius: 0.5 });  // rings chosen for you, hole in the middle
annulusLayout({ count: 25, innerRadius: 0 });    // symmetric disc (12+8+4+1)

resolveLayout({ preset: 'ring-6' });   // by preset id
resolveLayout({ kind: 'ring', count: 12 });
resolveLayout(parseLayoutSpec('annulus:25@0.5'));  // from user-typed shorthand
```

Fixtures are emitted outermost ring first, each clockwise from 12 o'clock, so
shard slices and light maps stay contiguous per ring.

Each `Fixture` carries `u/v` (normalized), `x/y` (centered), `angle`, `radius`,
`ring`, and grid `row/col` (when the layout has grid coordinates). Patterns and
animations consume these directly, so the same effect runs on a rectangle or a
circle.

## Config + run mode

```ts
import { loadWavegridConfig } from '@wavegrid/layout';

const { config, layout, runMode } = loadWavegridConfig();
// runMode: 'simple' when count < simpleModeMax (default 40), else 'distributed'
```

Config is loaded with [`confstash`](https://www.npmjs.com/package/confstash):
`defaults → project file (wavegrid.config.* / .wavegridrc) → env → overrides`.
