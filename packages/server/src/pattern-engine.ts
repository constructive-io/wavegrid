import type { Layout } from '@wavegrid/layout';
import { createSandboxEngine, type SandboxEngine } from '@wavegrid/sandbox';

interface HSBColor {
  h: number;
  s: number;
  b: number;
}

export class ServerPatternEngine {
  private sandbox: SandboxEngine | null = null;
  private initialization: Promise<void> | null = null;
  private _code: string | null = null;
  private params: Record<string, unknown> = {};
  private patternTime = 0;
  private lastTickMs = 0;
  private frame = 0;
  private _speed = 1;

  constructor(private readonly layout: Layout) {}

  init(): Promise<void> {
    return this.initialization ??= createSandboxEngine(this.layout).then((sandbox) => {
      this.sandbox = sandbox;
    });
  }

  set speed(value: number) { this._speed = value; }

  load(code: string, initialParams: Record<string, unknown> = {}): boolean {
    if (!this.sandbox) throw new Error('Pattern engine must be initialized before loading patterns');
    this.stop();
    try {
      const meta = this.sandbox.loadPattern(code, initialParams);
      for (const [name, param] of Object.entries(meta.params ?? {})) this.params[name] = param.default;
      Object.assign(this.params, initialParams);
      this._code = code;
      this.patternTime = 0;
      this.lastTickMs = Date.now();
      this.frame = 0;
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  setParam(name: string, value: unknown): void {
    if (!this.active) return;
    try {
      this.sandbox!.setParam(name, value);
      this.params[name] = value;
    } catch {
      this.stop();
    }
  }

  stop(): void {
    this.sandbox?.dispose();
    this._code = null;
    this.params = {};
  }

  get code(): string | null { return this._code; }
  get currentParams(): Record<string, unknown> { return { ...this.params }; }
  get active(): boolean { return this._code !== null; }

  render(grid: HSBColor[]): boolean {
    if (!this.active) return false;
    const now = Date.now();
    const dt = (now - this.lastTickMs) / 1000 * this._speed;
    this.lastTickMs = now;
    this.patternTime += dt;
    const output = this.sandbox!.renderFrame(this.patternTime, dt, ++this.frame);
    if (!output) return false;
    for (let i = 0; i < grid.length && i < output.length; i++) grid[i] = output[i];
    return true;
  }
}
