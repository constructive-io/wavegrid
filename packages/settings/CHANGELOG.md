# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.3.0](https://github.com/constructive-io/wavegrid/compare/@wavegrid/settings@1.2.0...@wavegrid/settings@1.3.0) (2026-11-22)

### Bug Fixes

- **desktop:** authenticate the embedded UI against a joined brain; isolate the store in desktop tests ([7dc65c1](https://github.com/constructive-io/wavegrid/commit/7dc65c1edc84f84744ac1470cae393389f1f4df7))
- **settings,layout:** import keeps the local OSC target; inline layouts export as JSON, not the default preset ([a5320f0](https://github.com/constructive-io/wavegrid/commit/a5320f0230fc78652082604d2f6c111fd21aa1ce))
- **settings:** a kept receiver.lightMap does not bring back removed receiver settings ([8c9801d](https://github.com/constructive-io/wavegrid/commit/8c9801d54e1eb23890b750a0c824271d517edd57))
- **settings:** a project file's osc block replaces the local one whole on refresh ([8f3b9da](https://github.com/constructive-io/wavegrid/commit/8f3b9da4e35627ddd1590d199a07820ab3173094))
- **settings:** keep a local receiver.lightMap on refresh unless the file names an active light map ([9e57cfb](https://github.com/constructive-io/wavegrid/commit/9e57cfbf04576943cd242b9fb627b5c8da393e7e))
- **settings:** reject "." and ".." as project names, keep the local OSC target on project-file refresh ([91b35f5](https://github.com/constructive-io/wavegrid/commit/91b35f57a2dd438129116f2d80c1f55e8c7d3b89))
- **settings:** validate light map names before opening, and apply removed looks/devices on refresh ([167e6f0](https://github.com/constructive-io/wavegrid/commit/167e6f045ff29f34874469cbe4d008f1e6637427))

### Features

- .wavegrid project files kept outside the repo, plus explicit fixture layouts ([f4b2146](https://github.com/constructive-io/wavegrid/commit/f4b2146d7b6cdc2088880a69c36a76dd341ecd2a))
- **auth:** sessions last 30 days instead of 60 minutes ([95c59af](https://github.com/constructive-io/wavegrid/commit/95c59afb01494fb0adc47fa8dc6b23742e8bb56a))
- **desktop:** Join a brain receiver-only mode ([ea220a0](https://github.com/constructive-io/wavegrid/commit/ea220a0f66ed0f5fcb75489614b5219a677980d8))

# [1.2.0](https://github.com/constructive-io/wavegrid/compare/@wavegrid/settings@1.1.0...@wavegrid/settings@1.2.0) (2026-09-17)

### Bug Fixes

- **auth:** enforce session revocation on live sockets and add a sign-out button ([997b6ae](https://github.com/constructive-io/wavegrid/commit/997b6ae01a8b89117d4221a33c3ccbbbdb66f28a))

# [1.1.0](https://github.com/constructive-io/wavegrid/compare/@wavegrid/settings@1.0.1...@wavegrid/settings@1.1.0) (2026-08-09)

### Features

- **access,desktop:** named access keys + two-column lights debugger ([933e088](https://github.com/constructive-io/wavegrid/commit/933e0880f6eeebf824727a8ba33cecd6be1ff8cf))
- **access:** admin/operator roles + server-side login sessions ([e5b7156](https://github.com/constructive-io/wavegrid/commit/e5b7156b1fe6ec32c163e13de75ce724b4c35ed7))
- **access:** shared guest passphrase — one low-privilege operator to hand out ([70cec2d](https://github.com/constructive-io/wavegrid/commit/70cec2d394e15a5ba190098e6053c0027e21f2d7))
- **desktop,settings:** named light-map library + active-selection ([b7cdf30](https://github.com/constructive-io/wavegrid/commit/b7cdf300eba314a4e2c03b56788bb4b003615490))
- **devices:** authenticated self-registration + user-named device registry ([1b261ba](https://github.com/constructive-io/wavegrid/commit/1b261bafa833a2e3afbd4d7eff7f28071d877e2d))
- **devices:** operator-assigned shards (wavegrid devices assign) + receiver auto-pickup ([7a7b16b](https://github.com/constructive-io/wavegrid/commit/7a7b16b14c6662c0f5d92b2793e8d1ebcff3f156))
- **discovery:** machine-local device identity + mDNS brain discovery ([b15fded](https://github.com/constructive-io/wavegrid/commit/b15fdedf1725b8c18ed5334277f0ea978ec608c0))
- **projects:** portable export/import (config + devices + users; identity/IPs never travel) ([1f82d7a](https://github.com/constructive-io/wavegrid/commit/1f82d7a51b924f6e64228a4db23e8194155022ae))
- **settings,cli,desktop:** clear all — wipe the store behind a typed confirm ([c057b65](https://github.com/constructive-io/wavegrid/commit/c057b65b81dc0645ca8a626244aff6d2df82e620))
- **sync:** revisioned server-mediated config sync + replication (Phase D) ([cbe43c0](https://github.com/constructive-io/wavegrid/commit/cbe43c0b522ceb7bf1d92ed5513043b20a32a5f3))
- **sync:** validate scopes server-side + make UI a sync consumer ([f87d214](https://github.com/constructive-io/wavegrid/commit/f87d2146b36451214cade69b95d1dba587fc2912))

## [1.0.1](https://github.com/constructive-io/Illuminate/compare/@wavegrid/settings@1.0.0...@wavegrid/settings@1.0.1) (2026-08-06)

**Note:** Version bump only for package @wavegrid/settings

# [1.0.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/settings@0.7.0...@wavegrid/settings@1.0.0) (2026-08-05)

**Note:** Version bump only for package @wavegrid/settings

# [0.7.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/settings@0.6.0...@wavegrid/settings@0.7.0) (2026-08-05)

### Features

- **cli:** wavegrid doctor — local + whole-installation diagnostics ([623fafd](https://github.com/constructive-io/Illuminate/commit/623fafda6c76d45a3cd8a058ccda4860eae06903))

# 0.6.0 (2026-08-05)

### Features

- **settings:** centralize projects, secrets, users & config in an appstash store ([c37f8c4](https://github.com/constructive-io/Illuminate/commit/c37f8c4ec076d7a25b7ebb320e1154350273f36c))
