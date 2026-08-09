/**
 * Network diagnostics for the Status screen's Advanced section. Same collector
 * the CLI uses, so the app and the terminal agree about why a phone can't load
 * the show. Runs in the main process because it needs the OS interface list and
 * the in-process server's record of who has connected.
 */
import { probeNetwork } from '@wavegrid/doctor';
import { lanVisitors } from '@wavegrid/server';

import { runningBind } from '@/main/brain';
import type { NetworkReport } from '@/types/ipc';

export async function buildNetworkReport(): Promise<NetworkReport | null> {
  const bind = runningBind();
  if (!bind) return null;
  const report = await probeNetwork({
    bindHost: bind.host,
    port: bind.port,
    visitors: lanVisitors().map((v) => ({
      address: v.address,
      userAgent: v.userAgent,
      lastSeen: v.lastSeen
    }))
  });
  return {
    bindHost: report.bindHost,
    port: report.port,
    interfaces: report.interfaces,
    selfProbes: report.selfProbes,
    neighbourCount: report.neighbours.length,
    neighboursKnown: report.neighboursKnown,
    visitors: report.visitors,
    verdict: report.verdict,
    summary: report.summary,
    hint: report.hint,
    generatedAt: Date.now()
  };
}
