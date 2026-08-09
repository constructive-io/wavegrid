# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.5.0](https://github.com/constructive-io/wavegrid/compare/@wavegrid/cli@1.4.0...@wavegrid/cli@1.5.0) (2026-08-09)

### Features

- **access,desktop:** named access keys + two-column lights debugger ([933e088](https://github.com/constructive-io/wavegrid/commit/933e0880f6eeebf824727a8ba33cecd6be1ff8cf))
- **access:** shared guest passphrase — one low-privilege operator to hand out ([70cec2d](https://github.com/constructive-io/wavegrid/commit/70cec2d394e15a5ba190098e6053c0027e21f2d7))
- **cli:** interactive OSC target setup wizard (projects osc) ([5cf8232](https://github.com/constructive-io/wavegrid/commit/5cf82322346e1d9cbf8fd76f151aae5e5d0f31c6))
- **desktop,doctor:** live Status dashboard + receiver controls ([6ff6e4a](https://github.com/constructive-io/wavegrid/commit/6ff6e4af8e5227c4c19befeb38ca6f47a178a3e9))
- **devices:** authenticated self-registration + user-named device registry ([1b261ba](https://github.com/constructive-io/wavegrid/commit/1b261bafa833a2e3afbd4d7eff7f28071d877e2d))
- **devices:** operator-assigned shards (wavegrid devices assign) + receiver auto-pickup ([7a7b16b](https://github.com/constructive-io/wavegrid/commit/7a7b16b14c6662c0f5d92b2793e8d1ebcff3f156))
- **discovery:** machine-local device identity + mDNS brain discovery ([b15fded](https://github.com/constructive-io/wavegrid/commit/b15fdedf1725b8c18ed5334277f0ea978ec608c0))
- **projects:** portable export/import (config + devices + users; identity/IPs never travel) ([1f82d7a](https://github.com/constructive-io/wavegrid/commit/1f82d7a51b924f6e64228a4db23e8194155022ae))
- **routing:** one unified routing spec, per-device configs generated from it ([7399ef9](https://github.com/constructive-io/wavegrid/commit/7399ef9e0e08a999c68ee5b8ce261f9beb60cb4d))
- **settings,cli,desktop:** clear all — wipe the store behind a typed confirm ([c057b65](https://github.com/constructive-io/wavegrid/commit/c057b65b81dc0645ca8a626244aff6d2df82e620))
- **sync:** per-project sync.enabled toggle + secrets gate ([81e3225](https://github.com/constructive-io/wavegrid/commit/81e32256dbc3fac71546dd45a3cd05cfbf12b113))
- **sync:** revisioned server-mediated config sync + replication (Phase D) ([cbe43c0](https://github.com/constructive-io/wavegrid/commit/cbe43c0b522ceb7bf1d92ed5513043b20a32a5f3))
- **sync:** server-less coordinator election + sync_merge re-home ([8215bbb](https://github.com/constructive-io/wavegrid/commit/8215bbb64f2ef38491e87d6bf7ab1f88313499ec))

# [1.4.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/cli@1.3.0...@wavegrid/cli@1.4.0) (2026-08-06)

### Bug Fixes

- **ui:** fixed 7x7 dot size for all layouts + store-authoritative JWT secret ([30d6120](https://github.com/constructive-io/Illuminate/commit/30d61206ed24bbaf055cc4e306114507b77c3dd1))

### Features

- **ui,server:** unified brain — Vite SPA served by the server + server/receiver commands ([3fb1f19](https://github.com/constructive-io/Illuminate/commit/3fb1f19843881e8fa6b18cf5f9687b61f3d454f2))

# [1.3.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/cli@1.2.0...@wavegrid/cli@1.3.0) (2026-08-06)

### Features

- **cli:** group project commands under `projects`, add global `settings` ([089cf48](https://github.com/constructive-io/Illuminate/commit/089cf483e8672cb46287d4eaa6d770a3d36badd3))

# [1.2.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/cli@1.1.0...@wavegrid/cli@1.2.0) (2026-08-05)

### Features

- **cli:** interactive menus + graceful prompts across every command ([0735fe6](https://github.com/constructive-io/Illuminate/commit/0735fe6e292c6018b03d7d60153fcccc2a62f4d8))
- **cli:** interactive subcommand menu for bare `users`/`secrets` ([2488745](https://github.com/constructive-io/Illuminate/commit/2488745fbcea96e7f9e4ddb7ba5f139b1e9b1026))

# [1.1.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/cli@1.0.0...@wavegrid/cli@1.1.0) (2026-08-05)

### Features

- **cli:** wavegrid config set — change layout/port/mode after init ([d3a4832](https://github.com/constructive-io/Illuminate/commit/d3a4832fd1aa1b4e3347a8063429619abe1d2ff0))

# [1.0.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/cli@0.4.0...@wavegrid/cli@1.0.0) (2026-08-05)

**Note:** Version bump only for package @wavegrid/cli

# [0.4.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/cli@0.3.0...@wavegrid/cli@0.4.0) (2026-08-05)

### Features

- **cli:** drop the local wavegrid.json option from init (store-only) ([d337114](https://github.com/constructive-io/Illuminate/commit/d337114161ab4608bb5dbad13303a5b791eef6ab))
- **cli:** wavegrid doctor — local + whole-installation diagnostics ([623fafd](https://github.com/constructive-io/Illuminate/commit/623fafda6c76d45a3cd8a058ccda4860eae06903))

# [0.3.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/cli@0.2.0...@wavegrid/cli@0.3.0) (2026-08-05)

### Features

- **settings:** centralize projects, secrets, users & config in an appstash store ([c37f8c4](https://github.com/constructive-io/Illuminate/commit/c37f8c4ec076d7a25b7ebb320e1154350273f36c))

# 0.2.0 (2026-08-05)

### Features

- **cli:** run server+receiver in-process; embed as deps (no pnpm/workspace) ([c4670f0](https://github.com/constructive-io/Illuminate/commit/c4670f01e0445cc9e840ee2c9868cf9f81a06e71))
- config-driven layouts (grids/rings/filled rings) + wavegrid CLI ([94313a9](https://github.com/constructive-io/Illuminate/commit/94313a9910431d1a1d584069f4c4354450059363))
