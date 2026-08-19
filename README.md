# Wavegrid

<p align="center" width="100%">
  <img height="250" src="https://raw.githubusercontent.com/constructive-io/constructive/refs/heads/main/assets/outline-logo.svg" />
</p>

<p align="center" width="100%">
  <a href="https://github.com/constructive-io/wavegrid/actions/workflows/ci.yml">
    <img height="20" src="https://github.com/constructive-io/wavegrid/actions/workflows/ci.yml/badge.svg" />
  </a>
</p>

## Overview

**Wavegrid** is a modular, configuration-driven laser controller for arrays of Laser Space Cannons. It includes a grid state server, an artist-facing creative canvas, and OSC output adapters for BEYOND and FB4 hardware.

Layouts are configuration, not code: `grid-7x7`, `grid-7x2`, `ring-6`, `ring-25-hollow`, or any custom shape. Everything — projects, config, secrets, users, state, logs — lives in one centralized store (`~/.wavegrid`), managed entirely through the CLI.

## Running a Show (operators)

```sh
npm i -g @wavegrid/cli

wavegrid projects create ring-demo   # pick a layout preset + run mode; secrets generated once
wavegrid projects users add admin    # UI login (scrypt-hashed, stored centrally)
wavegrid start                       # server + UI + API + WebSocket + receiver, one process, LAN-only

wavegrid doctor                      # diagnose anything — local checks + whole-installation view
```

For a distributed show, run the brain and receivers separately: `wavegrid server` (server + UI + API + WebSocket, no receiver) on the host, and `wavegrid receiver --server ws://<host>:<port> --shard <a-b>` on each receiver laptop.

Bare `wavegrid` (or any command group) opens an interactive menu — every layer prompts. Full operator walkthroughs live in the agent skills (see [Agent Skills](#agent-skills)):

- **Simple show** (one laptop, up to ~40 cannons): [`.agents/skills/wavegrid-simple-show`](.agents/skills/wavegrid-simple-show/SKILL.md)
- **Distributed show** (multiple laptops, sharded receivers): [`.agents/skills/wavegrid-distributed-show`](.agents/skills/wavegrid-distributed-show/SKILL.md)

## Getting Started (contributors)

```sh
pnpm install
pnpm test
pnpm build
```

### Prerequisites

- Node.js 18+
- pnpm

## Packages

| Package | Name | Description |
|---------|------|-------------|
| `packages/server` | `@wavegrid/server` | Grid state engine and master controller UI |
| `packages/ui` | `@wavegrid/ui` | Artist UI — Paint, Gradient, Drops, Motion, Scenes, Animations, Flags, Brightness, Audio |
| `packages/layout` | `@wavegrid/layout` | Layout model — presets, fixture generators (grid/ring/rings/filledRing), config resolution |
| `packages/settings` | `@wavegrid/settings` | Centralized appstash store — projects, secrets, users, state, logs |
| `packages/doctor` | `@wavegrid/doctor` | Diagnostics as data — the checks behind `wavegrid doctor` and the desktop Status screen |
| `packages/cli` | `@wavegrid/cli` | `wavegrid` CLI — projects, settings, start, doctor |
| `packages/receiver` | `@wavegrid/receiver` | Receiver brain — LP filter, sine fallback, pluggable adapter pattern |
| `packages/osc` | `@wavegrid/osc` | OSC output adapters for BEYOND and FB4 laser hardware |
| `packages/webgl` | `@wavegrid/webgl` | Three.js 3D Civic Center viewer — volumetric laser beams, bloom, camera presets |

| Tool | Description |
|------|-------------|
| `tools/traffic` | Passive capture and byte-level analysis of Pangolin BEYOND ⇄ FB4 traffic, on Wireshark's CLI. Run from a terminal — see [tools/traffic/README.md](tools/traffic/README.md). Observation, plus one hand-run experiment (`bin/replay`) that sends BEYOND's own plaintext live-control lines. |

## Architecture

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   UI         │ ──ws──▶ │   Server     │ ──ws──▶ │  Receiver    │
│  (artist UI) │ ◀──ws── │ (state + LP) │         │  (brain)     │
│  :3003       │         │  :3000       │         │  own LP      │
└──────────────┘         └──────────────┘         │  sine fbk    │
                                                    │  → hardware  │
                                                    └──────────────┘
                                                           │
                                                    ┌──────────────┐
                                                    │  @wavegrid/  │
                                                    │  osc         │
                                                    │  → BEYOND    │
                                                    │  → FB4       │
                                                    └──────────────┘
```

- **Server** — grid state engine with exponential low-pass filtering. Scenes, animations, ambient presets, idle timeout. Runs at 60fps, broadcasts only on change. Layout-driven: resolves the active project's layout preset from the store, and serves the UI + API + WebSocket on one port.
- **UI** — a static Vite/React artist-facing creative instrument served by the server on the same origin. Paint, Gradient, Drops, Motion, Scenes, Animations, Flags, Brightness, Audio. iPad-optimized touch UI. Renders whatever layout the server resolves — grids, rings, filled rings.
- **Receiver** — the "brain" that controls physical hardware. Runs its own independent LP filter so output never jolts. On signal loss, smoothly transitions into ambient 3D sine waves. Pluggable input/output adapters.
- **OSC** — output adapters for Pangolin BEYOND and FB4 laser hardware. HSB-to-RGB color conversion, per-cannon routing via JSON config.

## Running (development)

```sh
# Start the stack (each in its own terminal)
pnpm dev:server    # Server at :3000 — also serves the UI + API + WebSocket
pnpm dev:receiver  # Receiver (brain)

# The UI in watch mode (Vite dev server; proxies /api to :3000)
pnpm dev:ui        # http://localhost:3003

# Optional
pnpm dev:webgl     # 3D Civic Center viewer at :3004
```

Operators don't run these — they use `wavegrid start` (see [Running a Show](#running-a-show-operators)).

## Layouts

The physical arrangement is a **layout** stored in the project — never code. Built-in presets: `grid-7x7`, `grid-7x2`, `ring-6`, `nova`, `grace-cathedral` (12 + 12 + centre), `ring-25-filled`, `ring-25-hollow`, `disc-25`. Pick one at `wavegrid projects create`, or change it later:

```sh
wavegrid projects config set layout grid-7x7        # a built-in preset
wavegrid projects config set layout grid:9x4        # cols × rows
wavegrid projects config set layout ring:6          # one ring
wavegrid projects config set layout annulus:25@0.5  # rings with a hole in the middle
wavegrid projects config set layout rings:12,8,4,1  # explicit rings, outermost first
```

Round rigs are concentric rings: one ring is a ring, a ring plus smaller ones inside it is a ring with a hollow centre, and rings all the way in to a centre fixture is a symmetric disc. `annulus` picks the rings for you from a cannon count and the size of the hole (`0` = solid disc).

The server resolves the layout once and broadcasts it; the UI and receiver render from it — no per-process `NUM_CANNONS`/`GRID_COLUMNS` to keep in sync. The project *name* is just a label — the preset controls the shape.

## Sharding

Split the cannons across multiple receiver laptops when hardware limits apply — each receiver drives its shard range, all connecting to the same server, the UI stays unified. `wavegrid doctor` shows shard coverage with gaps/overlaps across the whole installation. See the [distributed show skill](.agents/skills/wavegrid-distributed-show/SKILL.md) for the full multi-laptop walkthrough.

## Data Flow

The UI never sends OSC — only the **Receiver** talks to laser hardware:

```
┌──────────┐   HSB grid (WebSocket)   ┌──────────┐   HSB grid (WebSocket)   ┌──────────┐   OSC/UDP   ┌──────────┐
│    UI    │ ────────────────────────► │  Server  │ ────────────────────────► │ Receiver │ ──────────► │  BEYOND  │
│ (browser)│                           │  :3000   │                           │  (brain) │            │  (laser) │
└──────────┘                           └──────────┘                           └──────────┘            └──────────┘
  Paints colors                     Broadcasts state                     Smooths + converts            Drives
  & scenes                          to all clients                       HSB → RGB/OSC                 hardware
```

- **UI** sends high-level grid state (HSB colors per cell) over WebSocket
- **Server** broadcasts that state to all connected WebSocket clients
- **Receiver** applies LP smoothing, converts HSB to the configured color format, and sends OSC messages over UDP to BEYOND
- The UI has no knowledge of OSC, projectors, or zones

## Deployment

### Local (all-in-one)

For a live event where everything runs on a single machine at the venue, use the CLI (see the [simple show skill](.agents/skills/wavegrid-simple-show/SKILL.md)):

```sh
wavegrid start        # server + receiver, one process; iPads connect to the UI on the LAN
```

### Remote (cloud server + on-site hardware)

When the UI/Server run on a cloud server and the laser hardware is on-site:

```
┌───────────────────────────────────┐              ┌──────────────────────────────┐
│        Cloud Server               │              │       On-Site (Pangolin PC)  │
│                                   │   WebSocket  │                              │
│  Server (:3000)     ◄─────────────┼──────────────┼──  Receiver                  │
│  UI (:3003)                       │              │       │                      │
│                                   │              │       ▼ OSC/UDP (localhost)  │
│  Artists connect via browser      │              │    BEYOND (:8000)            │
└───────────────────────────────────┘              └──────────────────────────────┘
```

**On the cloud server** (e.g. DigitalOcean):

```sh
# Server — grid state engine + UI + API + WebSocket, all on one port
pnpm dev:server
```

Open **http://203.0.113.50:3000** in the browser (replace `203.0.113.50` with your server's public IP). The browser derives its WebSocket URL from the page origin, so there is no UI URL to configure. Ensure port **3000** is open in the firewall.

**On the Pangolin PC** (on-site, Windows — same network as BEYOND):

PowerShell:
```powershell
$env:SIMULATOR_URL = "ws://203.0.113.50:3000"
$env:BEYOND_HOST = "127.0.0.1"
$env:BEYOND_PORT = "8000"
$env:SHARD_START = "0"
$env:SHARD_END = "23"
$env:DEBUG_OSC = "1"
pnpm dev:receiver
```

Bash (Linux/macOS):
```sh
SIMULATOR_URL=ws://203.0.113.50:3000 \
BEYOND_HOST=127.0.0.1 \
BEYOND_PORT=8000 \
SHARD_START=0 \
SHARD_END=23 \
DEBUG_OSC=1 \
pnpm dev:receiver
```

The receiver connects outward to the cloud server and sends OSC locally to BEYOND. `BEYOND_HOST=127.0.0.1` when BEYOND runs on the same machine; use the LAN IP if BEYOND is on a different box.

### Multi-Target Routing (multiple BEYOND machines)

When a single BEYOND PC can't handle all 49 zones, split the grid across multiple machines using a **routing config** JSON file. One receiver dispatches OSC to multiple BEYOND targets over the LAN — no extra Node.js installs needed on the other machines.

```
┌──────────────────────────────┐
│     Receiver (one machine)   │
│                              │
│  reads routing.json          │
│  ┌────────┐   ┌────────┐    │
│  │ grid   │──►│ routed │    │
│  │ state  │   │ output │    │
│  └────────┘   └───┬────┘    │
│                   │         │
└───────────────────┼─────────┘
          ┌─────────┼─────────┐
          ▼                   ▼
  ┌──────────────┐    ┌──────────────┐
  │  BEYOND A    │    │  BEYOND B    │
  │  .1.68:8000  │    │  .1.69:8000  │
  │  zones 0–23  │    │  zones 0–24  │
  └──────────────┘    └──────────────┘
```

Create a `routing.json` file (see `examples/routing-two-beyond.json` for a full 49-cannon example):

```json
{
  "targets": {
    "beyond-a": { "type": "beyond", "host": "192.168.1.68", "port": 8000 },
    "beyond-b": { "type": "beyond", "host": "192.168.1.69", "port": 8000 }
  },
  "flushHz": 30,
  "cannons": [
    { "logical": 0,  "target": "beyond-a", "projectorIndex": 0,  "label": "row0 col0" },
    { "logical": 1,  "target": "beyond-a", "projectorIndex": 1,  "label": "row0 col1" },
    ...
    { "logical": 24, "target": "beyond-b", "projectorIndex": 0,  "label": "row3 col3" },
    { "logical": 25, "target": "beyond-b", "projectorIndex": 1,  "label": "row3 col4" },
    ...
  ]
}
```

Each cannon entry maps a logical grid index to a target and zone index:
- **`logical`** — grid cell index (0–48 for a 7×7 grid)
- **`target`** — name of a target defined in `targets`
- **`projectorIndex`** — the BEYOND zone index on that target (resets to 0 for each target)
- **`label`** — optional human-readable name for debugging
- **`safeDisabled`** — set `true` to disable a cannon in software

Run with:

PowerShell (Windows):
```powershell
$env:ROUTING_CONFIG = "routing.json"
$env:SIMULATOR_URL = "ws://203.0.113.50:3000"
$env:DEBUG_OSC = "1"
pnpm dev:receiver
```

Bash:
```sh
ROUTING_CONFIG=routing.json SIMULATOR_URL=ws://203.0.113.50:3000 DEBUG_OSC=1 pnpm dev:receiver
```

The startup banner will show: `Routed OSC → [beyond-a, beyond-b]`

> **Note:** When using `ROUTING_CONFIG`, do not set `BEYOND_HOST` — they are mutually exclusive.

### BEYOND Color Control

The receiver sends 5 OSC messages per changed cannon: `alpha` (255 = full override) + `red` + `green` + `blue` (0–255) + `Brightness` (0–100). This requires BEYOND's RGBA panel to be enabled: **Settings → Configuration → Live Control → Extra Controls → "Show R-G-B-A panel"**.


### User Authentication

The UI has a login screen backed by the centralized store — users are scrypt-hashed, per project, managed entirely through the CLI:

```sh
wavegrid projects users add admin     # prompts for a password
wavegrid projects users list
wavegrid projects users rm <name>
```

Alongside real accounts there are **access keys** — named passphrases minted at runtime, one per person or one shared with a crowd:

```sh
wavegrid projects keys new dan-ipad        # a personal key
wavegrid projects keys new friday-guests   # a shared "guest passphrase"
wavegrid projects keys ls                  # role, state, last use
wavegrid projects keys disable friday-guests
wavegrid projects keys rm friday-guests    # --all revokes every key
```

The passphrase is generated and printed once (only a salted scrypt hash is stored); re-mint the same name to replace a forgotten one. Keys default to the **operator** role — drive the show, no access management — with `--admin` for a deliberate admin key. Each key is independently enabled, disabled or revoked, and revoking one drops the sessions opened with it. The shared receiver key is unrelated and never grants admin.

When the active project has users or enabled keys, the UI requires login; with none, login is unavailable (503) — add a user or mint a key first. Session tokens are JWTs signed with the project's store-held `jwtSecret` (generated once at project creation; the store is authoritative on both UI and server, so they can never desync).

### Environment Variables Reference

Project config lives in the store (`wavegrid projects config`) — env vars are explicit overrides only. Config hijacking via generic vars is disabled: only namespaced `WAVEGRID_*` values are honored.

| Variable | Default | Description |
|----------|---------|-------------|
| `WAVEGRID_PORT` / `WAVEGRID_HOST` | store value | Server bind override |
| `WAVEGRID_PROJECT` | store active project | Project selection override |
| `APPSTASH_BASE_DIR` | `~/.wavegrid` | Relocate the entire store |
| `WG_RECEIVER_KEY` | store value | Receiver auth key (override to share across laptops) |
| `SIMULATOR_URL` | `ws://localhost:3000` | WebSocket upstream for the receiver |
| `BEYOND_HOST` | — | BEYOND PC IP (enables OSC output) |
| `BEYOND_PORT` | `8000` | BEYOND OSC receive port |
| `BEYOND_GRID_ORDER` | `row` | Grid-to-zone mapping: `row` or `column` |
| `SHARD_START` / `SHARD_END` | — | Cannon index range for this receiver |
| `DEBUG_OSC` | — | Set to `1` to log every OSC message |
| `RECEIVER_ALPHA` | `0.06` | LP filter smoothing factor |
| `FALLBACK_DELAY` | `3000` | Ms before sine fallback on signal loss |
| `FB4_HOST` / `FB4_PORT` | — | FB4 device IP and port (default port 8000) |
| `ROUTING_CONFIG` | — | Path to JSON routing config file |

## Agent Skills

Repository skills in [`.agents/skills/`](.agents/skills/) document the canonical workflows for humans and AI agents:

| Skill | What it covers |
|---|---|
| [`wavegrid-simple-show`](.agents/skills/wavegrid-simple-show/SKILL.md) | The one-laptop golden path: install, create a project, add users, `start`, doctor, troubleshooting |
| [`wavegrid-distributed-show`](.agents/skills/wavegrid-distributed-show/SKILL.md) | Multi-laptop shows: brain + sharded receivers, device identity & discovery, provisioning, export/import, config sync |
| [`testing-wavegrid-command-mode`](.agents/skills/testing-wavegrid-command-mode/SKILL.md) | Testing command-mode changes end-to-end (unit + WS integration) |
| [`wavegrid-js-patterns`](.agents/skills/wavegrid-js-patterns/SKILL.md) | Writing dynamic JS patterns for receivers via `evalPattern` |

The umbrella roadmap (one brain service, device identity/discovery, provisioning, export/import, sync) is tracked in [constructive-planning#1465](https://github.com/constructive-io/constructive-planning/issues/1465).

## Credits

**Built by the [Constructive](https://constructive.io) team — creators of modular Postgres tooling for secure, composable backends. If you like our work, contribute on [GitHub](https://github.com/constructive-io).**
