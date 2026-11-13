---
name: wavegrid-projectors-beyond
description: Drive Pangolin BEYOND projector lasers (e.g. Nu-Salt NSL-2000 Model Z with FB4-XE) alongside cannons — fixture kind, the interleaved cannon/projector layout, BEYOND OSC live control, the routing file and zone base, the Windows receiver from source, the Palace tab, the dormant projector API, and Class IV safety. Use when setting up, debugging or extending a rig that has projectors.
---

# Wavegrid · Projector lasers through BEYOND

## Model

Each fixture has `kind: 'cannon' | 'projector'` (`packages/layout/src/types.ts`; it defaults to `cannon`, so older layouts are unchanged). Projectors take the same HSB as cannons: Paint, Pool, Gradient, scenes and patterns all just work. Wavegrid only recolours and dims **whatever cue BEYOND is playing** on the projector's zone.

```
receiver ──OSC/UDP :8000──▶ BEYOND ──TCP 3348──▶ FB4-XE ──▶ laser
```

- Per zone: `/beyond/zone/{n}/livecontrol/{alpha,red,green,blue}` (0–255) and `/beyond/zone/{n}/livecontrol/Brightness` (0–100). The encoder is `packages/osc/src/osc-adapters.ts`.
- Never talk to the FB4s directly, and never replay TCP 3348. `fb4` OSC targets write persistent colour balance, and the routing validator refuses projectors on them.
- Projector zones need a scanned cue running (a shape or image). Cannon zones run their static-beam cues.

## Layout

`interleaved-12x2` (`interleavedLayout` in `packages/layout/src/generators.ts`): row 0 is 12 cannons, row 1 is 12 projectors shifted half a column right (a zipper), so a finger can zigzag through all 24. Logical order is cannons 0–11, then projectors 12–23. Any size works as `interleaved:<cols>x<rows>`. The options are `stagger` (0 ≤ s < 1, default 0.5) and `first` (`cannon`/`projector`). The UI draws cannons as circles and projectors as squares, and the canvas follows the layout's aspect ratio.

## Routing

`examples/routing-interleaved-12x2.json` is one `beyond` target on `127.0.0.1:8000` (BEYOND is on the receiver PC), `zoneBase: 0`, and 24 routes labelled C1–C12 / P1–P12 with their `kind`.

```sh
wavegrid projects routing import examples/routing-interleaved-12x2.json
wavegrid projects routing show
```

- **Use routing only.** Do not also set `projects osc beyond …`. With both set, the receiver sends every zone twice.
- **Zone base / order:** use `wavegrid signals probe --zones 0-23` (or `signals send /beyond/zone/0/livecontrol/…`) with BEYOND's RGBA panel open, and watch which head lights. If BEYOND is 1-based, set `"zoneBase": 1` and re-import. To pin a zone that can't be renumbered, add `"projectorIndex": <zone>` on that route and import with `--keep-zones`. The desktop app's Lights page can also remap logical → physical.
- No BEYOND to hand: `wavegrid signals listen --port 8000`, then paint, and the addresses are printed.

## BEYOND settings (back up the operator's workspace first)

- `BEYOND.ini`: `[OSC] PortIn=8000` and `[Settings] ShowRGBAPanel=1`, then restart BEYOND. **The RGBA panel must stay open**, or BEYOND ignores livecontrol colour.
- One projection zone per fixture, each with a cue running.
- It must be BEYOND, not QuickShow (QuickShow has no OSC server to drive).
- `wavegrid doctor` checks the OSC port and RGBA panel in BEYOND.ini against the receiver's target.

## Windows receiver from source

Node 24 LTS, Git, `npm i -g pnpm@9.15.4`. Then:

```bat
git clone https://github.com/constructive-io/wavegrid.git C:\wavegrid
cd C:\wavegrid && pnpm install && pnpm build
node packages\cli\dist\bin.js projects import <project>.wgproj --activate
node packages\cli\dist\bin.js projects config set receiver.server wss://hipzap.com
node packages\cli\dist\bin.js projects routing import examples\routing-interleaved-12x2.json
node packages\cli\dist\bin.js doctor
node packages\cli\dist\bin.js receiver
```

To update, run `git pull && pnpm install && pnpm build` at the **same commit as the brain**, then restart the receiver. Re-import routing if `examples/routing-*.json` changed. See `wavegrid-cloud-brain` for the brain side.

## Palace tab

It appears automatically when the layout has any projector (`tabsFor` in `packages/ui/src/app.tsx`). It sets colour and brightness only. It is one `evalPattern` (`palacePattern(fixtures)` in `packages/ui/src/lib/palace.ts`) with the geometry baked in (`X`, `RANK`, `PROJ`). Its parameters are `stops, flow, span, spin, anim, who, level, cannon, projector, paint`, and the UI (`use-palace.ts`, `palace-tab.tsx`) only ever sends `setPatternParam` while it runs.

- Scenes, colour flows and motions are data tables in `palace.ts`. Add one there and the tests in `packages/ui/__tests__/palace.test.ts` cover it: every motion × `who` must stay finite and within 0–100.
- Painting a fixture in Palace sets `paint[i]`, and the motion keeps running. A stroke in the plain Paint tab stops the pattern on the brain and the receivers.
- A receiver that reconnects mid-pattern is sent the running code and params. A receiver given an `evalPattern` with identical code **and** params applies the params without resetting its clock.

## Dormant projector API (no UI yet)

These are the server messages `{"type":"projector", "indices":[…], "control":{size, posx, rotoz, anispeed, fx, …}}` and `{"type":"projector_cue", "command":{cueDown|stopZone|stopAllNow}}`, documented in `docs/command-api.md`. They reach only `kind: 'projector'` routes on BEYOND targets. Keep them out of artist tabs unless asked; a future dedicated Projectors UI is planned in constructive-planning.

## Safety (Class IV)

- The venue/Nu-Salt operator holds emission: interlock, E-stop in reach, beam termination, approved zones.
- The first run of any change is done with BEYOND **laser output disabled**, checked in BEYOND's preview only.
- Wavegrid deliberately does not expose Enable/DisableLaserOutput or BlackOut. Do not add them.
