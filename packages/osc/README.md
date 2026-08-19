# @wavegrid/osc

<p align="center" width="100%">
  <img height="250" src="https://raw.githubusercontent.com/constructive-io/constructive/refs/heads/main/assets/outline-logo.svg" />
</p>

<p align="center" width="100%">
  <a href="https://github.com/constructive-io/wavegrid/actions/workflows/ci.yml">
    <img height="20" src="https://github.com/constructive-io/wavegrid/actions/workflows/ci.yml/badge.svg" />
  </a>
</p>

OSC output adapters for the Wavegrid system. Sends UDP OSC packets to Pangolin BEYOND and FB4 laser hardware.

## Adapters

| Adapter | Target | Addressing |
|---------|--------|-----------|
| `BeyondOscOutput` | BEYOND | `/beyond/projector/{n}/livecontrol/red\|green\|blue\|brightness` |
| `FB4OscOutput` | FB4 | `/FB4-{serial}/color_red\|green\|blue` |
| `RoutedOscOutput` | Mixed | Dispatches per-cannon via JSON routing config |

## Usage

```typescript
import { Receiver, WebSocketInput } from 'wavegrid';
import { BeyondOscOutput } from '@wavegrid/osc';

const receiver = new Receiver({
  input: new WebSocketInput({ url: 'ws://192.168.1.50:3000' }),
  output: new BeyondOscOutput({
    host: '192.168.50.10',
    port: 8000,
    projectorMap: { 0: 0, 1: 1, 2: 2 }
  })
});
receiver.start();
```

### Routed output (multiple targets)

```typescript
import { createRoutedOutput } from '@wavegrid/osc';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('routing.json', 'utf8'));
const output = createRoutedOutput(config);
output.connect();

const receiver = new Receiver({
  input: new WebSocketInput({ url: 'ws://localhost:3000' }),
  output
});
receiver.start();
```

### Routing config format

```json
{
  "targets": {
    "beyond-a": { "type": "beyond", "host": "192.168.50.10", "port": 8000 },
    "fb4-b":    { "type": "fb4",    "host": "192.168.50.20", "port": 8000 }
  },
  "flushHz": 30,
  "cannons": [
    { "logical": 0,  "target": "beyond-a", "projectorIndex": 3 },
    { "logical": 48, "target": "fb4-b",    "fb4Serial": "02356" }
  ]
}
```

Each cannon maps explicitly to a target — no arithmetic assumptions about projector indices or serial numbers.

## Color conversion

The grid uses HSB internally. This package converts to the vendor-specific ranges:

| Target | Color range | Brightness range |
|--------|------------|-----------------|
| BEYOND | RGB 0–255 | 0–100 |
| FB4 | RGB 0–100 | — |

```typescript
import { hsbToRgb255, hsbToRgb100 } from '@wavegrid/osc';

hsbToRgb255(0, 100, 100);  // → { r: 255, g: 0, b: 0 }
hsbToRgb100(0, 100, 100);  // → { r: 100, g: 0, b: 0 }
```
