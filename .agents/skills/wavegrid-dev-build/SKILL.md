---
name: wavegrid-dev-build
description: Build, test, lint and run Wavegrid from a source checkout — monorepo layout, build order, running the CLI from dist, a local show for UI work, and the gotchas that make tests or the UI lie. Use before changing any package, when a test fails only on your machine, or when the UI does not reflect your change.
---

# Wavegrid · Build, test and run from source

## Setup

Node ≥ 18.17 (shows use Node 24 LTS), pnpm 9 (`npm i -g pnpm@9.15.4`).

```sh
pnpm install
pnpm build                       # node deploy/build-all.js — every package, in dependency order
pnpm -r --if-present run lint
HOME=$(mktemp -d) pnpm -r --if-present run test
```

Use the clean `HOME` for the full test run. The CLI's store lives in `~/.wavegrid`. If a local project sets something like `layout interleaved-12x2`, `packages/layout/__tests__/config.test.ts` (which expects the default 7×7) fails even though the code is fine.

One package: `pnpm --filter @wavegrid/<pkg> build` / `test` / `lint`, or `npx jest __tests__/x.test.ts` inside the package.

## Packages

| Package | Role |
|---|---|
| `layout` | Fixture geometry: grids, rings, interleaved cannon/projector rows, presets (`presets.ts`), `LayoutSpec` strings like `interleaved:12x2` |
| `animations` | Built-in animations, shared by the server preview and the receiver |
| `osc` | OSC encoder plus the BEYOND / FB4 adapters and routing (per-fixture `kind`, zones) |
| `server` | The brain: WebSocket relay, state, the pattern engine (`evalPattern` preview), REST API, serves the UI |
| `receiver` | Connects to a brain, computes frames at 60fps, sends OSC. Runs JS patterns in QuickJS |
| `ui` | React artist UI (Vite). Tabs: Paint, Palace (only if the layout has projectors), Pool, Gradient, Grace/GracePaint (only for ring layouts) |
| `cli` | The `wavegrid` command (`projects`, `start`, `server`, `receiver`, `doctor`, `signals`) |
| `desktop` | Electron app; serves `packages/ui/dist` |
| `doctor`, `discovery`, `settings`, `pool`, `webgl`, `debug` | Diagnostics, mDNS, the store, Pool mode, renderers, debug UI |

The server and the desktop serve the **built** UI. After editing `packages/ui`, run `pnpm --filter @wavegrid/ui build` (or `pnpm build`) before checking in a browser, or you will be looking at stale code.

## Run the CLI from source

The npm `@wavegrid/cli` can lag behind main (for example, it may not know the newest layouts). Run the checkout:

```sh
node packages/cli/dist/bin.js <command>     # "wavegrid" below
```

A local show for UI work, with no hardware (the receiver only logs):

```sh
wavegrid projects create dev-test
wavegrid projects use dev-test
wavegrid projects config set layout interleaved-12x2    # or 7x7, rings, …
wavegrid projects users add me --password <pw>          # if the UI asks for a login
wavegrid start                                          # server + UI + receiver on :3000
```

If port 3000 is taken, another wavegrid is probably still running: `ss -ltnp | grep 3000`. Changing the layout of a running project needs a stop and start before the UI shows the new shapes.

To capture the UI, Chrome on the box exposes CDP at `http://localhost:29229`. A short Playwright script (`pip install playwright`, `chromium.connect_over_cdp`) can log in, click tabs by role and name (`get_by_role('button', name='Palace', exact=True)`) and take screenshots.

## Where to read next

- `wavegrid-simple-show` / `wavegrid-distributed-show`: running real shows.
- `wavegrid-cloud-brain`: the brain on a public server (hipzap.com).
- `wavegrid-projectors-beyond`: projector fixtures, BEYOND routing, the Palace tab.
- `wavegrid-js-patterns`: the `evalPattern` ABI (Palace and GracePaint are both patterns).
- `testing-wavegrid-command-mode`, `testing-wavegrid-desktop-gui`: testing recipes.
