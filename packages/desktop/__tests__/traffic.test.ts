import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { captureArgs, toolkitDir } from '../src/main/traffic';

/** The toolkit as shipped in the repo, which is what the panel drives. */
const TOOLKIT = join(__dirname, '../../../tools/traffic');

describe('capture arguments', () => {
  it('always captures in the background so the panel can stop it', () => {
    expect(captureArgs({})).toEqual(['--background']);
  });

  it('passes the operator’s choices through, and only the ones they made', () => {
    expect(captureArgs({ iface: 'en7', host: '10.0.0.42', label: 'idle', seconds: 20 })).toEqual([
      '--background',
      '--iface',
      'en7',
      '--host',
      '10.0.0.42',
      '--label',
      'idle',
      '--seconds',
      '20'
    ]);
  });

  it('drops a zero duration rather than asking dumpcap to stop immediately', () => {
    expect(captureArgs({ seconds: 0 })).toEqual(['--background']);
  });
});

describe('toolkit location', () => {
  it('finds the toolkit in the repo', () => {
    expect(existsSync(join(toolkitDir(), 'bin', 'doctor'))).toBe(true);
  });
});

describe('doctor', () => {
  // Deliberately runs the real script: it is the one command that must work on a
  // machine *without* Wireshark, because its whole job is to say what's missing.
  const report = JSON.parse(
    execFileSync(join(TOOLKIT, 'bin', 'doctor'), ['--json'], { encoding: 'utf8' })
  ) as {
    os: string;
    arch: string;
    tools: { name: string; found: boolean }[];
    capturePermission: { ok: boolean; detail: string; fix: string };
  };

  it('reports this machine without needing the tools it looks for', () => {
    expect(report.os).toBeTruthy();
    expect(report.arch).toBeTruthy();
    expect(report.tools.map((t) => t.name)).toEqual([
      'tshark',
      'dumpcap',
      'capinfos',
      'editcap',
      'mergecap'
    ]);
  });

  it('either grants capture permission or says how to get it', () => {
    expect(
      report.capturePermission.ok || report.capturePermission.fix.length > 0
    ).toBe(true);
  });
});
