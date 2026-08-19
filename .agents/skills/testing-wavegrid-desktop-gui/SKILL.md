---
name: testing-wavegrid-desktop-gui
description: End-to-end GUI testing of the Wavegrid Electron desktop app (routes, Output/OSC debugger, embedded artist UI, full-screen show view) on a headless Linux box with xdotool/scrot. Use when verifying desktop renderer or packages/ui changes at runtime rather than with unit tests.
---

# Testing the Wavegrid desktop app end-to-end (GUI)

## Harness

```sh
cd /home/ubuntu/repos/wavegrid
pnpm install                              # blueprint maintenance already does this
pnpm --filter @wavegrid/ui run build       # ALWAYS rebuild if packages/ui changed;
                                           # the desktop serves packages/ui/dist
ELECTRON_ENABLE_LOGGING=1 DISPLAY=:0 \
  pnpm --filter @wavegrid/desktop start > /tmp/desktop.log 2>&1 &
```

- The CLI runs from built output, not a global binary: `node packages/cli/dist/bin.js …`
  (`projects config`, `signals send|probe|listen`, `doctor`).
- Store lives in `~/.wavegrid`; logs in `~/.wavegrid/logs/<project>/`.
- Set the layout explicitly or you may land in `distributed` run mode (49 cannons):
  `node packages/cli/dist/bin.js projects config set layout nova` (6-cannon ring, simple mode).
- `ELECTRON_ENABLE_LOGGING=1` forwards renderer console to `/tmp/desktop.log`. Expect harmless
  noise: DBus `bus.cc` failures, GPU/Dri3 init errors, Electron CSP warning, and a stale
  `ERR_CONNECTION_REFUSED` for `http://127.0.0.1:3000` logged before the brain starts.

## Window and input

- `wmctrl -l` may be empty (the WM here does not export `_NET_CLIENT_LIST`). Use
  `xdotool search --name "Wavegrid Desktop"` plus `xdotool windowmove/windowsize` instead;
  a ~1600x1120 window keeps all controls on screen.
- Drive the UI with `xdotool mousemove X Y click 1` / `key Escape`, capture with `scrot -o`.
- If a click seems to do nothing, re-screenshot and re-read coordinates before concluding the
  feature is broken — control rows shift as state changes (e.g. OSC Listen/Stop swap position).
  Keyboard focus (`xdotool key Tab … Return`) is a reliable fallback.
- When shelling out to Python/subprocess for screenshots, inherit `os.environ` and set
  `DISPLAY=:0`; a minimal env loses X authorization (`scrot: Can't open X display`).

## App-specific facts

- Sidebar routes: Run = Show, Status; Set up = Layout, Lights, Output; Advanced = Devices,
  People & Keys, Settings. Nova, OSC and Traffic are NOT outer-shell routes: the OSC debugger is
  Output → Advanced, and Nova is a tab inside the embedded artist UI.
- The embedded artist UI is a native Electron `WebContentsView` (not an iframe), auto-signed-in via
  an operator token — no manual login. Because it is native, its pixels are outside the renderer
  DOM: verify it with screenshots, never with DOM queries.
- Full-screen show view: renderer renders `fixed inset-0` and re-reports slot bounds via
  `window.wavegridLaser.sync`. Exit paths to test separately: the button, Escape in the renderer,
  and Escape while focus is *inside* the embedded contents (forwarded by a `before-input-event`
  handler as `laser:escape`) — click inside the grid first to move focus there.
- There is no user-reachable way to stop the show while full screen (no custom menu/global
  shortcut, Show controls are unmounted). Report that as untested, not as a pass.
- OSC debugger: probing with nothing bound to the port honestly reports "nothing listening"; start
  `node packages/cli/dist/bin.js signals listen --port 8010` to see the verdict flip. Verify a real
  UDP bind with `ss -uln | grep 8010` before/after the panel's Listen/Stop.
- Artist UI panel layout persists in localStorage `wavegrid-panel-layout`; a stop+start of the show
  reloads the embedded contents and is the easiest user-reachable "reload" for the persistence test.

## Measuring animation instead of guessing

Frame-diff two screenshots ~0.5s apart over the grid region and compare the mean absolute
difference; use it to prove an animation is running, that Speed changed the rate, and that a look
survives a soak. A still frame (diff ≈ 0) means the animation stopped.

## Known interaction caveats (may still be present)

- Master `Bright` may appear not to dim the grid while a Nova pattern is running — the pattern
  re-asserts per-cannon brightness each frame. Test Bright in Paint mode (paint the grid, then drag
  Bright 100 → 0) to isolate the control.
- The top-bar Speed slider is logarithmic; its displayed minimum has been observed as `0.001x`
  even though `SPEED_MIN = 0.01` in `packages/ui/src/app.tsx`. Re-check the formatting/rounding
  before reporting the range as in-spec.

## Devin Secrets Needed

None — everything runs locally with no external credentials.
