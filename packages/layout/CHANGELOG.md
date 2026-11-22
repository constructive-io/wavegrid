# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.4.0](https://github.com/constructive-io/wavegrid/compare/@wavegrid/layout@1.3.0...@wavegrid/layout@1.4.0) (2026-11-22)

### Bug Fixes

- **layout:** reject empty perimeters and non-integer grid coordinates in fixtures layouts ([c7a2b5a](https://github.com/constructive-io/wavegrid/commit/c7a2b5aa184121c4dd8c984183cd65d28b9f2834))
- **settings,layout:** import keeps the local OSC target; inline layouts export as JSON, not the default preset ([a5320f0](https://github.com/constructive-io/wavegrid/commit/a5320f0230fc78652082604d2f6c111fd21aa1ce))

### Features

- .wavegrid project files kept outside the repo, plus explicit fixture layouts ([f4b2146](https://github.com/constructive-io/wavegrid/commit/f4b2146d7b6cdc2088880a69c36a76dd341ecd2a))
- **desktop:** Join a brain receiver-only mode ([ea220a0](https://github.com/constructive-io/wavegrid/commit/ea220a0f66ed0f5fcb75489614b5219a677980d8))
- **layout:** grace-28 preset — 12 + 12 + inner ring of 4 ([c46959e](https://github.com/constructive-io/wavegrid/commit/c46959eed46c3f5a35cbd285dc66818c6fdc6e09))
- projector fixture kind, interleaved 12x2 layout, dormant projector control API ([871c274](https://github.com/constructive-io/wavegrid/commit/871c27409896dfcfbfb5aaf0595ad5cd2278f77d))

# [1.3.0](https://github.com/constructive-io/wavegrid/compare/@wavegrid/layout@1.2.0...@wavegrid/layout@1.3.0) (2026-09-17)

### Bug Fixes

- **desktop:** give the show's receiver the selected project's OSC target ([da89e52](https://github.com/constructive-io/wavegrid/commit/da89e5279be9690bc18f65e605b955170885c654))

### Features

- **layout:** concentric ring layouts — hollow centres, symmetric discs, per-project shorthand ([8c97330](https://github.com/constructive-io/wavegrid/commit/8c973305d8341de2de7de8b1975d9e2b8dc75444))
- probe the OSC target, default BEYOND to 8000, add an in-app OSC debugger ([db95d9e](https://github.com/constructive-io/wavegrid/commit/db95d9e47aa68f1e70e88bec852f2fc870de2793))
- **ui,desktop:** explain a red connection dot + follow the project in use ([5848cf6](https://github.com/constructive-io/wavegrid/commit/5848cf6ca704e867380ae687614df014c94a87fe))

# [1.2.0](https://github.com/constructive-io/wavegrid/compare/@wavegrid/layout@1.1.0...@wavegrid/layout@1.2.0) (2026-08-09)

### Features

- **desktop,settings:** named light-map library + active-selection ([b7cdf30](https://github.com/constructive-io/wavegrid/commit/b7cdf300eba314a4e2c03b56788bb4b003615490))
- **desktop:** canvas light-map debugger — tap-to-map, identify, auto-map ([861fded](https://github.com/constructive-io/wavegrid/commit/861fded9dc52e9c51583f7e50b63dd406a3f3fa3))
- **layout:** shared light-map helpers + deterministic auto-map heuristics ([17ce2d2](https://github.com/constructive-io/wavegrid/commit/17ce2d26acfa06f5b1f2a9096188d0fa5143d19e))
- **routing:** one unified routing spec, per-device configs generated from it ([7399ef9](https://github.com/constructive-io/wavegrid/commit/7399ef9e0e08a999c68ee5b8ce261f9beb60cb4d))
- **sync:** per-project sync.enabled toggle + secrets gate ([81e3225](https://github.com/constructive-io/wavegrid/commit/81e32256dbc3fac71546dd45a3cd05cfbf12b113))

# [1.1.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/layout@1.0.0...@wavegrid/layout@1.1.0) (2026-08-06)

### Features

- **ui:** Nova tab — ring-motion presets + ring laser-map assignment ([499cee5](https://github.com/constructive-io/Illuminate/commit/499cee5e449c57954da57e8c231cdbae42832f81))

# [1.0.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/layout@0.4.0...@wavegrid/layout@1.0.0) (2026-08-05)

**Note:** Version bump only for package @wavegrid/layout

# [0.4.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/layout@0.3.0...@wavegrid/layout@0.4.0) (2026-08-05)

### Features

- **cli:** wavegrid doctor — local + whole-installation diagnostics ([623fafd](https://github.com/constructive-io/Illuminate/commit/623fafda6c76d45a3cd8a058ccda4860eae06903))

# [0.3.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/layout@0.2.0...@wavegrid/layout@0.3.0) (2026-08-05)

### Features

- **settings:** centralize projects, secrets, users & config in an appstash store ([c37f8c4](https://github.com/constructive-io/Illuminate/commit/c37f8c4ec076d7a25b7ebb320e1154350273f36c))

# 0.2.0 (2026-08-05)

### Features

- config-driven layouts (grids/rings/filled rings) + wavegrid CLI ([94313a9](https://github.com/constructive-io/Illuminate/commit/94313a9910431d1a1d584069f4c4354450059363))
