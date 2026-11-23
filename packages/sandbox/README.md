# @wavegrid/sandbox

Shared memory-limited, deadline-enforced QuickJS pattern runtime for the brain and receiver.

`createSandboxEngine(layout)` initializes WASM asynchronously. Dispose engines when no longer needed.

Patterns provide `render(ctx)`, optional `init(ctx)`/`onParam(name, value, ctx)`, and optional parameter metadata. The shared prelude exposes fixture geometry, time, HSB drawing and deterministic random helpers. It does not expose Node, filesystem or network APIs. Legacy mixed declaration/object patterns are normalized before evaluation inside QuickJS.

Defaults: 64 MiB memory, 512 KiB stack, 2000 ms per load/init evaluation and 6 ms per render evaluation. Render errors retain partial frames, like the receiver. This is a pattern runtime, not a React or ESM plugin loader.
