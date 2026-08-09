# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.2.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/ui@1.1.0...@wavegrid/ui@1.2.0) (2026-08-09)

### Features

- **sync:** validate scopes server-side + make UI a sync consumer ([f87d214](https://github.com/constructive-io/Illuminate/commit/f87d2146b36451214cade69b95d1dba587fc2912))

# [1.1.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/ui@1.0.0...@wavegrid/ui@1.1.0) (2026-08-06)

### Bug Fixes

- **ui:** fixed 7x7 dot size for all layouts + store-authoritative JWT secret ([30d6120](https://github.com/constructive-io/Illuminate/commit/30d61206ed24bbaf055cc4e306114507b77c3dd1))

### Features

- **ui,server:** unified brain — Vite SPA served by the server + server/receiver commands ([3fb1f19](https://github.com/constructive-io/Illuminate/commit/3fb1f19843881e8fa6b18cf5f9687b61f3d454f2))
- **ui:** Nova tab — ring-motion presets + ring laser-map assignment ([499cee5](https://github.com/constructive-io/Illuminate/commit/499cee5e449c57954da57e8c231cdbae42832f81))

# [1.0.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/ui@0.4.1...@wavegrid/ui@1.0.0) (2026-08-05)

**Note:** Version bump only for package @wavegrid/ui

## [0.4.1](https://github.com/constructive-io/Illuminate/compare/@wavegrid/ui@0.4.0...@wavegrid/ui@0.4.1) (2026-08-05)

**Note:** Version bump only for package @wavegrid/ui

# [0.4.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/ui@0.3.0...@wavegrid/ui@0.4.0) (2026-08-05)

### Features

- **settings:** centralize projects, secrets, users & config in an appstash store ([c37f8c4](https://github.com/constructive-io/Illuminate/commit/c37f8c4ec076d7a25b7ebb320e1154350273f36c))

# [0.3.0](https://github.com/constructive-io/Illuminate/compare/@wavegrid/ui@0.2.0...@wavegrid/ui@0.3.0) (2026-08-05)

### Bug Fixes

- add missing test/lint scripts so all packages run in CI ([a519f93](https://github.com/constructive-io/Illuminate/commit/a519f93804818e367e59f95b76aac029a95874bd))
- add pride-ring tile to animation palette ([b022c37](https://github.com/constructive-io/Illuminate/commit/b022c373e3fda6ea88e83202ce6d9d52fb6b6350))
- always show brightness controls, move Motion tab before Debug ([bfac05c](https://github.com/constructive-io/Illuminate/commit/bfac05cf98b893f3031fda5224bc652d4914fb98))
- always show view-flip toggle button ([82fa0f2](https://github.com/constructive-io/Illuminate/commit/82fa0f2026a10fa2aa7623596ab111c1f93ad23a))
- canvas wrapper fills parent container instead of sizing to content ([4806097](https://github.com/constructive-io/Illuminate/commit/48060974a8c1450e24a981feed52ee5cec82ed3a))
- correct CSS rotation direction in view-flip counter-transform ([a5a401a](https://github.com/constructive-io/Illuminate/commit/a5a401a42f6809ef6b6cb41478f02f0c9bf1492e))
- destructure onShift in ToolContent params ([20025b2](https://github.com/constructive-io/Illuminate/commit/20025b2d74d2c0b1f5f2e6922e9cbd50e35a1788))
- fail closed when .users file is missing — reject with 503 instead of minting tokens ([37445c8](https://github.com/constructive-io/Illuminate/commit/37445c8f657e7be809e74ca310baed69bb75ec47))
- grid clear on switch, ctx.noise/xy/smoothstep, trans scene, rainbow anim, brightness ([a587b3d](https://github.com/constructive-io/Illuminate/commit/a587b3dac949a0fb1864bccb3823972ebf55b2cb))
- guard against negative radius in createRadialGradient ([c650e53](https://github.com/constructive-io/Illuminate/commit/c650e535d1f4c14df9406fc1be909e1efe07212b))
- lower speed minimum to 0.001x and apply speed to receiver patterns ([517ab81](https://github.com/constructive-io/Illuminate/commit/517ab81eef4c2c363e5a3c63e6ed2e19a07f10c8))
- make Fade slider 3x wider than Bright/Attack ([8dc8222](https://github.com/constructive-io/Illuminate/commit/8dc822277faadfe1b5b750b346de535bea67bdbf))
- make grid canvas responsive for iPhone and iPad viewports ([1b4919b](https://github.com/constructive-io/Illuminate/commit/1b4919b9355d801fe4c603b89534d80a3b498c03))
- make JWT permanent (no expiry) — login once, stay logged in forever ([450e509](https://github.com/constructive-io/Illuminate/commit/450e509feb9861303e0e4adbb1802cd2323a95d7))
- pattern engine handles mixed-format patterns, adds ctx.frame, NaN guards ([9fe860d](https://github.com/constructive-io/Illuminate/commit/9fe860d686d0061405291f5e12ae7ff1ae15b319))
- Pride tab patterns fail to evaluate on receiver and server polar() mismatch ([59be488](https://github.com/constructive-io/Illuminate/commit/59be488466d6bcc15197f85eaa5b591737ed118d))
- remove inline stop button from AnimationPalette (global stop is sufficient) ([4d7b6d6](https://github.com/constructive-io/Illuminate/commit/4d7b6d6e3410bd864627569e1cef703aff06eec4))
- remove pride-diagonal and pride-scroll, slow down pride-ring ([d428748](https://github.com/constructive-io/Illuminate/commit/d4287483727738ec7f84ccf0b717773b529dbceb))
- replace localStorage auth with server-signed JWT tokens ([1d57ec7](https://github.com/constructive-io/Illuminate/commit/1d57ec743cca403d54a4f2959ffa9ad511770a7e))
- require WG_JWT_SECRET env var — no auto-generated secret files ([893e829](https://github.com/constructive-io/Illuminate/commit/893e8296ec506e0ed22f939f491152a2297990c2))
- restore HSL-based orb rendering for vivid colors ([83d2612](https://github.com/constructive-io/Illuminate/commit/83d261209c3eb11edc3ce123b1957f754323fa2c))
- Ring animation uses polar rotation, sequences list full height ([c61e4e8](https://github.com/constructive-io/Illuminate/commit/c61e4e8fc3ba63926889ea07ec68178b3e30ffc4))
- sequences list uses responsive CSS grid (2 cols when wide, 1 when narrow) ([b18643d](https://github.com/constructive-io/Illuminate/commit/b18643d8edd49da8db882cc47be3fe9cbd489197))
- sequences tab uses full-height flexbox layout ([c477bf9](https://github.com/constructive-io/Illuminate/commit/c477bf9d53e798b10928eaa9df41df33b09c6575))
- **ui:** brightness tab snapshots colors once, only modulates brightness — no color changes ([e4cb5b0](https://github.com/constructive-io/Illuminate/commit/e4cb5b08ed17195c2e9d1b05d4d7a1a4a98f6fcb))
- **ui:** don't re-snapshot when switching between brightness modes ([8088ecf](https://github.com/constructive-io/Illuminate/commit/8088ecf66681c39bd059e5d648cc1956e5c085b8))
- **ui:** shrink phone grid 8% + remove auth middleware ([ba1f84e](https://github.com/constructive-io/Illuminate/commit/ba1f84e735687109c458c08d68f1f40ce24df4b0))
- use 3000-series ports for all processes ([b3ae920](https://github.com/constructive-io/Illuminate/commit/b3ae920b2ffdf914a3d518edf513c0f763546ee4))
- use logarithmic scale for animation speed slider (more granularity below 1x) ([8f25910](https://github.com/constructive-io/Illuminate/commit/8f25910e4ef994c46f30448df35b5c3f0e9bc652))
- use ResizeObserver for grid canvas so it always fits available space ([709a5b2](https://github.com/constructive-io/Illuminate/commit/709a5b225d7ac433cfc61d26f0541075857fa75b))
- use runtime env vars for site metadata (no rebuild per deployment) ([7c6dbfa](https://github.com/constructive-io/Illuminate/commit/7c6dbfa08049a83309ec8197c8ec1268d6340fef))
- vivid trans pink (sat 100), Solid Vibes gradients only, bump dim scenes ([423cd99](https://github.com/constructive-io/Illuminate/commit/423cd99df6861590ae6a92dba94d37b4f957e175))

### Features

- add 15 more USA animated patterns (total 27 animations) ([c48addd](https://github.com/constructive-io/Illuminate/commit/c48addda3220527d074a574172a63b7bcd83c157))
- add 30 new creative patterns to the Patterns tab ([97844ef](https://github.com/constructive-io/Illuminate/commit/97844efa4a34248ebfcef98498f297d309e558f8))
- add 40 more patterns with varied color palettes ([7bad5d6](https://github.com/constructive-io/Illuminate/commit/7bad5d66d52a41c64edaee50cb160f7ef06288aa))
- add 60 new patterns — 22 statics/solids + 38 animations ([a21c5d3](https://github.com/constructive-io/Illuminate/commit/a21c5d3ecf6b382821dbf375f82e16ad48f7bc06))
- add 7 new scenes (heart, sf, smiley, forest, fire, night, checker) and reorder tabs ([a0e391e](https://github.com/constructive-io/Illuminate/commit/a0e391e5f79fcc68fa5ce558a4c773a5556b6518))
- add animation speed slider and pride-ring animation ([616b3f0](https://github.com/constructive-io/Illuminate/commit/616b3f0dadeb2ccddfdbf0dfe6993043f88e4d85))
- add client-side view-flip toggle to counter-rotate grid display ([f42327f](https://github.com/constructive-io/Illuminate/commit/f42327fc163b82aef038ddd052235bc480ab8eaf))
- add global stop-animation button and group header controls ([ed38857](https://github.com/constructive-io/Illuminate/commit/ed388575dad9ae81730d02efe82e0efce2bd03db))
- add GRID=COLSxROWS shorthand parsing, simplify ecosystem config ([b5bbd54](https://github.com/constructive-io/Illuminate/commit/b5bbd54d2f9f863582ebc9d4cacd014906946e13))
- add lesbian flag patterns (3 static + 5 animated) to Pride tab ([2589869](https://github.com/constructive-io/Illuminate/commit/2589869cde4312b2f86c73716e36b42fc030a219))
- add local pattern preview + extend speed slider range ([9b38bc3](https://github.com/constructive-io/Illuminate/commit/9b38bc32c37cff30a66125f08b990b736dd825bc))
- add mirror controls (horizontal/vertical flip) ([816cf08](https://github.com/constructive-io/Illuminate/commit/816cf080900e3d543a96529319ecc069a8dfaa1d))
- add paint clear button and global rotation controls ([e16a118](https://github.com/constructive-io/Illuminate/commit/e16a118c953d110ae3bb9bc374bf9894fe37cafa))
- add preview toggle to Patterns tab ([51d3c45](https://github.com/constructive-io/Illuminate/commit/51d3c453f3221318a72af5430f2d8514c2f208e5))
- add Pride ROYGBIV animations (scroll, flow, diagonal, breathe, rotate) ([9df7a5f](https://github.com/constructive-io/Illuminate/commit/9df7a5fac5077aaf51cb28f3a6e5b779e0746147))
- add Pride tab (eval-based) and Patterns editor panel ([daea45a](https://github.com/constructive-io/Illuminate/commit/daea45a2fc5dda9f17642bd661a462da38dc2814)), closes [#5](https://github.com/constructive-io/Illuminate/issues/5) [#F5A9B8](https://github.com/constructive-io/Illuminate/issues/F5A9B8)
- add rainbow static variations and reorder Pride animations ([f3a13ef](https://github.com/constructive-io/Illuminate/commit/f3a13efff88b20c2d1ea15f9271cd588997dbc87))
- add realistic flag variations + more R/W/B animations, remove Motion tab ([0ec01e5](https://github.com/constructive-io/Illuminate/commit/0ec01e5b30c85a3ce1f6f47ca8329b9ca73d19e6))
- add reset-to-1x button on all speed sliders ([bd490f9](https://github.com/constructive-io/Illuminate/commit/bd490f9e5bf4ae3bf786bfca643b26370e5431c8))
- add ROYGBIV quick-pick color swatches to paint tab ([1f05076](https://github.com/constructive-io/Illuminate/commit/1f050761707ca5d924c95679dd370b01e294f5f9))
- add shift effect with radial dial UI (wrap mode) ([95e9137](https://github.com/constructive-io/Illuminate/commit/95e9137aab1936a5a0283d98446117d0c2f9402b))
- add Solid Vibes sequence, bump all scene brightness to 100% ([2891156](https://github.com/constructive-io/Illuminate/commit/2891156610e608619e158486f6e58ed9d8626323))
- add speed slider to Patterns tab, flag previews, more flags, remove smiley, fix white brightness ([5adc901](https://github.com/constructive-io/Illuminate/commit/5adc9014b6e1b22703a1672e2f23e0259a10da73))
- add static pride/trans patterns + auto-cancel playlist on new command ([4bc25a2](https://github.com/constructive-io/Illuminate/commit/4bc25a22081721643bedb22b2d1f5b44b6c54dc7))
- add Traefik reverse proxy with Let's Encrypt SSL ([2df6b42](https://github.com/constructive-io/Illuminate/commit/2df6b42e5429e413f1b0116053deddf5e7e90fe5))
- add USA flag patterns + pure red/white/blue animations (no pink) ([82d9db3](https://github.com/constructive-io/Illuminate/commit/82d9db3aa7443bc551d3adc19c4520fb45a5423c))
- add USA tab with 22 red/white/blue patterns for 250th anniversary ([613d910](https://github.com/constructive-io/Illuminate/commit/613d91080efd535980f82b5feac3e7f3351194c2))
- add Video tab — webcam-to-grid with blend modes ([ed2f0f7](https://github.com/constructive-io/Illuminate/commit/ed2f0f757bcbb7a7428bedbc1c03818538a6bd7a))
- combine animations and brightness into single Anim tab ([4a15144](https://github.com/constructive-io/Illuminate/commit/4a15144e4d8fb7cbe34569ef31efdea114526374))
- config-driven layouts (grids/rings/filled rings) + wavegrid CLI ([94313a9](https://github.com/constructive-io/Illuminate/commit/94313a9910431d1a1d584069f4c4354450059363))
- configurable site metadata per deployment (OG/SMS previews) ([3cf2db9](https://github.com/constructive-io/Illuminate/commit/3cf2db9d6adaf507db5f9f1b52f2fec08ee3cc19))
- default mini-grid preview to ON across all tabs ([8a0915b](https://github.com/constructive-io/Illuminate/commit/8a0915b6d828a6cf11f19816542e93f403c2c78d))
- default Video tab to Brightness blend mode with boosted brightness ([9c4f985](https://github.com/constructive-io/Illuminate/commit/9c4f9859a3b19253f946f20509b8bdccef12d6d9))
- default view-flip toggle to ON (user's perspective) ([b8ce0f3](https://github.com/constructive-io/Illuminate/commit/b8ce0f39dbad28acfb5252f453e6518727248b01))
- group patterns into Solids/Static/Animated sections + 10 bright patterns ([b7a6727](https://github.com/constructive-io/Illuminate/commit/b7a672762ddb2ab18167dbe389603563e5ae1f57))
- migrate React UI to QuickJS protocol ([c85644a](https://github.com/constructive-io/Illuminate/commit/c85644ab8e9efe218f6cbc66b56d6955fad3a9e2))
- multi-grid deployment — run 7×7 and 7×2 shows simultaneously ([3a8bf90](https://github.com/constructive-io/Illuminate/commit/3a8bf901b9d770297d419090072eabbad538b300))
- persist active tab in localStorage across refreshes ([9e2832f](https://github.com/constructive-io/Illuminate/commit/9e2832f53b6967f184a6097cf0b08ae363f9c212))
- playlist system + fix Pride/Patterns tabs + pride anims in Anim tab ([2177f00](https://github.com/constructive-io/Illuminate/commit/2177f00f782ab2698a1ec43ea5663ea8c01a6ad6))
- remove Flag Tight + Betsy Ross, add Flag Classic (3x3 blue canton) ([ba1d521](https://github.com/constructive-io/Illuminate/commit/ba1d52173cd4fc64ffb8c51bdc8d4ab9fb0fbac8))
- remove logout button, show fade slider on mobile always ([ccbef14](https://github.com/constructive-io/Illuminate/commit/ccbef1429ccde23c55a7b1b6e37b212e0ac8abea))
- rename simulator to server, fix broadcast, add mic input ([8813200](https://github.com/constructive-io/Illuminate/commit/8813200cd71dff69a915932d282a5952380213ea))
- reorder USA flags — Flag Classic [#1](https://github.com/constructive-io/Illuminate/issues/1), Flag V2 [#2](https://github.com/constructive-io/Illuminate/issues/2), remove Flag Wide ([32341e0](https://github.com/constructive-io/Illuminate/commit/32341e06018dbce513f91934bcbaa8cc0834fece))
- responsive ControlGrid layout for paint UI and all control tabs ([920a24f](https://github.com/constructive-io/Illuminate/commit/920a24f7dd7bcab37d97aba875db645da0930d7d))
- restore LP filter, add fade slider, bump pattern brightness ([5fd87d9](https://github.com/constructive-io/Illuminate/commit/5fd87d9af1e76f9b913b201691d640168ffae36a))
- sequences tab + server-side evalPattern preview + remove built-in HTML UI ([e43c89c](https://github.com/constructive-io/Illuminate/commit/e43c89cae84ddd022a8f609e2058d36e3b09feeb))
- server-side audio+animation compositing — audio layer blends on top of animations ([2065029](https://github.com/constructive-io/Illuminate/commit/20650291d8b0fb856f022cb70b7b118be80e09bf))
- speed slider on Pride tab, 100% brightness, trans scene, Pride & Trans sequence ([acbef76](https://github.com/constructive-io/Illuminate/commit/acbef76465ca730042a13610d2f4d3e7b4fc5881))
- state persistence, I ❤️ SF animation, clear fix, default to black ([db3635b](https://github.com/constructive-io/Illuminate/commit/db3635b2895ed9d9aa0d5d27a0f7972f4cb17385))
- sync slider state from server on UI refresh ([16ec7ff](https://github.com/constructive-io/Illuminate/commit/16ec7fffe84d8da0374ae814a776fcc982e77116))
- **ui:** Brightness tab — global overlay with breathe, ripple, wave, fire, shimmer modes ([169fdef](https://github.com/constructive-io/Illuminate/commit/169fdefa23bffaff299877408d61b412bc449ecc))
- **ui:** flag animations (spin/ripple/wave), dark purple toggle, Jordan flag ([698034c](https://github.com/constructive-io/Illuminate/commit/698034cb336ee4066f2a2b50518290a389e4fbef))
- **ui:** Flags tab — 20 country flags mapped to 7×7 grid patterns ([3dbc041](https://github.com/constructive-io/Illuminate/commit/3dbc0418c911da63f48b2c44bc77b44579ac3fc1))
- **ui:** login screen with .users file authentication ([edf1a1a](https://github.com/constructive-io/Illuminate/commit/edf1a1a67cc0009ccb365d7eaac543b9a40ad955))
- **ui:** mobile-responsive layout — iPad-first with iPhone bottom sheet ([b59af37](https://github.com/constructive-io/Illuminate/commit/b59af37f0e0fe75dd1b1a6a6f1bd12b40587393c))

### Reverts

- Revert "send beyond zones by name" ([bc84cb6](https://github.com/constructive-io/Illuminate/commit/bc84cb68b73c4b39daaccd791dbc894f1b4cb1b6))
- remove all dump/QuickJS code, restore pre-dump main ([318d263](https://github.com/constructive-io/Illuminate/commit/318d2635f787dd6df75a4288d2da6948964dccb3)), closes [#2](https://github.com/constructive-io/Illuminate/issues/2) [#9](https://github.com/constructive-io/Illuminate/issues/9) [#1](https://github.com/constructive-io/Illuminate/issues/1)

# 0.2.0 (2026-06-14)

### Features

- @wavegrid/ui — Next.js 15 + Tailwind v4 frontend with audio reactive mode ([e1f3cdb](https://github.com/constructive-io/Illuminate/commit/e1f3cdbecef1c91e98403fa97d509261a027634c))
- **ui:** all 9 creative tabs + global audio engine + remove Brush tab ([a676085](https://github.com/constructive-io/Illuminate/commit/a67608513c2bcace41f76a8c7f35a9ea571617a5))
- **ui:** iPad layout, canvas-rendered lights, audio drops + blend modes ([bb2334a](https://github.com/constructive-io/Illuminate/commit/bb2334a7c560f2393af0b44ec15d7da71c97d79f))
- **ui:** layout toggle — swap tool panel between bottom dock and right sidebar ([49cf25e](https://github.com/constructive-io/Illuminate/commit/49cf25eb99d31096ce59108520b626b957b8fa75))
- **ui:** slider readouts, audio loop/seek, motion path, drops handles, delete Symmetry ([65953ff](https://github.com/constructive-io/Illuminate/commit/65953ff3a1f678fe99a0b10881ed4ec1fe787a22))
