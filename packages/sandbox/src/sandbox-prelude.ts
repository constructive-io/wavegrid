/**
 * Sandbox prelude — runs INSIDE the QuickJS sandbox.
 *
 * Defines the pattern API (`ctx`) that user-authored patterns call.
 * Output is an HSB target buffer that the host reads back each frame.
 *
 * Pattern ABI:
 *   - `render(ctx)` — required, called once per frame
 *   - `init(ctx)`   — optional, called once when pattern loads
 *   - `onParam(name, value, ctx)` — optional, called on param change
 *   - `meta`        — optional object with { name, params }
 */
import type { Layout } from '@wavegrid/layout';

export function buildPrelude(layout: Layout): string {
  // Embed the resolved fixture geometry so patterns get true positions for
  // any topology (grid, ring, filled ring) instead of re-deriving from cols.
  const fx = layout.fixtures.map(f => [f.u, f.v, f.x, f.y, f.radius, f.angle, f.col, f.row]);
  return `
// ─── Layout geometry ───────────────────────────────────────────
var COLS = ${layout.cols}, ROWS = ${layout.rows}, COUNT = ${layout.count};
var __FX = ${JSON.stringify(fx)};

// ─── HSB target buffer: [h, s, b, h, s, b, ...] ───────────────
var __buf = []; for (var __i = 0; __i < COUNT * 3; __i++) __buf.push(0);

// ─── Internal state ────────────────────────────────────────────
var __st = {
  t: 0, dt: 0, frame: 0,
  seed: 12345,
  p: {},
  log: function(m) { __log(m); }
};

// ─── Math helpers ──────────────────────────────────────────────
function __clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function __vnoise(x, y, z) {
  x = x || 0; y = y || 0; z = z || 0;
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  var xf = x - xi, yf = y - yi, zf = z - zi;
  var u = xf * xf * (3 - 2 * xf);
  var v = yf * yf * (3 - 2 * yf);
  var w = zf * zf * (3 - 2 * zf);
  var h = function(a, b, c) {
    var n = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
  };
  var L = function(a, b, t) { return a + (b - a) * t; };
  var x00 = L(h(xi, yi, zi), h(xi + 1, yi, zi), u);
  var x10 = L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u);
  var x01 = L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u);
  var x11 = L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u);
  return L(L(x00, x10, v), L(x01, x11, v), w);
}

// ─── Build the ctx object ──────────────────────────────────────
function __buildCtx() {
  function rnd() {
    __st.seed = (__st.seed * 1664525 + 1013904223) >>> 0;
    return __st.seed / 4294967296;
  }

  function set(i, h, s, b) {
    i = i | 0;
    if (i < 0 || i >= COUNT) return;
    var o = i * 3;
    __buf[o]     = ((h % 360) + 360) % 360;
    __buf[o + 1] = __clamp(s, 0, 100);
    __buf[o + 2] = __clamp(b, 0, 100);
  }

  return {
    cols: COLS, rows: ROWS, count: COUNT,
    get t()     { return __st.t; },
    get dt()    { return __st.dt; },
    get frame() { return __st.frame; },
    get p()     { return __st.p; },

    // Fixture geometry (from the resolved layout)
    xy:    function(i) { var f = __FX[i]; if (!f) return [0, 0]; return f[6] >= 0 ? [f[6], f[7]] : [f[2], f[3]]; },
    index: function(x, y) { return ((y | 0) * COLS) + (x | 0); },
    uv:    function(i) { var f = __FX[i]; return f ? [f[0], f[1]] : [0, 0]; },
    polar: function(i) { var f = __FX[i]; return f ? [f[4], f[5]] : [0, 0]; },

    // Color setters — HSB: h=0-360, s=0-100, b=0-100
    set: set,
    setXY: function(x, y, h, s, b) { set(((y | 0) * COLS) + (x | 0), h, s, b); },
    fill:  function(h, s, b) { for (var i = 0; i < COUNT; i++) set(i, h, s, b); },
    clear: function() { for (var i = 0; i < __buf.length; i++) __buf[i] = 0; },

    // Read back
    get: function(i) {
      var o = (i | 0) * 3;
      return [__buf[o], __buf[o + 1], __buf[o + 2]];
    },

    // Math utilities
    lerp:       function(a, b, t) { return a + (b - a) * t; },
    clamp:      function(v, a, b) { return __clamp(v, a === undefined ? 0 : a, b === undefined ? 1 : b); },
    smoothstep: function(e0, e1, x) { var t = __clamp((x - e0) / ((e1 - e0) || 1), 0, 1); return t * t * (3 - 2 * t); },
    fract:      function(v) { return v - Math.floor(v); },
    map:        function(v, a, b, c, d) { return c + (d - c) * ((v - a) / ((b - a) || 1)); },
    noise:      __vnoise,
    rand:       function(a, b) {
      return a === undefined ? rnd() :
             (b === undefined ? rnd() * a : a + rnd() * (b - a));
    },
    randInt: function(a, b) { return Math.floor(a + rnd() * ((b - a) + 1)); },

    // Logging (host captures via __log)
    log: function() {
      __st.log(Array.prototype.slice.call(arguments).map(String).join(' '));
    }
  };
}

var __ctx = __buildCtx();
var __pattern = null;

// ─── Host-callable functions ───────────────────────────────────
function __setTime(t, dt, frame) {
  __st.t = t; __st.dt = dt; __st.frame = frame;
}
function __setParams(json) { __st.p = JSON.parse(json); }
function __resetState() {
  __st.t = 0; __st.frame = 0; __st.seed = 12345;
  for (var i = 0; i < __buf.length; i++) __buf[i] = 0;
}
function __runInit() { if (__pattern && __pattern.init) __pattern.init(__ctx); }
function __runRender() {
  if (__pattern && __pattern.render) { __pattern.render(__ctx); return 1; }
  return 0;
}
function __runParam(name, val) {
  if (__pattern && __pattern.onParam) __pattern.onParam(name, val, __ctx);
}
function __bufJSON() { return JSON.stringify(__buf); }
`.trim();
}
