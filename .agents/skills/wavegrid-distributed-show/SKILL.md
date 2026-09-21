---
name: wavegrid-distributed-show
description: Run a Wavegrid installation across multiple laptops — one brain (server + UI) plus shard-aware receiver machines. Covers device identity, mDNS discovery, self-registration, naming devices, provisioning new laptops, project export/import, config sync, and doctor diagnostics. Use for multi-machine shows (typically 40+ cannons or hardware split across machines).
---

# Wavegrid · Distributed Show (multiple laptops)

## Overview

The distributed case: one laptop is the **brain** (server + UI + API + WebSocket, one port) and N laptops are **receivers**, each driving its shard of the cannons. Nobody runs `start` here — `start` is the fused single-laptop convenience. Distributed shows run the two halves explicitly.

Core rules that make this sane:

- **Projects are portable; devices are not.** A project export carries config, layout, secrets, and users — never device identity. Every machine keeps its own locally-generated identity (`~/.wavegrid/device.json`: uuid + friendly name) and **registers itself with its own IP** when it joins, so imports can never confuse two machines.
- **Every device carries the whole project** — including the device-scoped configs of *all* other devices (shards, light-maps, OSC targets). Any laptop can view or edit any device's config; sync brings everyone to the same complete picture.
- **The server is the sync authority when present.** Edits push to the server, which bumps the project revision and broadcasts; peers pull. **When no `wavegrid server` is on the LAN, the receivers hold a quick election — "someone is always the brain" — and the winner self-promotes to a transient brain the others home to.** When a dedicated server later appears, the transient brain hands its edits over (`sync_merge`) and everyone re-homes. Highest rev wins; `doctor` flags divergence — never a silent merge.

> **Implementation status:** this skill documents the target model from
> [constructive-planning#1465](https://github.com/constructive-io/constructive-planning/issues/1465).
> Shipped: unified brain (`wavegrid server` / `wavegrid receiver`), mDNS discovery, machine-local device identity + per-project registry/naming (`wavegrid projects devices`), portable `projects export/import`, revisioned server-mediated config sync, and the `doctor` system view (coverage + sync divergence).

## The flow

**Host laptop (the brain + the screen):**
```sh
wavegrid projects use bigshow
wavegrid server            # server + UI + WS + API on one port
                           # prints every LAN address it's bound on:
                           #   → ws://192.168.1.42:3333
                           # advertises _wavegrid._tcp via mDNS
```
Operators/iPads open `http://<host-ip>:<port>` and paint. The brain drives no cannons itself.

**Each receiver laptop:**
```sh
wavegrid projects import show.wgproj   # if the project isn't on this machine yet
wavegrid receiver                      # discovers the server via mDNS, connects,
                                       # authenticates with the project receiverKey,
                                       # self-registers (deviceId, name, IP, shard)
```
A bare `wavegrid receiver` also picks up the shard the operator assigned this laptop (`wavegrid devices assign`, below) — no `--shard` needed. Explicit override for multicast-blocked networks: `wavegrid receiver --server ws://192.168.1.42:3333 --shard 0-24` (an explicit `--shard` wins over the assigned one).

### Desktop app as a receiver (Join a brain)

On a receiver laptop, open Devices → Join a brain, paste the brain's `ws://`
or `wss://` URL (or use one found by scanning), choose Save, and then Start.
The CLI equivalent is `wavegrid projects config set receiver.server
wss://grace.hipzap.com` followed by `wavegrid receiver`; the `--server` flag
still overrides it. The receiver key must match the brain's project:
`wavegrid projects export --include-secrets` on the brain and import the bundle
(or use Desktop Projects → Export/Import), or run `wavegrid projects secrets set
receiverKey`. Clearing `receiver.server` returns to local-brain mode. Importing
without secrets means the embedded artist UI shows the brain's login screen
(the desktop signs it in with the project's `jwtSecret`); import with
`--include-secrets` to avoid it.

**At showtime:** operator paints → UI → server `broadcastCommand()` → every receiver filters to its shard → OSC to its hardware.

## Devices: identity, naming, management

Each machine generates `~/.wavegrid/device.json` once (uuid + hostname-derived name). Users name the devices that are part of a project — "device one", "stage left" — at first join (graceful prompt) or later:

```sh
wavegrid devices list                    # name, id, IP, shard, version, online/offline
wavegrid devices rename <device> "stage left"
wavegrid devices assign <device> 0-24            # persist shard in the project (also: --shard 0-24, or `all` to clear)
wavegrid devices forget <device>
```

The registry lives in project state on the server and survives restarts. Never copy `device.json` between machines.

## Routing: author once globally, generate per laptop

Never hand-write a routing file per machine — that's how zones drift. The project holds **one unified spec** (`osc.routing`) in global logical order: the OSC targets, which target each global cannon belongs to, and an explicit BEYOND `zoneBase` (0 or 1). Every laptop's file is generated from it, re-basing *both* index spaces at once: the shard slice makes grid indices local (`logical = global − shard.start`, so laptop B's cannons start at 0 again) and `projectorIndex` restarts at `zoneBase` per target. Generated cannons keep `globalLogical` plus a `generated` block, so a device file is always distinguishable from the spec.

```sh
wavegrid projects routing import routing.json   # adopt a global file; zones regenerated
wavegrid projects routing import r.json --keep-zones   # pin zones for a rig that can't be renumbered
wavegrid projects routing show                  # spec + what each device gets (global slice → local → zones)
wavegrid projects routing generate              # write every device's file (--device <name> for one)
```

`wavegrid receiver` regenerates *this* laptop's file into project state on start and points `ROUTING_CONFIG` at it, so nothing is copied between machines and an explicit `ROUTING_CONFIG` still wins. Generation refuses rather than emitting a config that would light the wrong fixture: overlapping shards, a fixture nobody drives, a duplicate global index or pinned zone, an unknown target, an FB4 cannon with no serial — and a device-local file fed back in as if it were global (the classic double-rebase). If the spec is invalid at receiver start, OSC output stays off and the reason is printed; fix it with `routing show`.

A single-laptop show needs none of this: no shard, zones `0…N-1`, and `wavegrid projects osc` points straight at BEYOND or FB4.

## Provisioning a new laptop

```sh
npm i -g @wavegrid/cli
wavegrid projects import show.wgproj   # config + layout + secrets + users — no device identity
wavegrid receiver                      # discovers, joins, self-registers with its own IP
```
Zero hand-typed IPs, zero copied identity. Create the bundle on any existing machine: `wavegrid projects export bigshow --file show.wgproj` (add `--no-secrets` to move secrets out-of-band).

## Config sync

Each config entry is versioned by a monotonic project **revision** (plus `updatedAt` + editing `deviceId`). Editing any config — including another device's light-map or shard — propagates over the already-authenticated WS: a client sends `sync_push {scope, config, baseRevision}` → the server serializes the write, assigns the next revision, persists it, and broadcasts `sync_update` to every client; a joining/reconnecting client sends `sync_request` and gets the full `sync_state` snapshot, then `sync_ack`s what it applied. Scrambled a lighting config five minutes before doors? Fix it on whichever laptop is closest; every machine converges.

**Conflict policy (deterministic, never a silent merge):** the server assigns strictly increasing revisions, so the highest revision wins (last-writer-wins); offline peer-merge ties break by timestamp, then `deviceId`. A client that edited from a stale base revision is still accepted but flagged — `wavegrid doctor` surfaces the current revision and any device whose acknowledged revision lags, so divergence is visible, not hidden. **Simple one-device projects pay nothing:** there's one entry and one ack, and none of this surfaces until a second device joins. Secrets never ride config sync — they move only via explicit `--include-secrets` export bundles.

**Toggle (`sync.enabled`, default on).** Replication is on by default. To pin a project's edits local to each device — e.g. deliberately diverging one laptop for a soundcheck — turn it off: `wavegrid config set sync false` (`WG_SYNC_ENABLED=0` also works for a one-off run). With sync off the server drops any `sync_push` (no revision bump, no broadcast) and `wavegrid doctor` prints `Config sync … disabled`. Re-enable with `wavegrid config set sync true`. The secrets gate (`WG_SYNC_SECRETS=1`) is a separate, off-by-default escape hatch for the rare case where a secret scope must replicate; leave it off — secrets normally travel only via export bundles.

## Verifying the installation

```sh
wavegrid doctor
```
The system view shows: server version/layout/port/uptime, every connected device (name, IP, shard, version), **shard coverage with gaps/overlaps** (e.g. "cannons 25–49 unclaimed"), layout/version skew between machines, LAN discovery results, and sync divergence. Run it on the host before doors open — coverage must show no gaps.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Receiver can't find the server | Multicast blocked on the venue Wi-Fi → `--server ws://<host-ip>:<port>` (the server banner prints its addresses). |
| Receiver connects then rejects | `receiverKey` mismatch — the laptop's project is stale. Re-import the bundle or sync. |
| Coverage gap in doctor | A laptop's shard assignment is wrong/missing → `wavegrid devices assign`. |
| Two machines fight over the same cannons | Overlapping shards — doctor flags the overlap; fix assignments. |
| Layout/version skew warning | One laptop has an old project or CLI version → sync/import, `npm i -g @wavegrid/cli`. |
| Same device listed twice | `device.json` was copied between machines. Delete it on the clone; it regenerates and re-registers. |

## Devin Secrets Needed

None — the shared `receiverKey` travels inside project export bundles, generated at project creation.
