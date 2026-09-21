import { Radar, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { DiscoveredBrainInfo } from '@/types/ipc';

interface BrainDiscoveryProps {
  brains: DiscoveredBrainInfo[];
  scanning: boolean;
  scanned: boolean;
  onScan: () => void;
  onUse?: (url: string) => void;
}

/**
 * Brains advertising themselves on the LAN over mDNS — the same records
 * `wavegrid receiver` follows when it is given no `--server`. Scanning is
 * explicit because multicast is frequently blocked; an empty result is a real
 * answer ("nothing found"), not a failure, and typing the URL always works.
 */
export function BrainDiscovery({ brains, scanning, scanned, onScan, onUse }: BrainDiscoveryProps) {
  const [copied, setCopied] = React.useState<string | null>(null);

  const copy = (url: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(url);
    window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
  };

  return (
    <div className='flex flex-col gap-3 rounded-lg border px-4 py-3'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Radar className='size-4' />
          <span className='font-medium'>Brains on this network</span>
          {scanned && <Badge variant='outline'>{brains.length} found</Badge>}
        </div>
        <Button size='sm' variant='outline' disabled={scanning} onClick={onScan}>
          <RefreshCw className={scanning ? 'animate-spin' : undefined} />
          {scanning ? 'Scanning…' : 'Scan'}
        </Button>
      </div>

      {!scanned && !scanning && (
        <p className='text-muted-foreground text-sm'>
          Scan to find running brains without typing an IP. Point a receiver laptop at one with{' '}
          <code>wavegrid receiver --server ws://…</code>.
        </p>
      )}

      {scanned && brains.length === 0 && !scanning && (
        <p className='text-muted-foreground text-sm'>
          Nothing advertised itself. Either no brain is running, or multicast is blocked on this
          network — use the brain’s LAN URL directly in that case.
        </p>
      )}

      {brains.length > 0 && (
        <>
          <Separator />
          <div className='flex flex-col gap-2'>
            {brains.map((b) => (
              <div
                key={b.serverUrl}
                className='flex flex-wrap items-center justify-between gap-2 text-sm'
              >
                <div className='flex min-w-0 flex-col'>
                  <div className='flex items-center gap-2'>
                    <span className='truncate font-medium'>{b.name}</span>
                    <Badge variant='outline'>{b.project}</Badge>
                    {b.transient && (
                      <Badge variant='secondary' title='A receiver that promoted itself because no dedicated brain was found'>
                        transient
                      </Badge>
                    )}
                  </div>
                  <span className='text-muted-foreground font-mono text-xs'>
                    {b.serverUrl}
                    {b.deviceName ? ` · ${b.deviceName}` : ''}
                  </span>
                </div>
                <div className='flex items-center gap-2'>
                  <Button size='sm' variant='ghost' onClick={() => copy(b.serverUrl)}>
                    {copied === b.serverUrl ? 'Copied' : 'Copy URL'}
                  </Button>
                  {onUse && <Button size='sm' variant='outline' onClick={() => onUse(b.serverUrl)}>Use</Button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
