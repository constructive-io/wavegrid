/**
 * QuickJS sandbox engine — evaluates dynamic JS pattern code in a
 * memory-limited, CPU-deadline-enforced sandbox.
 *
 * Patterns write HSB targets via `ctx.set(i, h, s, b)`.
 * The host reads the buffer each frame and applies it to the grid,
 * feeding into the existing LP filter / brightness pipeline.
 */

import type { Layout } from '@wavegrid/layout';
import { getQuickJS, QuickJSContext, QuickJSHandle, QuickJSRuntime } from 'quickjs-emscripten';

import { transformMixedFormat } from './normalize-pattern';
import { buildPrelude } from './sandbox-prelude';

export interface SandboxConfig {
  /** QuickJS memory limit in bytes. Default 64 MB. */
  memLimit: number;
  /** QuickJS stack size limit in bytes. Default 512 KB. */
  stackLimit: number;
  /** Max ms per render() call. Default 6 ms. */
  renderBudgetMs: number;
  /** Max ms for pattern load + init. Default 2000 ms. */
  loadBudgetMs: number;
}

const DEFAULT_CONFIG: SandboxConfig = {
  memLimit: 64 * 1024 * 1024,
  stackLimit: 512 * 1024,
  renderBudgetMs: 6,
  loadBudgetMs: 2000
};

export interface PatternMeta {
  name?: string;
  params?: Record<string, { default: unknown }>;
}

/** HSB triplet for one grid cell. */
export interface SandboxFrame {
  h: number;
  s: number;
  b: number;
}

export interface SandboxEngine {
  /** Load a pattern's JS source into the sandbox. Disposes previous VM. */
  loadPattern(code: string, initialParams?: Record<string, unknown>): PatternMeta;
  /** Update a single parameter on the running pattern. */
  setParam(name: string, value: unknown): void;
  /** Render one frame and return the HSB buffer, or null on error. */
  renderFrame(t: number, dt: number, frame: number): SandboxFrame[] | null;
  /** Release all QuickJS resources. */
  dispose(): void;
  /** Pattern metadata from the last load. */
  readonly meta: PatternMeta;
  /** Whether a pattern is currently loaded. */
  readonly loaded: boolean;
}

/**
 * Create a sandbox engine. Requires an async init step to load QuickJS WASM.
 */
export async function createSandboxEngine(
  layout: Layout,
  opts?: Partial<SandboxConfig>,
  onLog?: (msg: string) => void
): Promise<SandboxEngine> {
  const cfg = { ...DEFAULT_CONFIG, ...opts };
  const QuickJS = await getQuickJS();
  const prelude = buildPrelude(layout);
  const count = layout.count;

  let runtime: QuickJSRuntime | null = null;
  let vm: QuickJSContext | null = null;
  let deadline = 0;
  let meta: PatternMeta = {};
  let params: Record<string, unknown> = {};
  let loaded = false;

  const log = (m: string) => { try { onLog?.(m); } catch { /* swallow */ } };

  // Strip `export` keywords so patterns that use ESM syntax still work.
  const stripExports = (c: string) =>
    c.replace(/\bexport\s+(?=(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class)\b)/g, '');

  // ── helpers for running code inside the VM ──────────────────────

  function unwrap(result: ReturnType<QuickJSContext['evalCode']>): QuickJSHandle {
    if (result.error) {
      const err = vm!.dump(result.error);
      result.error.dispose();
      throw new Error(String(err));
    }
    return (result as { value: QuickJSHandle }).value;
  }

  function evalVoid(code: string, budgetMs: number): void {
    if (!vm) throw new Error('VM not initialised');
    deadline = Date.now() + budgetMs;
    const handle = unwrap(vm.evalCode(code));
    handle.dispose();
  }

  function evalVal(code: string, budgetMs: number): unknown {
    if (!vm) throw new Error('VM not initialised');
    deadline = Date.now() + budgetMs;
    const handle = unwrap(vm.evalCode(code));
    const v = vm.dump(handle);
    handle.dispose();
    return v;
  }

  function setGlobalStr(name: string, s: string): void {
    if (!vm) return;
    const h: QuickJSHandle = vm.newString(s);
    vm.setProp(vm.global, name, h);
    h.dispose();
  }

  // ── lifecycle ───────────────────────────────────────────────────

  function dispose(): void {
    try { vm?.dispose(); } catch { /* ok */ }
    try { runtime?.dispose(); } catch { /* ok */ }
    vm = null;
    runtime = null;
    loaded = false;
  }

  function applyParams(): void {
    setGlobalStr('__paramsJSON', JSON.stringify(params));
    evalVoid('__setParams(__paramsJSON)', 500);
  }

  function loadPattern(code: string, initialParams: Record<string, unknown> = {}): PatternMeta {
    dispose();

    runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(cfg.memLimit);
    runtime.setMaxStackSize(cfg.stackLimit);
    runtime.setInterruptHandler(() => Date.now() > deadline);

    vm = runtime.newContext();

    // Expose __log to the sandbox
    const logFn: QuickJSHandle = vm.newFunction('__log', (msgHandle: QuickJSHandle) => {
      log(vm!.getString(msgHandle));
    });
    vm.setProp(vm.global, '__log', logFn);
    logFn.dispose();

    // Run the prelude (defines __ctx, __buf, helpers, etc.)
    evalVoid(prelude, cfg.loadBudgetMs);

    // Wrap the user code so it populates __pattern.
    // Support two formats:
    //   1) Expression: ({ render(ctx){...}, meta:{...} }) — result is assigned directly
    //   2) Declaration: function render(ctx){...} — picked up from global scope
    const stripped = stripExports(transformMixedFormat(code) ?? code);
    try {
      evalVoid('var __expr = (' + stripped.replace(/;\s*$/, '') + '\n);', cfg.loadBudgetMs);
    } catch (error) {
      if (Date.now() > deadline) throw error;
      evalVoid('var __expr = null;', cfg.loadBudgetMs);
    }
    const wrapped =
      'if (__expr && typeof __expr === "object" && typeof __expr.render === "function") {\n' +
      '  __pattern = __expr;\n' +
      '} else {\n' +
      '  ' + stripped + ';\n' +
      '  __pattern = {' +
      '    meta: (typeof meta !== "undefined" ? meta : {}),' +
      '    render: (typeof render !== "undefined" ? render : null),' +
      '    init: (typeof init !== "undefined" ? init : null),' +
      '    onParam: (typeof onParam !== "undefined" ? onParam : null)' +
      '  };\n' +
      '}';
    evalVoid(wrapped, cfg.loadBudgetMs);

    // Read metadata
    const rawMeta = evalVal('JSON.stringify(__pattern.meta || {})', cfg.loadBudgetMs);
    meta = JSON.parse(String(rawMeta) || '{}') as PatternMeta;

    // Check that render() exists
    const hasRender = evalVal('!!(__pattern && __pattern.render)', cfg.loadBudgetMs);
    if (!hasRender) throw new Error('pattern has no render(ctx)');

    // Initialise parameters from meta defaults + overrides
    params = {};
    const ps = meta.params || {};
    for (const k in ps) params[k] = ps[k].default;
    Object.assign(params, initialParams);
    applyParams();

    // Reset state and run init()
    evalVoid('__resetState(); __runInit();', cfg.loadBudgetMs);
    loaded = true;

    return meta;
  }

  function setParam(name: string, value: unknown): void {
    if (!loaded) return;
    params[name] = value;
    applyParams();
    setGlobalStr('__pName', String(name));
    setGlobalStr('__pVal', JSON.stringify(value));
    try {
      evalVoid('__runParam(__pName, JSON.parse(__pVal))', 500);
    } catch (e: unknown) {
      log('onParam error: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function renderFrame(t: number, dt: number, frame: number): SandboxFrame[] | null {
    if (!loaded) return null;
    try {
      evalVoid(`__setTime(${+t},${+dt},${frame | 0}); __runRender();`, cfg.renderBudgetMs);
    } catch (e: unknown) {
      log('render error: ' + (e instanceof Error ? e.message : String(e)));
      // keep partial frame
    }
    try {
      const raw = evalVal('__bufJSON()', cfg.renderBudgetMs);
      const buf: number[] = JSON.parse(String(raw));
      const result: SandboxFrame[] = new Array(count);
      for (let i = 0; i < count; i++) {
        const o = i * 3;
        result[i] = { h: buf[o] || 0, s: buf[o + 1] || 0, b: buf[o + 2] || 0 };
      }
      return result;
    } catch {
      return null;
    }
  }

  return {
    loadPattern,
    setParam,
    renderFrame,
    dispose,
    get meta() { return meta; },
    get loaded() { return loaded; }
  };
}
