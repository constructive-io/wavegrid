/**
 * "Scan to open" — a QR code for the LAN URL the show is served on, so an iPad
 * or a phone gets to the artist UI without anyone typing an IP.
 *
 * Deliberately ephemeral: the URL comes from the brain's live status (current
 * interfaces, current port) and is regenerated on every open. Nothing about it
 * is written to the project or the store, and the button disappears with the
 * show.
 */
import { Check, Copy, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { rankLanUrls } from '@/renderer/lib/share-urls';

interface ShareShowProps {
  lanUrls: string[];
  /** Called while the QR is open so the native laser view can get out of the
   *  way — it renders above the page and would otherwise cover the popover. */
  onOpenChange?: (open: boolean) => void;
}

export function ShareShow({ lanUrls, onOpenChange }: ShareShowProps) {
  const urls = React.useMemo(() => rankLanUrls(lanUrls), [lanUrls]);
  const [selected, setSelected] = React.useState(0);
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const url = urls[Math.min(selected, urls.length - 1)] ?? null;

  React.useEffect(() => {
    if (!url) {
      setDataUrl(null);
      return;
    }
    let live = true;
    void QRCode.toDataURL(url, { margin: 1, width: 220 }).then((png) => {
      if (live) setDataUrl(png);
    });
    return () => {
      live = false;
    };
  }, [url]);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  if (urls.length === 0) return null;

  return (
    <Popover onOpenChange={(open) => onOpenChange?.(open)}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm'>
          <QrCode />
          Scan to open
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-72' align='start'>
        <div className='flex flex-col items-center gap-3'>
          {dataUrl && (
            <img src={dataUrl} alt={`QR code for ${url}`} className='size-44 rounded bg-white p-2' />
          )}
          <div className='flex w-full items-center gap-2'>
            <code className='bg-muted flex-1 truncate rounded px-2 py-1 text-xs'>{url}</code>
            <Button
              variant='ghost'
              size='icon'
              aria-label='Copy URL'
              onClick={() => {
                if (url) void navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          {urls.length > 1 && (
            <div className='flex w-full flex-wrap gap-1'>
              {urls.map((u, i) => (
                <Button
                  key={u}
                  variant={i === selected ? 'secondary' : 'ghost'}
                  size='sm'
                  className='h-6 px-2 font-mono text-[11px]'
                  onClick={() => setSelected(i)}
                >
                  {new URL(u).hostname}
                </Button>
              ))}
            </div>
          )}
          <p className='text-muted-foreground text-xs'>
            Same wifi only. Venue and guest networks often block device-to-device traffic — if a
            phone can’t load this, check Status → Advanced.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
