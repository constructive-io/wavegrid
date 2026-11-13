/**
 * Unified → per-device routing generation.
 *
 * A show is authored ONCE, globally: every cannon in global logical order
 * (`0…count-1`), each pointing at the machine + hardware that drives it. What a
 * given laptop's receiver actually needs is a *different* file, because two
 * things re-base per device:
 *
 *   1. **Grid indices.** A sharded receiver slices the global grid, so its
 *      output array starts at 0 — cannon 25 of a 49-cannon show is index 0 on
 *      the laptop that owns shard 25–48.
 *   2. **BEYOND zones.** Zone numbering restarts per machine (`/beyond/zone/n`),
 *      so the 26th global cannon is zone 0 (or 1) on its own PC.
 *
 * Hand-maintaining both re-basings is where installs go wrong — the classic
 * failure is feeding a device-local file back in as if it were global (a
 * "double re-base"), which silently lights the wrong lasers. So: author the
 * unified spec, generate the rest, and validate loudly.
 *
 * A one-laptop show is the degenerate case: one device, no shard, zones
 * `0…count-1`. Generation is a no-op you never have to think about.
 */

import type { FixtureKind, ShardConfig } from './types';

/** Where a cannon's OSC goes: a BEYOND PC or an FB4 box. */
export interface RoutingTarget {
  type: 'beyond' | 'fb4';
  host: string;
  port: number;
}

/** A cannon in the unified spec. `logical` is the GLOBAL index. */
export interface UnifiedCannon {
  /** Global logical index, 0-based. */
  logical: number;
  /** Key into `UnifiedRouting.targets`. */
  target: string;
  label?: string;
  row?: number;
  col?: number;
  /** Required for `fb4` targets — FB4 addresses by serial, not by index. */
  fb4Serial?: string;
  /**
   * Zone number as physically installed, when the hardware is scrambled and
   * can't be renumbered. Overrides the generated zone for this cannon; the
   * generator then routes around it so nothing collides.
   */
  projectorIndex?: number;
  /** Intentionally dark in software (rig repair, permit limits). */
  safeDisabled?: boolean;
  /**
   * Cannon (default) or projector. Projectors must drive a `beyond` target:
   * the FB4 OSC colour addresses are the box's persistent colour-balance
   * settings, which on a calibrated projector would silently detune it.
   */
  kind?: FixtureKind;
}

/**
 * The authoritative, global routing spec. Note what's *absent*: no shard, no
 * per-device zone numbering. Those are generated, never authored.
 */
export interface UnifiedRouting {
  targets: Record<string, RoutingTarget>;
  /** One entry per cannon, covering global logical 0…count-1 exactly once. */
  cannons: UnifiedCannon[];
  /** OSC send rate. Default 30. */
  flushHz?: number;
  /**
   * What the first BEYOND zone on each machine is called. Explicit because
   * installs differ and guessing costs a show: 0 (BEYOND's own default) or 1
   * (rigs whose zone list was set up 1-based).
   */
  zoneBase?: 0 | 1;
}

/** A device to generate for: its name and the global slice it drives. */
export interface RoutingDevice {
  /** Device name/id — used as the output file's identity, not sent anywhere. */
  name: string;
  /** Global slice, inclusive. Omit for a device that drives the whole show. */
  shard?: ShardConfig;
}

/** A cannon in a generated, device-local config (what a receiver consumes). */
export interface DeviceCannon {
  /** DEVICE-LOCAL index: position in this receiver's sliced output array. */
  logical: number;
  target: string;
  label?: string;
  row?: number;
  col?: number;
  fb4Serial?: string;
  projectorIndex?: number;
  safeDisabled?: boolean;
  kind?: FixtureKind;
  /** The global index this came from — provenance, ignored by the runtime. */
  globalLogical: number;
}

/** Structurally a `RoutingConfig` from @wavegrid/osc, plus provenance. */
export interface DeviceRouting {
  targets: Record<string, RoutingTarget>;
  cannons: DeviceCannon[];
  flushHz?: number;
  /** Provenance so a file on disk is never mistaken for the unified spec. */
  generated: {
    device: string;
    shard: ShardConfig | null;
    zoneBase: 0 | 1;
    /** Global cannon count the unified spec covered. */
    globalCount: number;
  };
}

export interface GenerateRoutingResult {
  devices: DeviceRouting[];
  /** Non-fatal notes (e.g. a target nobody drives on this device). */
  warnings: string[];
}

export class RoutingValidationError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid routing spec:\n  - ${problems.join('\n  - ')}`);
    this.name = 'RoutingValidationError';
    this.problems = problems;
  }
}

/**
 * True when `spec` looks like a config that has ALREADY been re-based for one
 * device — the double-rebase footgun. A unified spec must cover every global
 * index, so a config that carries `generated` provenance, or whose cannon count
 * is short of the layout while its indices still start at 0, is device-local.
 */
export function looksDeviceLocal(spec: UnifiedRouting, globalCount: number): boolean {
  if ('generated' in spec) return true;
  return spec.cannons.length > 0 && spec.cannons.length < globalCount;
}

/** Every problem with the unified spec, in report order. Empty = valid. */
export function validateUnifiedRouting(spec: UnifiedRouting, globalCount: number): string[] {
  const problems: string[] = [];

  if ('generated' in spec) {
    problems.push(
      'This config was generated for a single device (it carries `generated` provenance) — ' +
        're-basing it again would light the wrong fixtures. Edit the unified spec instead.'
    );
  }

  if (spec.zoneBase !== undefined && spec.zoneBase !== 0 && spec.zoneBase !== 1) {
    problems.push(`zoneBase must be 0 or 1, got ${String(spec.zoneBase)}.`);
  }

  const targetNames = Object.keys(spec.targets ?? {});
  if (targetNames.length === 0) problems.push('No targets defined.');
  for (const [name, target] of Object.entries(spec.targets ?? {})) {
    if (target.type !== 'beyond' && target.type !== 'fb4') {
      problems.push(`Target "${name}" has unknown type "${String(target.type)}" (beyond | fb4).`);
    }
    if (!target.host) problems.push(`Target "${name}" has no host.`);
    if (!Number.isInteger(target.port) || target.port <= 0) {
      problems.push(`Target "${name}" has an invalid port (${String(target.port)}).`);
    }
  }

  const seen = new Set<number>();
  for (const cannon of spec.cannons ?? []) {
    if (!Number.isInteger(cannon.logical) || cannon.logical < 0 || cannon.logical >= globalCount) {
      problems.push(
        `Cannon logical ${String(cannon.logical)} is outside the show (0–${globalCount - 1}).`
      );
      continue;
    }
    if (seen.has(cannon.logical)) {
      problems.push(`Cannon logical ${cannon.logical} appears more than once.`);
      continue;
    }
    seen.add(cannon.logical);

    const target = spec.targets?.[cannon.target];
    if (!target) {
      problems.push(`Cannon ${cannon.logical} points at unknown target "${cannon.target}".`);
      continue;
    }
    if (cannon.kind !== undefined && cannon.kind !== 'cannon' && cannon.kind !== 'projector') {
      problems.push(`Cannon ${cannon.logical} has unknown kind "${String(cannon.kind)}" (cannon | projector).`);
    }
    if (target.type === 'fb4' && cannon.kind === 'projector') {
      problems.push(
        `Projector ${cannon.logical} drives FB4 target "${cannon.target}" — FB4 OSC colour is a persistent ` +
          'colour-balance setting, not live colour. Route projectors to a BEYOND target.'
      );
    }
    if (target.type === 'fb4' && !cannon.fb4Serial && !cannon.safeDisabled) {
      problems.push(`Cannon ${cannon.logical} drives FB4 target "${cannon.target}" but has no fb4Serial.`);
    }
    if (
      cannon.projectorIndex !== undefined &&
      (!Number.isInteger(cannon.projectorIndex) || cannon.projectorIndex < 0)
    ) {
      problems.push(`Cannon ${cannon.logical} has an invalid projectorIndex override.`);
    }
  }

  for (let i = 0; i < globalCount; i++) {
    if (!seen.has(i)) problems.push(`Cannon ${i} is missing — the unified spec must cover the whole show.`);
  }

  return problems;
}

export interface ShardCheckOptions {
  /**
   * Treat a fixture no device drives as an error. On when checking a whole
   * installation (`wavegrid projects routing generate`), off when generating
   * one laptop's file in isolation — the other laptops just aren't listed.
   */
  requireCoverage?: boolean;
}

/** Every problem with a set of device shards against a show of `globalCount`. */
export function validateShards(
  devices: readonly RoutingDevice[],
  globalCount: number,
  opts: ShardCheckOptions = {}
): string[] {
  const problems: string[] = [];
  const owner = new Map<number, string>();

  for (const device of devices) {
    const shard = device.shard;
    if (!shard) {
      // A device with no shard drives everything; that only makes sense alone.
      if (devices.length > 1) {
        problems.push(
          `Device "${device.name}" has no shard, but ${devices.length} devices are configured — ` +
            'it would drive fixtures the others already own.'
        );
      }
      continue;
    }
    if (!Number.isInteger(shard.start) || !Number.isInteger(shard.end) || shard.start < 0) {
      problems.push(`Device "${device.name}" has a malformed shard.`);
      continue;
    }
    if (shard.end < shard.start) {
      problems.push(`Device "${device.name}" has shard ${shard.start}–${shard.end} (end before start).`);
      continue;
    }
    if (shard.end >= globalCount) {
      problems.push(
        `Device "${device.name}" shard ${shard.start}–${shard.end} runs past the last fixture (${globalCount - 1}).`
      );
      continue;
    }
    for (let i = shard.start; i <= shard.end; i++) {
      const existing = owner.get(i);
      if (existing !== undefined) {
        problems.push(`Fixture ${i} is claimed by both "${existing}" and "${device.name}".`);
        continue;
      }
      owner.set(i, device.name);
    }
  }

  if (opts.requireCoverage === true) {
    const uncovered = uncoveredFixtures(devices, globalCount);
    if (uncovered.length > 0) {
      problems.push(
        `No device drives fixture${uncovered.length > 1 ? 's' : ''} ${summarizeRanges(uncovered)}.`
      );
    }
  }

  return problems;
}

/** Global indices no listed device drives (shard gaps). */
export function uncoveredFixtures(devices: readonly RoutingDevice[], globalCount: number): number[] {
  if (devices.some((d) => !d.shard)) return [];
  const covered = new Set<number>();
  for (const device of devices) {
    const shard = device.shard;
    if (!shard) continue;
    for (let i = Math.max(0, shard.start); i <= Math.min(globalCount - 1, shard.end); i++) covered.add(i);
  }
  const out: number[] = [];
  for (let i = 0; i < globalCount; i++) if (!covered.has(i)) out.push(i);
  return out;
}

/** "0–3, 7, 12–14" — compact enough for a CLI line or an error message. */
export function summarizeRanges(values: readonly number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  const flush = () => {
    if (start == null || prev == null) return;
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
  };
  for (const v of sorted) {
    if (start == null) {
      start = v;
    } else if (prev != null && v !== prev + 1) {
      flush();
      start = v;
    }
    prev = v;
  }
  flush();
  return parts.join(', ');
}

/**
 * Generate one device-local routing config per device from the unified spec.
 *
 * ```
 * generateDeviceRouting(spec, [{name:'pc-a', shard:{start:0,end:24}},
 *                              {name:'pc-b', shard:{start:25,end:48}}], 49)
 * //  pc-b: global 25 → { logical: 0, projectorIndex: 0 }   ← both re-based
 * ```
 *
 * Throws `RoutingValidationError` rather than emitting a config that would
 * light the wrong fixtures.
 */
export function generateDeviceRouting(
  spec: UnifiedRouting,
  devices: readonly RoutingDevice[],
  globalCount: number,
  opts: ShardCheckOptions = {}
): GenerateRoutingResult {
  const problems = [
    ...validateUnifiedRouting(spec, globalCount),
    ...validateShards(devices, globalCount, opts)
  ];
  if (devices.length === 0) problems.push('No devices to generate for.');
  if (problems.length > 0) throw new RoutingValidationError(problems);

  const zoneBase: 0 | 1 = spec.zoneBase ?? 0;
  const byLogical = new Map<number, UnifiedCannon>();
  for (const cannon of spec.cannons) byLogical.set(cannon.logical, cannon);

  const warnings: string[] = [];
  const out: DeviceRouting[] = [];

  // Generating one laptop's file at a time is normal, so a gap is only fatal
  // when the caller asked for the whole installation — otherwise just say it.
  if (opts.requireCoverage !== true) {
    const uncovered = uncoveredFixtures(devices, globalCount);
    if (uncovered.length > 0) {
      warnings.push(
        `No listed device drives fixture${uncovered.length > 1 ? 's' : ''} ${summarizeRanges(uncovered)}.`
      );
    }
  }

  for (const device of devices) {
    const shard = device.shard ?? null;
    const start = shard ? shard.start : 0;
    const end = shard ? shard.end : globalCount - 1;

    // Zones restart per machine, and per target within it: two BEYOND PCs each
    // number their own zone list from `zoneBase`.
    const nextZone = new Map<string, number>();
    const takenZones = new Map<string, Set<number>>();
    for (let global = start; global <= end; global++) {
      const cannon = byLogical.get(global);
      if (!cannon || cannon.projectorIndex === undefined) continue;
      const taken = takenZones.get(cannon.target) ?? new Set<number>();
      if (taken.has(cannon.projectorIndex)) {
        problems.push(
          `Device "${device.name}" target "${cannon.target}" has two fixtures pinned to zone ${cannon.projectorIndex}.`
        );
      }
      taken.add(cannon.projectorIndex);
      takenZones.set(cannon.target, taken);
    }
    if (problems.length > 0) throw new RoutingValidationError(problems);

    const targets: Record<string, RoutingTarget> = {};
    const cannons: DeviceCannon[] = [];

    for (let global = start; global <= end; global++) {
      const cannon = byLogical.get(global);
      if (!cannon) continue; // validation guarantees coverage; belt and braces
      targets[cannon.target] = spec.targets[cannon.target];

      const target = spec.targets[cannon.target];
      let projectorIndex: number | undefined;
      if (cannon.projectorIndex !== undefined) {
        projectorIndex = cannon.projectorIndex; // pinned to the hardware as installed
      } else if (target.type === 'beyond') {
        const taken = takenZones.get(cannon.target) ?? new Set<number>();
        let zone = nextZone.get(cannon.target) ?? zoneBase;
        while (taken.has(zone)) zone += 1;
        projectorIndex = zone;
        nextZone.set(cannon.target, zone + 1);
      }

      cannons.push({
        logical: global - start, // ← the device-local re-base
        globalLogical: global,
        target: cannon.target,
        ...(cannon.label !== undefined ? { label: cannon.label } : {}),
        ...(cannon.row !== undefined ? { row: cannon.row } : {}),
        ...(cannon.col !== undefined ? { col: cannon.col } : {}),
        ...(cannon.fb4Serial !== undefined ? { fb4Serial: cannon.fb4Serial } : {}),
        ...(projectorIndex !== undefined ? { projectorIndex } : {}),
        ...(cannon.safeDisabled ? { safeDisabled: true } : {}),
        ...(cannon.kind !== undefined ? { kind: cannon.kind } : {})
      });
    }

    const unused = Object.keys(spec.targets).filter((name) => targets[name] === undefined);
    for (const name of unused) {
      warnings.push(`Device "${device.name}" drives nothing on target "${name}" — omitted from its config.`);
    }

    out.push({
      targets,
      cannons,
      ...(spec.flushHz !== undefined ? { flushHz: spec.flushHz } : {}),
      generated: { device: device.name, shard, zoneBase, globalCount }
    });
  }

  return { devices: out, warnings };
}

/**
 * The obvious unified spec for a show that hangs off one machine: every cannon
 * on one target, in logical order. What `wavegrid projects osc` produces for a
 * simple install, so simple shows never hand-write a spec.
 */
export function unifiedRoutingForSingleTarget(
  target: RoutingTarget,
  globalCount: number,
  opts: { targetName?: string; labels?: readonly string[]; serials?: readonly string[]; zoneBase?: 0 | 1 } = {}
): UnifiedRouting {
  const name = opts.targetName ?? 'local';
  return {
    targets: { [name]: target },
    zoneBase: opts.zoneBase ?? 0,
    cannons: Array.from({ length: globalCount }, (_, i) => ({
      logical: i,
      target: name,
      ...(opts.labels?.[i] !== undefined ? { label: opts.labels[i] } : {}),
      ...(opts.serials?.[i] !== undefined ? { fb4Serial: opts.serials[i] } : {})
    }))
  };
}
