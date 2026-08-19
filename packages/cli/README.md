# @wavegrid/cli

<p align="center" width="100%">
  <img height="250" src="https://raw.githubusercontent.com/constructive-io/constructive/refs/heads/main/assets/outline-logo.svg" />
</p>


The `wavegrid` command-line tool — create a laser installation as a **project**
in a centralized store, and run it (server + receiver, in-process) from a single
command. New physical arrangements are pure configuration: no shape-specific
code. The CLI bakes in the server and receiver as dependencies, so a fresh
`npm i -g @wavegrid/cli` is all an operator needs — no monorepo checkout, no pnpm.

Projects, secrets, users, runtime state, and logs live in a per-user store at
`~/.wavegrid` (via [`appstash`](https://www.npmjs.com/package/appstash)). Set
`APPSTASH_BASE_DIR` to relocate the whole store; the config layer resolves the
same way, so the store and config never diverge.

## Install

```bash
npm i -g @wavegrid/cli
wavegrid projects create      # create a project + generate its secrets
wavegrid projects users add   # add a UI login (prompted)
wavegrid start                # run server + receiver
```

Run any command group bare (`wavegrid`, `wavegrid projects`, `wavegrid settings`,
`wavegrid projects users`, …) and it prompts an interactive menu of what you can
do next; stop short of any required argument and it prompts for that too. With no
TTY it prints usage instead of hanging.

## Commands

Project management and everything that edits a project live under `projects`;
global store setup lives under `settings`; `start` and `doctor` are top-level.

| Command | Purpose |
| --- | --- |
| `wavegrid projects list` | List projects, marking the active one. |
| `wavegrid projects create [name]` | Create a project in the store; **generates secrets once**; optionally add a first user. |
| `wavegrid projects use <name>` | Set the active project (alias: `set`). |
| `wavegrid projects config` | Print the resolved config + provenance (secret values masked). |
| `wavegrid projects config set <k> <v>` | Update a project config field without re-creating it or editing JSON. Keys: `layout`/`preset` (a built-in preset id), `mode` (`auto`/`simple`/`distributed`), `port`, `host`, `ui-port`. |
| `wavegrid projects secrets list` | List required secrets and whether each is set (never values). |
| `wavegrid projects secrets init` | Generate any missing secrets (`--force` rotates). |
| `wavegrid projects users list` | List UI usernames. |
| `wavegrid projects users add [name]` | Add/replace a UI login user (password hashed). |
| `wavegrid projects users rm <name>` | Remove a UI login user. |
| `wavegrid projects keys ls` | List named access keys with role, state and last use. |
| `wavegrid projects keys new <name>` | Mint an access key (passphrase printed once); `--admin` for an admin key. |
| `wavegrid projects keys enable\|disable <name>` | Turn one key's logins on/off, keeping its passphrase. |
| `wavegrid projects keys rm <name>` | Revoke one key (`--all` revokes every key). |
| `wavegrid projects routing show` | The project's unified routing spec, plus what each registered device would be given (global slice → local re-base → zones). |
| `wavegrid projects routing import <file>` | Adopt a global routing JSON as the unified spec. Zone numbers are regenerated per device unless `--keep-zones` pins them as installed. |
| `wavegrid projects routing generate` | Write the per-device routing files (`--device <name>` for one, `--out <dir>` to place them). Refuses on shard gaps/overlaps. |
| `wavegrid projects routing clear` | Forget the unified spec. |
| `wavegrid projects env export` | Write a `.env` for the current project (`--file` to override). |
| `wavegrid settings environment` | Show the store location + environment (paths, active project, base override). |
| `wavegrid settings initialize` | Create/ensure the global store scaffold. |
| `wavegrid settings clear` | Clear all — wipe every project, secret, user, access key, session, device record, light map and log. Asks you to type `clear all`; `--yes` for scripts, `--keep-device` to keep this machine's identity. Irreversible: secrets are generated once and cannot be recovered. |
| `wavegrid start` | Load the active project and run server + receiver in-process. |
| `wavegrid doctor` | Diagnose this laptop (env hijacks, ports, secrets, users, shard) and — if a server is reachable — the whole installation: connected receivers + shard coverage (gaps/overlaps). `--json` for scripting, `--server ws://host:port` to point at a remote server. |

`init`, `config`, `secrets`, `users`, `keys`, and `env` remain as top-level shortcut
aliases for the `projects …` forms. Every command acts on the active project
unless you pass `--project <name>` (or set `WAVEGRID_PROJECT`).

### Secrets & setup are explicit and one-time

Secrets (`jwtSecret`, `receiverKey`) are generated **only** during `wavegrid init`
/ `wavegrid secrets init`, stored `0600` in the project. Runtime never invents or
defaults a secret: `wavegrid start` and the UI fail with an actionable error if a
required secret is missing. Re-running `init`/`secrets init` preserves existing
values unless `--force` is given.

### `wavegrid start`

Runs the server and receiver together in a single Node process. In **simple**
mode (auto-selected when the cannon count is under the single-laptop threshold)
this is the whole installation on one machine — LAN-only, no internet required.
In **distributed** mode it runs the same pair but the receiver shards via the
project's `receiver.shard` (`SHARD_START` / `SHARD_END`). The artist UI is a
separate app that reads the same store; it is not launched here.

### Multi-laptop routing is generated, not hand-written

A show with more than one machine keeps **one** spec — every cannon in global
logical order, with an explicit BEYOND zone base. Each laptop's routing file is
derived from it: the shard slice re-bases grid indices to 0 for that machine, and
zones restart per machine too. `wavegrid receiver` regenerates this laptop's file
into the project state dir on start, so no config is ever copied between
machines, and a config that would light the wrong fixture (shard gap or overlap,
duplicate zone, or a device-local file fed back in as global) is refused rather
than emitted. See [`docs/light-indexing.md`](../../docs/light-indexing.md).

A one-laptop show skips all of it — `wavegrid projects osc` points straight at
BEYOND or FB4.

### `wavegrid signals` — debugging what reaches Pangolin

The show sends a whole grid 30 times a second, which is the wrong instrument for
"did BEYOND get anything at all?" and "which zone is fixture 7?". These send by
hand, over the project's configured OSC target (or `--host` / `--port`):

```sh
wavegrid signals send /beyond/zone/0/livecontrol/red 255   # one message
wavegrid signals probe --zones 0-11 --hold 500             # light one zone at a time
wavegrid signals listen --port 8000                        # print what arrives
```

`send` arguments are floats unless tagged (`i:3` integer, `s:text` string), since
an int where the receiver expects a float tends to be dropped silently. `probe`
uses the same encoders as the show and blacks out when it finishes; `listen`
binds a port, so pointing the show at `--host 127.0.0.1 --port <n>` shows the
exact stream the hardware would receive.

For BEYOND to act on any of it, its OSC server must be enabled (BEYOND's
settings — `[OSC] PortIn` in BEYOND.ini is the value it actually binds; `projects
osc` defaults to 8000, BEYOND's factory port) and the zone has to be under live
control.

This is aimed output on a configured target, unrelated to
[`tools/traffic`](../../tools/traffic), which observes BEYOND ⇄ FB4 traffic and
transmits nothing except its `bin/replay` experiment, run by hand.

### `wavegrid config` (or `wavegrid --print-config`)

Resolves the configuration and prints it with per-key provenance so it is obvious
which layer supplied each value (defaults → store → file → env → flags), plus a
set/unset status for each required secret. Secret values are never printed.

## Configuration

Configuration is discovered by [`confstash`](https://www.npmjs.com/package/confstash)
via walk-up search (`wavegrid.json`, `.wavegridrc`, `package.json` keys,
…) and layered with environment variables:

| Variable | Maps to |
| --- | --- |
| `WAVEGRID_LAYOUT` | `layout.preset` |
| `WAVEGRID_MODE` | `mode` (`auto` \| `simple` \| `distributed`) |
| `WAVEGRID_SIMPLE_MAX` | `simpleModeMax` |
| `PORT` / `SIM_PORT` | `server.port` |
| `HOST` | `server.host` |
| `UI_PORT` | `ui.port` |

### Example `wavegrid.json`

```json
{
  "layout": { "preset": "ring-6" },
  "mode": "auto",
  "simpleModeMax": 40,
  "server": { "host": "0.0.0.0", "port": 3000 },
  "ui": { "port": 3003 }
}
```

Built-in presets: `grid-7x7`, `grid-7x2`, `ring-6`, `nova`, `grace-cathedral`, `ring-25-filled`, `ring-25-hollow`, `disc-25`.

`layout` also takes shorthand for a custom shape, so a project can map its own rig without editing JSON:

```sh
wavegrid projects config set layout grid:9x4        # cols × rows
wavegrid projects config set layout ring:6          # one ring
wavegrid projects config set layout annulus:25@0.5  # concentric rings, hole in the middle (0 = solid disc)
wavegrid projects config set layout rings:12,8,4,1  # explicit rings, outermost first
```
