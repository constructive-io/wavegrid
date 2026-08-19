# wavegrid

<p align="center" width="100%">
  <img height="250" src="https://raw.githubusercontent.com/constructive-io/constructive/refs/heads/main/assets/outline-logo.svg" />
</p>

<p align="center" width="100%">
  <a href="https://github.com/constructive-io/wavegrid/actions/workflows/ci.yml">
    <img height="20" src="https://github.com/constructive-io/wavegrid/actions/workflows/ci.yml/badge.svg" />
  </a>
</p>

The **brain** of the Wavegrid installation. Sits between the control layer (Canvas/Server) and the physical hardware (BEYOND/OSC via `@wavegrid/osc`).

## Design Principles

1. **Never jolt** — runs its own independent low-pass filter on all incoming state
2. **Always alive** — on signal loss, gracefully falls back to ambient 3D sine wave animations
3. **Pluggable** — input and output are adapters; swap them for any protocol or hardware
4. **Lean** — no hardware dependencies in the core; OSC lives in `@wavegrid/osc`

## Architecture

```
Canvas ──ws──▶ Server ──ws──▶ Receiver ──adapter──▶ Hardware
                                    │
                              own LP filter
                              sine fallback
                              shard support
```

## Usage

```sh
pnpm dev:receiver
# Connects to server at ws://localhost:3000
# Outputs state to console (or hardware when configured)
```

### With OSC hardware (requires `@wavegrid/osc`)

```sh
ROUTING_CONFIG=./routing.json pnpm dev:receiver
BEYOND_HOST=192.168.50.10 pnpm dev:receiver
```

### Programmatic

```typescript
import { Receiver, WebSocketInput, ConsoleOutput } from '@wavegrid/receiver';

const receiver = new Receiver({
  input: new WebSocketInput({ url: 'ws://localhost:3000' }),
  output: new ConsoleOutput(),
  numCannons: 49,
  gridColumns: 7
});
receiver.start();
```

## Configuration

| Env | Default | Description |
|-----|---------|-------------|
| `SIMULATOR_URL` | `ws://localhost:3000` | Upstream WebSocket |
| `RECEIVER_ALPHA` | `0.06` | Low-pass filter smoothing (lower = smoother) |
| `FALLBACK_DELAY` | `3000` | ms before switching to sine fallback |
| `WS_OUTPUT_PORT` | — | Optional WebSocket relay output port |
| `SHARD_START` | — | First cannon index (inclusive) |
| `SHARD_END` | — | Last cannon index (inclusive) |
| `ROUTING_CONFIG` | — | Path to JSON routing config (enables OSC) |
| `BEYOND_HOST` | — | Quick single-target BEYOND OSC host |
| `BEYOND_PORT` | `8000` | BEYOND OSC port |
| `DEBUG_OSC` | — | Set to `1` to log all OSC messages |
| `FB4_HOST` | — | Quick single-target FB4 OSC host |
| `FB4_PORT` | `8000` | FB4 OSC port |

## Built-in Adapters

| Adapter | Direction | Purpose |
|---------|-----------|---------|
| `WebSocketInput` | Input | Connects to upstream server |
| `ConsoleOutput` | Output | Logs frames to console (dev/debug) |
| `CallbackOutput` | Output | Calls your function each tick |
| `MultiOutput` | Output | Fans out to N adapters at once |
| `WebSocketOutput` | Output | Broadcasts to downstream WS clients |
