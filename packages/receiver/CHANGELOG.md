# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.2.0](https://github.com/constructive-io/wavegrid/compare/@wavegrid/receiver@1.1.0...@wavegrid/receiver@1.2.0) (2026-08-09)

### Bug Fixes

- **receiver:** read light-map from WG_STATE_DIR, resolve routing config from cwd ([75144ea](https://github.com/constructive-io/wavegrid/commit/75144ea5262810170ca8ea2997b4a9e040c26d0f))

### Features

- **discovery:** machine-local device identity + mDNS brain discovery ([b15fded](https://github.com/constructive-io/wavegrid/commit/b15fdedf1725b8c18ed5334277f0ea978ec608c0))
- **routing:** one unified routing spec, per-device configs generated from it ([7399ef9](https://github.com/constructive-io/wavegrid/commit/7399ef9e0e08a999c68ee5b8ce261f9beb60cb4d))

# [1.1.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/receiver@1.0.0...@wavegrid/receiver@1.1.0) (2026-08-06)

### Features

- **ui,server:** unified brain — Vite SPA served by the server + server/receiver commands ([3fb1f19](https://github.com/constructive-io/Illuminate/commit/3fb1f19843881e8fa6b18cf5f9687b61f3d454f2))

# [1.0.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/receiver@0.5.0...@wavegrid/receiver@1.0.0) (2026-08-05)

**Note:** Version bump only for package @wavegrid/receiver

# [0.5.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/receiver@0.4.1...@wavegrid/receiver@0.5.0) (2026-08-05)

### Features

- **cli:** wavegrid doctor — local + whole-installation diagnostics ([623fafd](https://github.com/constructive-io/Illuminate/commit/623fafda6c76d45a3cd8a058ccda4860eae06903))

## [0.4.1](https://github.com/constructive-io/Illuminate/compare/@wavegrid/receiver@0.4.0...@wavegrid/receiver@0.4.1) (2026-08-05)

**Note:** Version bump only for package @wavegrid/receiver

# 0.4.0 (2026-08-05)

### Bug Fixes

- 6 command-mode bugs — paint, keepalive, tick order, setSmoothness ([39cb497](https://github.com/constructive-io/Illuminate/commit/39cb49796fce932d5e2c5aadd4b2f15aa1502ae1))
- add crash logging and tick error recovery to receiver ([4ac8a25](https://github.com/constructive-io/Illuminate/commit/4ac8a25030f76b8556fce7eafaff0290ffb83cf2))
- heart-breathe lingers at full brightness, quick dip at low ([e513ea8](https://github.com/constructive-io/Illuminate/commit/e513ea8b7138f8e119256ba401100659b69461e0))
- lower speed minimum to 0.001x and apply speed to receiver patterns ([517ab81](https://github.com/constructive-io/Illuminate/commit/517ab81eef4c2c363e5a3c63e6ed2e19a07f10c8))
- orientation transforms on receiver + heart scene + heart-breathe animation ([a401c65](https://github.com/constructive-io/Illuminate/commit/a401c65e895b4f4da678569100fed13cc680a539))
- receiver keeps playing active content on signal loss ([335720b](https://github.com/constructive-io/Illuminate/commit/335720bcdfb904d8e8df5facb91eda9d56731d7e))
- receiver lazily initializes grid — no output until first command ([d45e333](https://github.com/constructive-io/Illuminate/commit/d45e333ec2006206d0df57a62685ff7d85afca43))
- receiver produces zero output until a visual command arrives ([dbb8bb5](https://github.com/constructive-io/Illuminate/commit/dbb8bb566183b799d0a5ef53f75ba8b1b823086e))
- receiver resets grid to black on visual mode switch ([d14a499](https://github.com/constructive-io/Illuminate/commit/d14a4995d2cccf9d872ba38c18bdf47090bdee27)), closes [#81](https://github.com/constructive-io/Illuminate/issues/81)
- receiver starts dark — no color initialization until server sends commands ([66c936e](https://github.com/constructive-io/Illuminate/commit/66c936eaf20eab51de01c11d2c54e24773ffac16))
- **receiver:** hoist @wavegrid/osc for workspace resolution + log real errors on load failure ([898d95b](https://github.com/constructive-io/Illuminate/commit/898d95bb8047dd0cb4becf0651526b51ba981e3d))
- **receiver:** static import of @wavegrid/osc, break circular dep, clean error logging ([50420a8](https://github.com/constructive-io/Illuminate/commit/50420a8a08cecc1741f596318cb495d3c37bbf0c))
- **receiver:** type array as OutputAdapter[] to fix build ([cbcfa7b](https://github.com/constructive-io/Illuminate/commit/cbcfa7bccf8ea8d7a5e4285772b3afa8ffa99624))
- reject all unauthenticated WebSocket connections ([c522f99](https://github.com/constructive-io/Illuminate/commit/c522f99bb0df71ffd757a8fa693755cfc16beb55))
- remove snap-to-black on mode switch — restore smooth LP crossfade ([ac3be2a](https://github.com/constructive-io/Illuminate/commit/ac3be2a5490a269a729dbadb190f07690436213f))
- resolve ROUTING_CONFIG path relative to workspace root ([857ec63](https://github.com/constructive-io/Illuminate/commit/857ec636fb838bccf5a5e45102e7ec64c859aba2))
- speed command now reaches receiver and supports 0.01x minimum ([fc2d85b](https://github.com/constructive-io/Illuminate/commit/fc2d85be2c2b2addf64afffa8f2eab4056738b5f))
- speed slider now works correctly on receiver and server patterns ([bb952ee](https://github.com/constructive-io/Illuminate/commit/bb952ee62f4673dba333be5640ed9ad9a3edf549))
- zero grid cells on clear command in receiver ([e386269](https://github.com/constructive-io/Illuminate/commit/e3862693c8c7a45cb65daf5eb0d930459c53a585))

### Features

- add @illuminate/receiver — brain with independent LP filter + sine fallback ([1bf12db](https://github.com/constructive-io/Illuminate/commit/1bf12db3ebc8364316e8e9b4fef00a61350478d6))
- add QuickJS sandbox for dynamic JS pattern evaluation ([c33ff86](https://github.com/constructive-io/Illuminate/commit/c33ff86975c35e79f52f4c0104ae175ce25cb7a4))
- add receiver command mode with local animation engine ([528cd3c](https://github.com/constructive-io/Illuminate/commit/528cd3c0575ed12a58c791f99fde35fd0f6b6546))
- add receiver debug UI — shows grid before routing ([44c08be](https://github.com/constructive-io/Illuminate/commit/44c08be85046471215d4acf31fdc6a33b850321d))
- **cli:** run server+receiver in-process; embed as deps (no pnpm/workspace) ([c4670f0](https://github.com/constructive-io/Illuminate/commit/c4670f01e0445cc9e840ee2c9868cf9f81a06e71))
- config-driven layouts (grids/rings/filled rings) + wavegrid CLI ([94313a9](https://github.com/constructive-io/Illuminate/commit/94313a9910431d1a1d584069f4c4354450059363))
- configurable grid size across all packages + README updates ([e92b87d](https://github.com/constructive-io/Illuminate/commit/e92b87dc3b76dd1671106ce39bd864fd62e3c170))
- modularize laser system — new QuickJS pattern packages ([f49a983](https://github.com/constructive-io/Illuminate/commit/f49a9833e5063d4ca8885b975139810b36aa88a3))
- **osc:** add RGBA color mode as alternative to ColorSlider ([6ab1c6f](https://github.com/constructive-io/Illuminate/commit/6ab1c6f0a5596aa9956d24a204fa3758fecda15a))
- **osc:** DEBUG_OSC logging flag + default BEYOND port to 7001 ([76ea6c9](https://github.com/constructive-io/Illuminate/commit/76ea6c9aa79d40decad7dff9ba1e3379db8399a5))
- playlist system + fix Pride/Patterns tabs + pride anims in Anim tab ([2177f00](https://github.com/constructive-io/Illuminate/commit/2177f00f782ab2698a1ec43ea5663ea8c01a6ad6))
- **receiver:** add BEYOND_GRID_ORDER toggle for column-major projector mapping ([e3200d4](https://github.com/constructive-io/Illuminate/commit/e3200d4709e1ad353e95da2db02e40d6fcdfd9be))
- **receiver:** OSC output adapters for BEYOND and FB4 hardware ([a0eccf7](https://github.com/constructive-io/Illuminate/commit/a0eccf7e912fe51d858486046b9459c8064cb7dc))
- **receiver:** shard support — split 49 cannons across multiple receivers ([bb3bf14](https://github.com/constructive-io/Illuminate/commit/bb3bf143977ce455ea2540b7349bb8bfcb36139b))

### Reverts

- Revert "send beyond zones by name" ([bc84cb6](https://github.com/constructive-io/Illuminate/commit/bc84cb68b73c4b39daaccd791dbc894f1b4cb1b6))
- remove all dump/QuickJS code, restore pre-dump main ([318d263](https://github.com/constructive-io/Illuminate/commit/318d2635f787dd6df75a4288d2da6948964dccb3)), closes [#2](https://github.com/constructive-io/Illuminate/issues/2) [#9](https://github.com/constructive-io/Illuminate/issues/9) [#1](https://github.com/constructive-io/Illuminate/issues/1)

# [0.3.0](https://github.com/constructive-io/Illuminate/compare/wavegrid@0.2.1...wavegrid@0.3.0) (2026-06-14)

### Features

- configurable grid size across all packages + README updates ([e92b87d](https://github.com/constructive-io/Illuminate/commit/e92b87dc3b76dd1671106ce39bd864fd62e3c170))
- **receiver:** OSC output adapters for BEYOND and FB4 hardware ([a0eccf7](https://github.com/constructive-io/Illuminate/commit/a0eccf7e912fe51d858486046b9459c8064cb7dc))
- **receiver:** shard support — split 49 cannons across multiple receivers ([bb3bf14](https://github.com/constructive-io/Illuminate/commit/bb3bf143977ce455ea2540b7349bb8bfcb36139b))

## [0.2.1](https://github.com/constructive-io/Illuminate/compare/wavegrid@0.2.0...wavegrid@0.2.1) (2026-06-13)

**Note:** Version bump only for package wavegrid

# [0.2.0](https://github.com/constructive-io/Illuminate/compare/wavegrid@0.1.1...wavegrid@0.2.0) (2026-06-13)

**Note:** Version bump only for package wavegrid

## [0.1.1](https://github.com/constructive-io/Illuminate/compare/wavegrid@0.1.0...wavegrid@0.1.1) (2026-06-13)

**Note:** Version bump only for package wavegrid

# 0.1.0 (2026-06-13)

### Bug Fixes

- **receiver:** type array as OutputAdapter[] to fix build ([cbcfa7b](https://github.com/constructive-io/Illuminate/commit/cbcfa7bccf8ea8d7a5e4285772b3afa8ffa99624))

### Features

- add @illuminate/receiver — brain with independent LP filter + sine fallback ([1bf12db](https://github.com/constructive-io/Illuminate/commit/1bf12db3ebc8364316e8e9b4fef00a61350478d6))
