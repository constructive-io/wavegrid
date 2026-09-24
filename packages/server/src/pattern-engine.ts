/**
 * Server-side pattern engine: evaluates evalPattern code locally
 * so the UI grid preview stays in sync (same as animations/scenes).
 *
 * Uses Node's Function constructor — not sandboxed, but patterns
 * come from the trusted UI so this is acceptable for preview purposes.
 */

import type { Layout } from '@wavegrid/layout';

interface HSBColor {
  h: number;
  s: number;
  b: number;
}

interface PatternObj {
  render: (ctx: PatternCtx) => void;
  init?: (ctx: PatternCtx) => void;
  onParam?: (name: string, value: unknown, ctx: PatternCtx) => void;
  meta?: { name?: string; params?: Record<string, { default: unknown }> };
}

interface PatternCtx {
  t: number;
  frame: number;
  count: number;
  cols: number;
  rows: number;
  p: Record<string, unknown>;
  set: (idx: number, h: number, s: number, b: number) => void;
  get: (idx: number) => [number, number, number];
  fill: (h: number, s: number, b: number) => void;
  uv: (idx: number) => [number, number];
  xy: (idx: number) => [number, number];
  polar: (idx: number) => [number, number];
  noise: (x: number, y: number, z: number) => number;
  smoothstep: (edge0: number, edge1: number, x: number) => number;
}

export class ServerPatternEngine {
  private pattern: PatternObj | null = null;
  private _patternTime: number = 0;
  private _lastTickMs: number = 0;
  private gridSize: number;
  private cols: number;
  private rows: number;
  private layout: Layout;
  private _speed: number = 1.0;
  private params: Record<string, unknown> = {};
  private _code: string | null = null;

  constructor(layout: Layout) {
    this.layout = layout;
    this.cols = layout.cols;
    this.rows = layout.rows;
    this.gridSize = layout.count;
  }

  /** Set speed multiplier for pattern time (1.0 = normal). */
  set speed(v: number) { this._speed = v; }

  /**
   * Load a pattern from code string. Returns true if successful.
   */
  load(code: string, initialParams: Record<string, unknown> = {}): boolean {
    try {
      const result = this.evaluate(code);
      if (result && typeof result === 'object' && typeof (result as Record<string, unknown>).render === 'function') {
        this.pattern = result as unknown as PatternObj;
        this._code = code;
        this._patternTime = 0;
        this._lastTickMs = Date.now();
        this.params = {};
        const declared = this.pattern.meta?.params ?? {};
        for (const k of Object.keys(declared)) this.params[k] = declared[k].default;
        Object.assign(this.params, initialParams);
        if (this.pattern.init) {
          const ctx = this.makeCtx(new Array(this.gridSize).fill(null).map(() => ({ h: 0, s: 0, b: 0 })));
          try { this.pattern.init(ctx); } catch { /* ignore init errors */ }
        }
        return true;
      }
      return false;
    } catch {
      this.pattern = null;
      return false;
    }
  }

  /**
   * Evaluate pattern code, handling multiple formats:
   * 1. Standard expression: ({ render(ctx){...} })
   * 2. IIFE: (function(){ ... return { render... }; })()
   * 3. Mixed (Pride patterns): ({ var COLORS...; function foo(){}; render: function(ctx){...} })
   *    — var/function decls inside object literal (invalid JS, valid in QuickJS)
   */
  private evaluate(code: string): unknown {
    // First, try direct evaluation (handles formats 1 and 2)
    try {
      // eslint-disable-next-line no-new-func
      const factory = new Function(`return (${code});`);
      return factory();
    } catch {
      // Fall through to transformation
    }

    // Transform mixed format: extract var/function declarations from inside ({ ... })
    // and wrap as an IIFE: (function() { <declarations>; return { <remaining> }; })()
    const transformed = this.transformMixedFormat(code);
    if (transformed) {
      try {
        // eslint-disable-next-line no-new-func
        const factory = new Function(`return (${transformed});`);
        return factory();
      } catch {
        // Fall through
      }
    }

    // Last resort: try evaluating as statements and grab render from scope
    try {
      // eslint-disable-next-line no-new-func
      const factory = new Function(`${code}; return { render: typeof render !== 'undefined' ? render : null, meta: typeof meta !== 'undefined' ? meta : {} };`);
      return factory();
    } catch {
      return null;
    }
  }

  /**
   * Transform patterns that have var/function declarations inside an object literal.
   * Input:  ({ var X = [...]; function foo(){} render: function(ctx){...}, meta: {...} })
   * Output: (function(){ var X = [...]; function foo(){} return { render: function(ctx){...}, meta: {...} }; })()
   *
   * Strategy: find the first object property (word followed by colon + space/function)
   * that ISN'T inside a var/function declaration. Everything before is declarations,
   * everything from that point on is the object body.
   */
  private transformMixedFormat(code: string): string | null {
    const trimmed = code.trim();
    if (!trimmed.startsWith('({') || !trimmed.endsWith('})')) return null;

    // Extract the inner content (between ({ and }))
    const inner = trimmed.slice(2, -2);

    // Find where the object properties start by scanning for the first line
    // that looks like an object property key (e.g. "render:" or "meta:")
    // while skipping lines that are part of var/function declarations
    const lines = inner.split('\n');
    let splitIdx = -1;
    let inDecl = false;
    let bracketDepth = 0;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimLine = lines[i].trim();

      if (inDecl) {
        bracketDepth += (lines[i].match(/\[/g) || []).length;
        bracketDepth -= (lines[i].match(/\]/g) || []).length;
        braceDepth += (lines[i].match(/\{/g) || []).length;
        braceDepth -= (lines[i].match(/\}/g) || []).length;
        if (bracketDepth <= 0 && braceDepth <= 0) {
          inDecl = false;
        }
        continue;
      }

      if (!trimLine || trimLine.startsWith('//')) continue;

      if (trimLine.startsWith('var ') || trimLine.startsWith('let ') ||
          trimLine.startsWith('const ') || trimLine.startsWith('function ')) {
        // Start of a declaration — track depth
        bracketDepth = (lines[i].match(/\[/g) || []).length - (lines[i].match(/\]/g) || []).length;
        braceDepth = (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
        if (bracketDepth > 0 || braceDepth > 0) {
          inDecl = true;
        }
        continue;
      }

      // This line is not a declaration start and not inside one — it's the first property
      // Verify it looks like an object property (word: or word()  pattern)
      if (/^[a-zA-Z_$]/.test(trimLine)) {
        splitIdx = i;
        break;
      }
    }

    if (splitIdx <= 0) return null;

    const declCode = lines.slice(0, splitIdx).join('\n');
    const propCode = lines.slice(splitIdx).join('\n');
    return `(function(){\n${declCode}\nreturn {${propCode}};\n})()`;
  }

  /** Same as the receiver's setPatternParam: update `ctx.p` and tell the pattern. */
  setParam(name: string, value: unknown): void {
    if (!this.pattern) return;
    this.params[name] = value;
    if (this.pattern.onParam) {
      const ctx = this.makeCtx(new Array(this.gridSize).fill(null).map(() => ({ h: 0, s: 0, b: 0 })), false);
      try { this.pattern.onParam(name, value, ctx); } catch { /* ignore onParam errors */ }
    }
  }

  /**
   * Stop the current pattern.
   */
  stop(): void {
    this.pattern = null;
    this._code = null;
    this.params = {};
  }

  /** Source of the loaded pattern, or null when none is running. */
  get code(): string | null {
    return this.pattern ? this._code : null;
  }

  /** Copy of the current `ctx.p`, so late-joining UIs can pick up where the pattern is. */
  get currentParams(): Record<string, unknown> {
    return { ...this.params };
  }

  /**
   * Returns true if a pattern is currently loaded.
   */
  get active(): boolean {
    return this.pattern !== null;
  }

  /**
   * Render one frame into the provided grid array.
   * Modifies grid in-place. Returns true if a pattern was rendered.
   */
  render(grid: HSBColor[]): boolean {
    if (!this.pattern) return false;

    const ctx = this.makeCtx(grid);
    try {
      this.pattern.render(ctx);
      return true;
    } catch {
      // Pattern crashed — stop it
      this.pattern = null;
      return false;
    }
  }

  private makeCtx(grid: HSBColor[], advance = true): PatternCtx {
    const now = Date.now();
    if (advance) {
      const wallDt = (now - this._lastTickMs) / 1000;
      this._lastTickMs = now;
      this._patternTime += wallDt * this._speed;
    }
    const elapsed = this._patternTime;
    const cols = this.cols;
    const rows = this.rows;
    const count = this.gridSize;
    const fixtures = this.layout.fixtures;

    return {
      t: elapsed,
      frame: Math.floor(elapsed * 60),
      count,
      cols,
      rows,
      p: this.params,
      set(idx: number, h: number, s: number, b: number) {
        if (idx >= 0 && idx < count) {
          const hh = Number.isFinite(h) ? ((h % 360) + 360) % 360 : 0;
          const ss = Number.isFinite(s) ? Math.max(0, Math.min(100, s)) : 0;
          const bb = Number.isFinite(b) ? Math.max(0, Math.min(100, b)) : 0;
          grid[idx] = { h: hh, s: ss, b: bb };
        }
      },
      get(idx: number): [number, number, number] {
        if (idx >= 0 && idx < count) {
          const c = grid[idx];
          return [c.h, c.s, c.b];
        }
        return [0, 0, 0];
      },
      fill(h: number, s: number, b: number) {
        const hh = Number.isFinite(h) ? ((h % 360) + 360) % 360 : 0;
        const ss = Number.isFinite(s) ? Math.max(0, Math.min(100, s)) : 0;
        const bb = Number.isFinite(b) ? Math.max(0, Math.min(100, b)) : 0;
        for (let i = 0; i < count; i++) {
          grid[i] = { h: hh, s: ss, b: bb };
        }
      },
      uv(idx: number): [number, number] {
        const f = fixtures[idx];
        return f ? [f.u, f.v] : [0, 0];
      },
      xy(idx: number): [number, number] {
        const f = fixtures[idx];
        if (!f) return [0, 0];
        return f.col >= 0 ? [f.col, f.row] : [f.x, f.y];
      },
      polar(idx: number): [number, number] {
        const f = fixtures[idx];
        return f ? [f.radius, f.angle] : [0, 0];
      },
      noise(x: number, y: number, z: number): number {
        // Simple deterministic hash-based noise (0-1 range)
        const dot = x * 12.9898 + y * 78.233 + z * 37.719;
        const s = Math.sin(dot) * 43758.5453;
        return s - Math.floor(s);
      },
      smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
    };
  }
}
