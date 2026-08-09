/**
 * Advanced → Network. Everything here is a live probe of the running show, so
 * "can a phone reach this?" stops being guesswork at a venue. Nothing is
 * stored: the panel is empty whenever the brain is down.
 */
import { Radar, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { relativeSeen } from '@/renderer/lib/doctor-format';
import {
  bindDescription,
  neighbourSummary,
  verdictLabel,
  verdictTone
} from '@/renderer/lib/network-format';
import type { NetworkReport } from '@/types/ipc';

const TONE_CLASS = {
  good: 'text-emerald-600 dark:text-emerald-400',
  bad: 'text-destructive',
  unknown: 'text-amber-600 dark:text-amber-400'
} as const;

interface NetworkPanelProps {
  report: NetworkReport | null;
  loading: boolean;
  onRefresh: () => void;
}

export function NetworkPanel({ report, loading, onRefresh }: NetworkPanelProps) {
  return (
    <section className='flex flex-col gap-2 rounded-lg border px-4 py-3'>
      <div className='flex items-center justify-between gap-2'>
        <span className='flex items-center gap-2 text-sm font-medium'>
          <Radar className='size-4' />
          Network
        </span>
        <Button size='sm' variant='outline' disabled={loading} onClick={onRefresh}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Test
        </Button>
      </div>
      <Separator />

      {!report ? (
        <p className='text-muted-foreground text-sm'>
          Needs a running show — the checks probe the port the brain is actually serving on.
        </p>
      ) : (
        <div className='flex flex-col gap-2 text-sm'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant={verdictTone(report.verdict) === 'good' ? 'secondary' : 'outline'}>
              {verdictLabel(report.verdict)}
            </Badge>
            <span className={TONE_CLASS[verdictTone(report.verdict)]}>{report.summary}</span>
          </div>
          {report.hint && <p className='text-muted-foreground text-xs'>↳ {report.hint}</p>}

          <p className='text-muted-foreground text-xs'>{bindDescription(report)}</p>

          {report.selfProbes.length > 0 && (
            <ul className='flex flex-col gap-1'>
              {report.selfProbes.map((p) => (
                <li key={p.address} className='flex items-center gap-2 text-xs'>
                  <span className={p.reachable ? TONE_CLASS.good : TONE_CLASS.bad}>
                    {p.reachable ? '●' : '○'}
                  </span>
                  <code>{p.url}</code>
                  <span className='text-muted-foreground'>
                    {p.reachable ? 'open from this machine' : 'blocked from this machine'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className='text-muted-foreground text-xs'>{neighbourSummary(report)}</p>

          <div className='flex flex-col gap-1'>
            <span className='text-xs font-medium'>Devices that loaded the show</span>
            {report.visitors.length === 0 ? (
              <span className='text-muted-foreground text-xs'>
                None yet. Scan the QR on the Show screen from a phone — that is the only way to
                prove the network allows device-to-device traffic.
              </span>
            ) : (
              <ul className='flex flex-col gap-1'>
                {report.visitors.map((v) => (
                  <li key={v.address} className='flex flex-wrap items-center gap-2 text-xs'>
                    <code>{v.address}</code>
                    <span className='text-muted-foreground truncate' title={v.userAgent}>
                      {v.userAgent}
                    </span>
                    <span className='text-muted-foreground'>{relativeSeen(v.lastSeen)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
