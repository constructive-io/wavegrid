import { chmodSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { WavegridConfig } from '@wavegrid/layout';

import {
  checkEnvHijack,
  checkOsc,
  checkShard,
  isSecureMode,
  oscEndpoint,
  overallStatus
} from '../src/checks';
import { dirWritable } from '../src/collect';

function config(osc: WavegridConfig['osc']): WavegridConfig {
  return {
    layout: { preset: 'ring-6' },
    mode: 'auto',
    simpleModeMax: 40,
    server: { host: '0.0.0.0', port: 3000 },
    ui: { port: 3003 },
    receiver: { alpha: 0.06, fallbackDelay: 3000 },
    osc,
    sync: { enabled: true, secrets: false },
    debug: { osc: false }
  };
}

const beyondless = config({});

describe('checkEnvHijack', () => {
  it('passes when no generic port/host vars are set', () => {
    const check = checkEnvHijack({});
    expect(check.status).toBe('pass');
  });

  it('warns and lists the ignored vars when a bare PORT is set', () => {
    const check = checkEnvHijack({ PORT: '5000', HOST: '0.0.0.0' });
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('PORT=5000');
    expect(check.detail).toContain('HOST=0.0.0.0');
    expect(check.remedy).toContain('unset PORT HOST');
  });
});

describe('checkShard', () => {
  it('passes with no shard', () => {
    expect(checkShard(6, undefined).status).toBe('pass');
  });

  it('passes for an in-range shard', () => {
    expect(checkShard(49, { start: 0, end: 24 }).status).toBe('pass');
  });

  it('fails when the end exceeds the cannon count', () => {
    const check = checkShard(49, { start: 40, end: 60 });
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('end 60 ≥ count 49');
  });

  it('fails when start > end', () => {
    expect(checkShard(49, { start: 30, end: 10 }).status).toBe('fail');
  });
});

describe('isSecureMode', () => {
  it('accepts 0600 and rejects group/other-readable modes', () => {
    expect(isSecureMode(0o600)).toBe(true);
    expect(isSecureMode(0o644)).toBe(false);
    expect(isSecureMode(0o640)).toBe(false);
  });
});

describe('checkOsc', () => {
  const beyond = config({ beyond: { host: '10.0.0.5', port: 8000, gridOrder: 'row' } });

  it('warns when no target is configured', () => {
    expect(checkOsc(beyondless).status).toBe('warn');
  });

  it('fails when the port rejected the probe — the silent-drop case', () => {
    const check = checkOsc(beyond, 'refused');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('nothing listening');
    expect(check.remedy).toContain('--port');
  });

  it('warns when the host is unreachable rather than failing the show', () => {
    expect(checkOsc(beyond, 'unreachable').status).toBe('warn');
  });

  it('passes when nothing rejected the probe, without claiming delivery', () => {
    const check = checkOsc(beyond, 'no-rejection');
    expect(check.status).toBe('pass');
    expect(check.detail).toContain('no delivery proof');
  });

  it('says so when the target was not probed', () => {
    expect(checkOsc(beyond).detail).toContain('not probed');
  });

  it('reads the FB4 target when there is no BEYOND one', () => {
    const check = checkOsc(config({ fb4: { host: '10.0.0.9', port: 8000 } }), 'refused');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('FB4 → 10.0.0.9:8000');
  });
});

describe('oscEndpoint', () => {
  it('prefers BEYOND, then FB4, and gives up on a routing file', () => {
    expect(oscEndpoint(config({ beyond: { host: 'b', port: 8000, gridOrder: 'row' }, fb4: { host: 'f', port: 8000 } })))
      .toMatchObject({ kind: 'BEYOND', host: 'b' });
    expect(oscEndpoint(config({ fb4: { host: 'f', port: 8000 } }))).toMatchObject({ kind: 'FB4' });
    expect(oscEndpoint(config({ routingConfig: '/tmp/routing.json' }))).toBeNull();
  });
});

describe('overallStatus', () => {
  it('reports the worst status across checks', () => {
    expect(overallStatus([{ name: 'a', status: 'pass', detail: '' }])).toBe('pass');
    expect(overallStatus([
      { name: 'a', status: 'pass', detail: '' },
      { name: 'b', status: 'warn', detail: '' }
    ])).toBe('warn');
    expect(overallStatus([
      { name: 'a', status: 'warn', detail: '' },
      { name: 'b', status: 'fail', detail: '' }
    ])).toBe('fail');
  });
});

describe('dirWritable', () => {
  it('accepts an existing writable dir', () => {
    expect(dirWritable(tmpdir())).toBe(true);
  });

  it('accepts a not-yet-created dir whose ancestor is writable (subdirs are lazy)', () => {
    expect(dirWritable(join(tmpdir(), 'wg-doctor-does-not-exist', 'state'))).toBe(true);
  });

  it('rejects a dir under a read-only ancestor', () => {
    const root = mkdtempSync(join(tmpdir(), 'wg-ro-'));
    chmodSync(root, 0o500);
    try {
      expect(dirWritable(join(root, 'state'))).toBe(false);
    } finally {
      chmodSync(root, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
