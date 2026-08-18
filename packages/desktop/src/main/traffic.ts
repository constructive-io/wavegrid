/**
 * The Traffic panel's back end: a thin driver for the `tools/traffic` CLI.
 *
 * All the protocol archaeology lives in those shell scripts, because that is
 * where an operator (or an agent on the show laptop) actually runs it; this only
 * shells out with `--json` and hands the result to the renderer. Two rules:
 *
 *  - Nothing is checked until the panel asks. Wireshark is not a dependency of
 *    Wavegrid, so a machine without it must open every other screen normally and
 *    only see a "not installed" message here.
 *  - Passive only. The commands exposed here list, listen, capture and analyse.
 *    Nothing transmits toward the laser hardware.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type {
  TrafficCaptureFile,
  TrafficCaptureRequest,
  TrafficCaptureState,
  TrafficDiscovery,
  TrafficDoctorReport,
  TrafficInterfaceInfo,
  TrafficResult,
  TrafficSettings
} from '@/types/ipc';

/** Config file shared with the CLI, so the tab and a terminal agree. */
const CONFIG_PATH = join(homedir(), '.wavegrid', 'traffic.json');

/** A run is bounded: `discover` listens, and a wedged tshark must not hang the panel. */
const MAX_RUN_MS = 120_000;

/**
 * Where the toolkit is. In development it is in the repo; in a packaged app it
 * is copied next to the app resources. An explicit env var wins, which is how
 * you point the panel at a checkout.
 */
export function toolkitDir(): string {
  const fromEnv = process.env.WAVEGRID_TRAFFIC_TOOLKIT;
  if (fromEnv) return resolve(fromEnv);
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'traffic') : '',
    // packages/desktop/.vite/build → repo root
    resolve(__dirname, '../../../../tools/traffic'),
    resolve(process.cwd(), 'tools/traffic'),
    resolve(process.cwd(), '../../tools/traffic')
  ];
  return candidates.find((dir) => dir && existsSync(join(dir, 'bin', 'doctor'))) ?? candidates[1];
}

export function readSettings(): TrafficSettings {
  let captureDir = '';
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as { captureDir?: unknown };
    if (typeof raw.captureDir === 'string') captureDir = raw.captureDir;
  } catch {
    // No config yet (or unreadable) — the toolkit's own default applies.
  }
  const toolkit = toolkitDir();
  return {
    captureDir: captureDir || join(toolkit, 'captures'),
    configPath: CONFIG_PATH,
    toolkitDir: toolkit,
    toolkitFound: existsSync(join(toolkit, 'bin', 'doctor'))
  };
}

export function writeSettings(captureDir: string): TrafficSettings {
  const dir = captureDir.trim();
  if (dir) {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, `${JSON.stringify({ captureDir: dir }, null, 2)}\n`);
  }
  return readSettings();
}

/** Run one toolkit command. Never throws: the panel shows failures as text. */
export function run(command: string, args: string[] = []): Promise<TrafficResult> {
  const toolkit = toolkitDir();
  const script = join(toolkit, 'bin', command);
  if (!existsSync(script)) {
    return Promise.resolve({
      ok: false,
      stdout: '',
      stderr: `traffic toolkit not found at ${toolkit} — set WAVEGRID_TRAFFIC_TOOLKIT to its path`
    });
  }

  return new Promise((done) => {
    const child = spawn(script, args, {
      cwd: toolkit,
      env: { ...process.env, TRAFFIC_CAPTURE_DIR: readSettings().captureDir }
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), MAX_RUN_MS);
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (err: Error) => {
      clearTimeout(timer);
      done({ ok: false, stdout, stderr: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ ok: code === 0, stdout, stderr });
    });
  });
}

/** Run a command that speaks `--json`. Null when it failed or printed nothing parseable. */
export async function runJson<T>(command: string, args: string[] = []): Promise<T | null> {
  const result = await run(command, ['--json', ...args]);
  if (!result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return null;
  }
}

/** Build `capture` arguments from the panel's form. Exported for testing. */
export function captureArgs(req: TrafficCaptureRequest): string[] {
  const args = ['--background'];
  if (req.iface) args.push('--iface', req.iface);
  if (req.host) args.push('--host', req.host);
  if (req.label) args.push('--label', req.label);
  if (req.seconds && req.seconds > 0) args.push('--seconds', String(Math.round(req.seconds)));
  return args;
}

export function trafficDoctor(): Promise<TrafficDoctorReport | null> {
  return runJson<TrafficDoctorReport>('doctor');
}

export async function trafficInterfaces(host?: string): Promise<TrafficInterfaceInfo[]> {
  const payload = await runJson<{ interfaces: TrafficInterfaceInfo[] }>(
    'interfaces',
    host ? ['--host', host] : []
  );
  return payload?.interfaces ?? [];
}

export function trafficDiscover(iface?: string, seconds = 10): Promise<TrafficDiscovery | null> {
  const args = ['--seconds', String(Math.round(seconds))];
  if (iface) args.push('--iface', iface);
  return runJson<TrafficDiscovery>('discover', args);
}

export function startCapture(req: TrafficCaptureRequest): Promise<TrafficCaptureState | null> {
  return runJson<TrafficCaptureState>('capture', captureArgs(req));
}

export function stopCapture(): Promise<TrafficCaptureState | null> {
  return runJson<TrafficCaptureState>('capture', ['--stop']);
}

export function captureState(): Promise<TrafficCaptureState | null> {
  return runJson<TrafficCaptureState>('capture', ['--status']);
}

/** Captures on disk, newest first, with the label the operator gave each one. */
export function listCaptures(): TrafficCaptureFile[] {
  const dir = readSettings().captureDir;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.pcapng'))
    .map((name) => {
      const path = join(dir, name);
      const info = statSync(path);
      // <timestamp>-<label>.pcapng, as written by bin/capture.
      const label = name.replace(/\.pcapng$/, '').replace(/^\d{8}-\d{6}-?/, '');
      return { name, path, label, bytes: info.size, modified: info.mtimeMs };
    })
    .sort((a, b) => b.modified - a.modified);
}

/** A capture's own summary, as the CLI prints it. */
export function analyzeCapture(path: string, host?: string): Promise<TrafficResult> {
  return run('analyze', host ? [path, '--host', host] : [path]);
}

/** Byte-level diff of two captures — which offsets encode what changed. */
export function compareCaptures(a: string, b: string, host?: string): Promise<TrafficResult> {
  return run('compare', host ? [a, b, '--host', host] : [a, b]);
}
