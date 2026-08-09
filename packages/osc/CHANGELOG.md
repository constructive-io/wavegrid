# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.1](https://github.com/constructive-io/wavegrid/compare/@wavegrid/osc@1.0.0...@wavegrid/osc@1.0.1) (2026-08-09)

**Note:** Version bump only for package @wavegrid/osc

# [1.0.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/osc@0.2.0...@wavegrid/osc@1.0.0) (2026-08-05)

**Note:** Version bump only for package @wavegrid/osc

# [0.2.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/osc@0.1.1...@wavegrid/osc@0.2.0) (2026-08-05)

### Bug Fixes

- **osc:** calibrate ColorSlider to usable 28–218 range ([da3804d](https://github.com/constructive-io/Illuminate/commit/da3804dc43e7152c7a633a2e8a779616abc1f4ec))
- **osc:** drop Saturation (not working via OSC), use white zone for desaturated colors ([280c902](https://github.com/constructive-io/Illuminate/commit/280c902f76d8d9f97213844d686410be12a315c7))
- **osc:** explicit float typing + diff-only sending ([bc302c7](https://github.com/constructive-io/Illuminate/commit/bc302c7235f1d4f7d6a8bcc3399bda6402329100))
- **osc:** use /beyond/zone/ addressing instead of /beyond/projector/ ([d0bdf22](https://github.com/constructive-io/Illuminate/commit/d0bdf226e86206a2752406820fb1165c64754a56))
- **osc:** use ColorSlider/Saturation/Brightness for BEYOND livecontrol ([aeac3fe](https://github.com/constructive-io/Illuminate/commit/aeac3fec7874dfd2631159b0c2161712aacc9998))
- **receiver:** static import of @wavegrid/osc, break circular dep, clean error logging ([50420a8](https://github.com/constructive-io/Illuminate/commit/50420a8a08cecc1741f596318cb495d3c37bbf0c))

### Features

- modularize laser system — new QuickJS pattern packages ([f49a983](https://github.com/constructive-io/Illuminate/commit/f49a9833e5063d4ca8885b975139810b36aa88a3))
- **osc:** add 'rgb' color mode — separate alpha+R+G+B livecontrol messages ([9418c9f](https://github.com/constructive-io/Illuminate/commit/9418c9f6a3117e8729b896185cad1444bc99fdb8))
- **osc:** add RGBA color mode as alternative to ColorSlider ([6ab1c6f](https://github.com/constructive-io/Illuminate/commit/6ab1c6f0a5596aa9956d24a204fa3758fecda15a))
- **osc:** DEBUG_OSC logging flag + default BEYOND port to 7001 ([76ea6c9](https://github.com/constructive-io/Illuminate/commit/76ea6c9aa79d40decad7dff9ba1e3379db8399a5))
- rename simulator to server, fix broadcast, add mic input ([8813200](https://github.com/constructive-io/Illuminate/commit/8813200cd71dff69a915932d282a5952380213ea))

### Reverts

- Revert "send beyond zones by name" ([bc84cb6](https://github.com/constructive-io/Illuminate/commit/bc84cb68b73c4b39daaccd791dbc894f1b4cb1b6))
- remove all dump/QuickJS code, restore pre-dump main ([318d263](https://github.com/constructive-io/Illuminate/commit/318d2635f787dd6df75a4288d2da6948964dccb3)), closes [#2](https://github.com/constructive-io/Illuminate/issues/2) [#9](https://github.com/constructive-io/Illuminate/issues/9) [#1](https://github.com/constructive-io/Illuminate/issues/1)

## 0.1.1 (2026-06-14)

**Note:** Version bump only for package @wavegrid/osc
