/**
 * Read BEYOND's own configuration, when wavegrid is running on the same
 * Windows box, and check it against what wavegrid is sending.
 *
 * Two settings there decide whether OSC has any effect at all, and neither is
 * observable from wavegrid's side — OSC is UDP, so a mismatch looks exactly
 * like a healthy show that produces no light:
 *   - `[OSC]` receive port, which must equal the port wavegrid sends to;
 *   - `[General] ShowRGBAPanel`, which gates the `livecontrol` colour
 *     addresses the BEYOND adapter drives.
 *
 * Key names have varied across BEYOND versions, so lookups are
 * case-insensitive and tolerate several spellings; anything not found is
 * reported as unknown rather than guessed.
 */
import type { Check } from './checks';

export type Ini = Record<string, Record<string, string>>;

/** Parse INI text into `section → key → value`, all keys lowercased. */
export function parseIni(text: string): Ini {
  const out: Ini = {};
  let section = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue;
    const header = /^\[(.+)]$/.exec(line);
    if (header) {
      section = header[1].trim().toLowerCase();
      out[section] ??= {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[section] ??= {};
    out[section][line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
  }
  return out;
}

function lookup(ini: Ini, section: string, keys: string[]): string | undefined {
  const values = ini[section.toLowerCase()];
  if (!values) return undefined;
  for (const key of keys) {
    const v = values[key.toLowerCase()];
    if (v != null && v !== '') return v;
  }
  return undefined;
}

function toBool(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return undefined;
}

export interface BeyondSettings {
  /** OSC server on/off, when the key exists. */
  oscEnabled?: boolean;
  /** The port BEYOND receives OSC on. */
  oscPort?: number;
  /** R-G-B-A panel, required for the `livecontrol` colour addresses. */
  showRgbaPanel?: boolean;
}

export function readBeyondSettings(iniText: string): BeyondSettings {
  const ini = parseIni(iniText);
  const port = lookup(ini, 'osc', ['portin', 'port', 'inport', 'oscport', 'port in']);
  const parsedPort = port != null ? parseInt(port, 10) : NaN;
  return {
    oscEnabled: toBool(lookup(ini, 'osc', ['enable', 'enabled', 'oscenable', 'active'])),
    oscPort: Number.isFinite(parsedPort) ? parsedPort : undefined,
    showRgbaPanel: toBool(lookup(ini, 'general', ['showrgbapanel', 'showrgbpanel']))
  };
}

/**
 * Where BEYOND.ini is looked for. `WAVEGRID_BEYOND_INI` wins, so an operator
 * can point at a non-standard install instead of waiting on a code change.
 */
export function beyondIniCandidates(env: NodeJS.ProcessEnv): string[] {
  const override = env.WAVEGRID_BEYOND_INI?.trim();
  if (override) return [override];
  const dirs = [env.PROGRAMDATA, env.APPDATA, env['ProgramFiles(x86)'], env.ProgramFiles]
    .filter((d): d is string => typeof d === 'string' && d !== '');
  return dirs.map((dir) => `${dir}\\Pangolin\\BEYOND\\BEYOND.ini`);
}

/** First candidate that exists, or null when BEYOND is not on this machine. */
export function findBeyondIni(env: NodeJS.ProcessEnv, exists: (path: string) => boolean): string | null {
  return beyondIniCandidates(env).find(exists) ?? null;
}

/**
 * Compare BEYOND's settings with what wavegrid sends. `sentPort` is the port
 * the project's BEYOND target is aimed at, when it has one.
 */
export function checkBeyond(settings: BeyondSettings, sentPort?: number): Check[] {
  const checks: Check[] = [];

  if (settings.oscEnabled === false) {
    checks.push({
      name: 'BEYOND OSC',
      status: 'fail',
      detail: 'BEYOND.ini has its OSC server disabled — nothing wavegrid sends is read',
      remedy: 'enable OSC in BEYOND (Settings → OSC), then restart BEYOND'
    });
  } else if (settings.oscPort != null) {
    const matches = sentPort == null || sentPort === settings.oscPort;
    checks.push(
      matches
        ? { name: 'BEYOND OSC', status: 'pass', detail: `BEYOND receives OSC on :${settings.oscPort}` }
        : {
          name: 'BEYOND OSC',
          status: 'fail',
          detail: `wavegrid sends to :${sentPort} but BEYOND receives on :${settings.oscPort} — every frame is dropped`,
          remedy: `wavegrid projects osc beyond --host <ip> --port ${settings.oscPort}`
        }
    );
  }

  if (settings.showRgbaPanel === false) {
    checks.push({
      name: 'BEYOND RGBA panel',
      status: 'fail',
      detail: 'ShowRGBAPanel=0 — BEYOND ignores the livecontrol colour addresses wavegrid drives',
      remedy: 'enable "Show R-G-B-A panel" in BEYOND settings (ShowRGBAPanel=1), then restart BEYOND'
    });
  }

  return checks;
}
