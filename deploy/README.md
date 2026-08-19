# deploy

<p align="center" width="100%">
  <img height="250" src="https://raw.githubusercontent.com/constructive-io/constructive/refs/heads/main/assets/outline-logo.svg" />
</p>


Run config for the WaveGrid machines. **The cloud server IP is the only
secret** — it lives in `deploy/.env` (gitignored). Everything else here is
committed. Copy the example and fill it in once per machine:

```bash
cp deploy/.env.example deploy/.env   # set CLOUD_IP=…
```

`CLOUD_IP` is the single source of truth — the receiver's `SIMULATOR_URL` is
auto-derived as `ws://CLOUD_IP:SIM_PORT`. The **UI no longer needs a URL**: the
server serves the UI + API + WebSocket on one port (same origin), so the
browser derives its WebSocket URL from the page origin.

> New installs should prefer the CLI (`npm i -g @wavegrid/cli`, then
> `wavegrid server` on the host and `wavegrid receiver` on each laptop). This
> PM2/Traefik stack remains for the existing cloud show.

## Machine 1 — cloud server (Linux, at CLOUD_IP)

Runs the **server** under PM2 (which also serves the UI) so it stays up
unattended.

```bash
deploy/cloud.sh setup     # install pm2 if needed, start both, enable boot persistence
deploy/cloud.sh logs      # tail both
deploy/cloud.sh restart   # after code/.env changes
deploy/cloud.sh status
deploy/cloud.sh stop
```

Process: `wavegrid-server` (`pnpm dev:server`, binds `0.0.0.0:WAVEGRID_PORT`,
serving UI + API + WebSocket on that one port). Auto-restarts on crash. See
`ecosystem.config.js`.

### Quick deploy (after `git pull`)

```bash
pnpm build      # builds all packages, including the UI (Vite → dist/)
pm2 restart all
```

### Manual (mac/linux dev, one terminal)

```bash
source deploy/load-env.sh && pnpm dev:server  # server serves the UI too
```

## Machine 2 — pangolin / receiver (Windows)

Runs the **receiver**, which connects upstream to `ws://CLOUD_IP:SIM_PORT` and
emits OSC to BEYOND. Double-click or run from a terminal:

```bat
deploy\receiver.cmd
```

It loads `deploy\.env`, runs `set` for every `KEY=VALUE`, derives
`SIMULATOR_URL` from `CLOUD_IP`, then starts `pnpm dev:receiver`. To use an
alternate config file: `deploy\receiver.cmd path\to\other.env`.

Configure OSC output in `deploy\.env` — either a single BEYOND target
(`BEYOND_HOST`/`BEYOND_PORT`/`BEYOND_GRID_ORDER`) or a JSON routing file
(`ROUTING_CONFIG=deploy/routing.json`, path relative to repo root).

## Env vars

| var                         | machine | default          | notes                              |
| --------------------------- | ------- | ---------------- | ---------------------------------- |
| `CLOUD_IP`                  | both    | —                | **secret**; server address          |
| `SIM_PORT`                  | both    | `3000`           | server WebSocket port               |
| `WAVEGRID_LAYOUT`           | both    | `grid-7x7`       | preset id; must match server + receiver |
| `SIMULATOR_URL`             | pangolin| `ws://CLOUD_IP:SIM_PORT` | receiver → server (derived) |
| `RECEIVER_ALPHA`            | pangolin| `0.06`           | smoothing                           |
| `FALLBACK_DELAY`            | pangolin| `3000`           | ms before sine fallback             |
| `BEYOND_HOST`/`BEYOND_PORT` | pangolin| — / `8000`       | single BEYOND OSC target            |
| `BEYOND_GRID_ORDER`         | pangolin| `row`            | `row` or `column`                   |
| `ROUTING_CONFIG`            | pangolin| —                | JSON routing file (multi-target)    |
| `DEBUG_OSC`                 | pangolin| —                | set to `1` to log all OSC           |
