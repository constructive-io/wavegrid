# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.2.0](https://github.com/constructive-io/wavegrid/compare/@wavegrid/server@1.1.0...@wavegrid/server@1.2.0) (2026-08-09)

### Features

- **access,desktop:** named access keys + two-column lights debugger ([933e088](https://github.com/constructive-io/wavegrid/commit/933e0880f6eeebf824727a8ba33cecd6be1ff8cf))
- **access:** admin/operator roles + server-side login sessions ([e5b7156](https://github.com/constructive-io/wavegrid/commit/e5b7156b1fe6ec32c163e13de75ce724b4c35ed7))
- **access:** shared guest passphrase — one low-privilege operator to hand out ([70cec2d](https://github.com/constructive-io/wavegrid/commit/70cec2d394e15a5ba190098e6053c0027e21f2d7))
- **desktop:** canvas light-map debugger — tap-to-map, identify, auto-map ([861fded](https://github.com/constructive-io/wavegrid/commit/861fded9dc52e9c51583f7e50b63dd406a3f3fa3))
- **devices:** authenticated self-registration + user-named device registry ([1b261ba](https://github.com/constructive-io/wavegrid/commit/1b261bafa833a2e3afbd4d7eff7f28071d877e2d))
- **discovery:** machine-local device identity + mDNS brain discovery ([b15fded](https://github.com/constructive-io/wavegrid/commit/b15fdedf1725b8c18ed5334277f0ea978ec608c0))
- **sync:** per-project sync.enabled toggle + secrets gate ([81e3225](https://github.com/constructive-io/wavegrid/commit/81e32256dbc3fac71546dd45a3cd05cfbf12b113))
- **sync:** revisioned server-mediated config sync + replication (Phase D) ([cbe43c0](https://github.com/constructive-io/wavegrid/commit/cbe43c0b522ceb7bf1d92ed5513043b20a32a5f3))
- **sync:** server-less coordinator election + sync_merge re-home ([8215bbb](https://github.com/constructive-io/wavegrid/commit/8215bbb64f2ef38491e87d6bf7ab1f88313499ec))
- **sync:** validate scopes server-side + make UI a sync consumer ([f87d214](https://github.com/constructive-io/wavegrid/commit/f87d2146b36451214cade69b95d1dba587fc2912))

# [1.1.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/server@1.0.0...@wavegrid/server@1.1.0) (2026-08-06)

### Features

- **ui,server:** unified brain — Vite SPA served by the server + server/receiver commands ([3fb1f19](https://github.com/constructive-io/Illuminate/commit/3fb1f19843881e8fa6b18cf5f9687b61f3d454f2))

# [1.0.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/server@0.6.0...@wavegrid/server@1.0.0) (2026-08-05)

**Note:** Version bump only for package @wavegrid/server

# [0.6.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/server@0.5.0...@wavegrid/server@0.6.0) (2026-08-05)

### Features

- **cli:** wavegrid doctor — local + whole-installation diagnostics ([623fafd](https://github.com/constructive-io/Illuminate/commit/623fafda6c76d45a3cd8a058ccda4860eae06903))

# [0.5.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/server@0.4.0...@wavegrid/server@0.5.0) (2026-08-05)

### Features

- **settings:** centralize projects, secrets, users & config in an appstash store ([c37f8c4](https://github.com/constructive-io/Illuminate/commit/c37f8c4ec076d7a25b7ebb320e1154350273f36c))

# 0.4.0 (2026-08-05)

### Bug Fixes

- 6 command-mode bugs — paint, keepalive, tick order, setSmoothness ([39cb497](https://github.com/constructive-io/Illuminate/commit/39cb49796fce932d5e2c5aadd4b2f15aa1502ae1))
- broadcast audio layer to receivers as paint commands ([2390d36](https://github.com/constructive-io/Illuminate/commit/2390d36e03d014c534f2ec3f60d705e784148a93))
- broadcast grid state to UI clients on every tick ([7b424df](https://github.com/constructive-io/Illuminate/commit/7b424df2a6e184699ae124c4695a93a274b43c78))
- eliminate animation bleed-through with full grid reset ([f08f9fe](https://github.com/constructive-io/Illuminate/commit/f08f9fe43bafe9ace36a46b20e51501502b05183))
- grid clear on switch, ctx.noise/xy/smoothstep, trans scene, rainbow anim, brightness ([a587b3d](https://github.com/constructive-io/Illuminate/commit/a587b3dac949a0fb1864bccb3823972ebf55b2cb))
- lower speed minimum to 0.001x and apply speed to receiver patterns ([517ab81](https://github.com/constructive-io/Illuminate/commit/517ab81eef4c2c363e5a3c63e6ed2e19a07f10c8))
- make JWT permanent (no expiry) — login once, stay logged in forever ([450e509](https://github.com/constructive-io/Illuminate/commit/450e509feb9861303e0e4adbb1802cd2323a95d7))
- orientation transforms on receiver + heart scene + heart-breathe animation ([a401c65](https://github.com/constructive-io/Illuminate/commit/a401c65e895b4f4da678569100fed13cc680a539))
- pattern engine handles mixed-format patterns, adds ctx.frame, NaN guards ([9fe860d](https://github.com/constructive-io/Illuminate/commit/9fe860d686d0061405291f5e12ae7ff1ae15b319))
- Pride tab patterns fail to evaluate on receiver and server polar() mismatch ([59be488](https://github.com/constructive-io/Illuminate/commit/59be488466d6bcc15197f85eaa5b591737ed118d))
- reject all unauthenticated WebSocket connections ([c522f99](https://github.com/constructive-io/Illuminate/commit/c522f99bb0df71ffd757a8fa693755cfc16beb55))
- remove pride-diagonal and pride-scroll, slow down pride-ring ([d428748](https://github.com/constructive-io/Illuminate/commit/d4287483727738ec7f84ccf0b717773b529dbceb))
- remove snap-to-black on mode switch — restore smooth LP crossfade ([ac3be2a](https://github.com/constructive-io/Illuminate/commit/ac3be2a5490a269a729dbadb190f07690436213f))
- replace localStorage auth with server-signed JWT tokens ([1d57ec7](https://github.com/constructive-io/Illuminate/commit/1d57ec743cca403d54a4f2959ffa9ad511770a7e))
- require WG_JWT_SECRET env var — no auto-generated secret files ([893e829](https://github.com/constructive-io/Illuminate/commit/893e8296ec506e0ed22f939f491152a2297990c2))
- speed command now reaches receiver and supports 0.01x minimum ([fc2d85b](https://github.com/constructive-io/Illuminate/commit/fc2d85be2c2b2addf64afffa8f2eab4056738b5f))
- speed slider now works correctly on receiver and server patterns ([bb952ee](https://github.com/constructive-io/Illuminate/commit/bb952ee62f4673dba333be5640ed9ad9a3edf549))
- vivid trans pink (sat 100), Solid Vibes gradients only, bump dim scenes ([423cd99](https://github.com/constructive-io/Illuminate/commit/423cd99df6861590ae6a92dba94d37b4f957e175))

### Features

- add 7 new scenes (heart, sf, smiley, forest, fire, night, checker) and reorder tabs ([a0e391e](https://github.com/constructive-io/Illuminate/commit/a0e391e5f79fcc68fa5ce558a4c773a5556b6518))
- add animation speed slider and pride-ring animation ([616b3f0](https://github.com/constructive-io/Illuminate/commit/616b3f0dadeb2ccddfdbf0dfe6993043f88e4d85))
- add GRID=COLSxROWS shorthand parsing, simplify ecosystem config ([b5bbd54](https://github.com/constructive-io/Illuminate/commit/b5bbd54d2f9f863582ebc9d4cacd014906946e13))
- add Pride ROYGBIV animations (scroll, flow, diagonal, breathe, rotate) ([9df7a5f](https://github.com/constructive-io/Illuminate/commit/9df7a5fac5077aaf51cb28f3a6e5b779e0746147))
- add QuickJS sandbox for dynamic JS pattern evaluation ([c33ff86](https://github.com/constructive-io/Illuminate/commit/c33ff86975c35e79f52f4c0104ae175ce25cb7a4))
- add receiver command mode with local animation engine ([528cd3c](https://github.com/constructive-io/Illuminate/commit/528cd3c0575ed12a58c791f99fde35fd0f6b6546))
- add server-side BROADCAST_MODE toggle for command-mode servers ([8b98d03](https://github.com/constructive-io/Illuminate/commit/8b98d03bc69d4a9fbd8bf004f7e2a79339eb5930))
- add shift effect with radial dial UI (wrap mode) ([95e9137](https://github.com/constructive-io/Illuminate/commit/95e9137aab1936a5a0283d98446117d0c2f9402b))
- add Solid Vibes sequence, bump all scene brightness to 100% ([2891156](https://github.com/constructive-io/Illuminate/commit/2891156610e608619e158486f6e58ed9d8626323))
- add speed slider to Patterns tab, flag previews, more flags, remove smiley, fix white brightness ([5adc901](https://github.com/constructive-io/Illuminate/commit/5adc9014b6e1b22703a1672e2f23e0259a10da73))
- add static pride/trans patterns + auto-cancel playlist on new command ([4bc25a2](https://github.com/constructive-io/Illuminate/commit/4bc25a22081721643bedb22b2d1f5b44b6c54dc7))
- add Video tab — webcam-to-grid with blend modes ([ed2f0f7](https://github.com/constructive-io/Illuminate/commit/ed2f0f757bcbb7a7428bedbc1c03818538a6bd7a))
- **cli:** run server+receiver in-process; embed as deps (no pnpm/workspace) ([c4670f0](https://github.com/constructive-io/Illuminate/commit/c4670f01e0445cc9e840ee2c9868cf9f81a06e71))
- config-driven layouts (grids/rings/filled rings) + wavegrid CLI ([94313a9](https://github.com/constructive-io/Illuminate/commit/94313a9910431d1a1d584069f4c4354450059363))
- multi-grid deployment — run 7×7 and 7×2 shows simultaneously ([3a8bf90](https://github.com/constructive-io/Illuminate/commit/3a8bf901b9d770297d419090072eabbad538b300))
- playlist system + fix Pride/Patterns tabs + pride anims in Anim tab ([2177f00](https://github.com/constructive-io/Illuminate/commit/2177f00f782ab2698a1ec43ea5663ea8c01a6ad6))
- rename simulator to server, fix broadcast, add mic input ([8813200](https://github.com/constructive-io/Illuminate/commit/8813200cd71dff69a915932d282a5952380213ea))
- replace rotate/mirror pixel shuffling with server-side orientation transform ([fa937f4](https://github.com/constructive-io/Illuminate/commit/fa937f4b6fd34b3745dd7b0457db9d95a052bacf))
- sequences tab + server-side evalPattern preview + remove built-in HTML UI ([e43c89c](https://github.com/constructive-io/Illuminate/commit/e43c89cae84ddd022a8f609e2058d36e3b09feeb))
- speed slider on Pride tab, 100% brightness, trans scene, Pride & Trans sequence ([acbef76](https://github.com/constructive-io/Illuminate/commit/acbef76465ca730042a13610d2f4d3e7b4fc5881))
- state persistence, I ❤️ SF animation, clear fix, default to black ([db3635b](https://github.com/constructive-io/Illuminate/commit/db3635b2895ed9d9aa0d5d27a0f7972f4cb17385))
- sync slider state from server on UI refresh ([16ec7ff](https://github.com/constructive-io/Illuminate/commit/16ec7fffe84d8da0374ae814a776fcc982e77116))

# [0.3.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/simulator@0.2.1...@wavegrid/simulator@0.3.0) (2026-06-14)

### Features

- configurable grid size across all packages + README updates ([e92b87d](https://github.com/constructive-io/Illuminate/commit/e92b87dc3b76dd1671106ce39bd864fd62e3c170))

## [0.2.1](https://github.com/constructive-io/Illuminate/compare/@wavegrid/simulator@0.2.0...@wavegrid/simulator@0.2.1) (2026-06-13)

**Note:** Version bump only for package @wavegrid/simulator

# [0.2.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/simulator@0.1.1...@wavegrid/simulator@0.2.0) (2026-06-13)

### Features

- animations tab — 7 continuous patterns (wave, breathe, rainbow, pac-man, spiral, rain, heartbeat) ([9dd6add](https://github.com/constructive-io/Illuminate/commit/9dd6add63532895def25ffc32584eb2d2faa4cf1))
- attack + smoothness controls — full envelope shaping ([f4fe8fe](https://github.com/constructive-io/Illuminate/commit/f4fe8fe6495b76ce807925614995a7e231c29398))
- global smoothness slider — adjustable low-pass filter ([eabf920](https://github.com/constructive-io/Illuminate/commit/eabf9201a403a5d94e72735933288cdfb4f2771b))
- **simulator:** master controller UI — full envelope, animations, ambient presets, idle timeout ([15a01bf](https://github.com/constructive-io/Illuminate/commit/15a01bfc6480b3995e22b2d1b454727461ee56f8))

## [0.1.1](https://github.com/constructive-io/Illuminate/compare/@wavegrid/simulator@0.1.0...@wavegrid/simulator@0.1.1) (2026-06-13)

**Note:** Version bump only for package @wavegrid/simulator

# 0.1.0 (2026-06-13)

### Features

- add @illuminate/canvas — artist-facing creative UI for 7×7 grid ([7a00ddb](https://github.com/constructive-io/Illuminate/commit/7a00ddba1643b89203f2555780c2190f32b5eaa6))
- bootstrap pgpm workspace with 7x7 grid simulator ([717aaba](https://github.com/constructive-io/Illuminate/commit/717aabaab0563c4fa5e512cbc57a809456927cc8))
