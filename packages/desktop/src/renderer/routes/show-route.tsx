import { AlertTriangle, MonitorPlay, Play, Square } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { watchOverlays } from '@/renderer/lib/overlay-present';
import { hasOscOutput } from '@/renderer/lib/show-output';
import { ShareShow } from '@/renderer/routes/share-show';
import type { BrainStatus } from '@/types/ipc';

interface ShowRouteProps {
  status: BrainStatus;
  activeProject: string | null;
  onStart: () => void;
  onStop: () => void;
  busy: boolean;
}

/**
 * "Start show" controls plus the embedded laser UI. The laser UI itself is a
 * native WebContentsView owned by the main process; this component only reports
 * the rectangle it should occupy (and hides it on unmount) — it never renders
 * or restyles the laser UI.
 */
export function ShowRoute({ status, activeProject, onStart, onStop, busy }: ShowRouteProps) {
  const slotRef = React.useRef<HTMLDivElement>(null);
  // The laser UI is a native view stacked above the page, so anything the app
  // draws over it — the QR popover, the switch-project confirmation, a menu —
  // would be buried under it. Hide it for as long as an overlay is up.
  const [overlay, setOverlay] = React.useState(false);
  React.useEffect(() => watchOverlays(document, setOverlay), []);

  const running = status.running;
  const url = status.url;

  // Report the laser view's target bounds to the main process on every layout
  // change while the show is running; hide it whenever we leave this route.
  React.useEffect(() => {
    if (!running || !url || overlay) {
      window.wavegridLaser.sync({ url: null, bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false });
      return;
    }
    const sync = () => {
      const el = slotRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      window.wavegridLaser.sync({
        url,
        bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
        visible: true
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    if (slotRef.current) ro.observe(slotRef.current);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      window.wavegridLaser.sync({ url: null, bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false });
    };
  }, [running, url, overlay]);

  return (
    <div className='flex h-full flex-col gap-4 p-4'>
      <div className='flex flex-wrap items-center gap-3'>
        <Button onClick={running ? onStop : onStart} disabled={busy || !activeProject}>
          {running ? <Square /> : <Play />}
          {running ? 'Stop show' : 'Start show'}
        </Button>
        <Badge variant={running ? 'default' : 'outline'}>
          {running ? `Running · ${status.runMode ?? 'auto'}` : 'Stopped'}
        </Badge>
        {status.url && (
          <span className='text-muted-foreground font-mono text-sm'>{status.url}</span>
        )}
        {running && status.lanUrls.length > 0 && (
          <ShareShow lanUrls={status.lanUrls} />
        )}
      </div>

      {/* Why the show isn't up (or is up without output) — a red dot with no
          reason is the thing operators can't act on. */}
      {status.lastError && !running && (
        <div className='text-destructive flex items-start gap-2 rounded-lg border border-current/30 px-3 py-2 text-sm'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0' />
          <span>
            <span className='font-medium'>The show didn’t start.</span> {status.lastError}
          </span>
        </div>
      )}
      {running && status.receiverError && (
        <div className='flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-amber-600 dark:text-amber-400'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0' />
          <span>
            <span className='font-medium'>No laser output.</span> The brain and UI are running, but
            this machine’s receiver failed to start: {status.receiverError}
          </span>
        </div>
      )}
      {/* The receiver can start perfectly and still drive nothing, which looks
          identical to a healthy show until someone notices the lasers are dark. */}
      {running && !status.receiverError && status.receiverRunning && !hasOscOutput(status) && (
        <div className='flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-amber-600 dark:text-amber-400'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0' />
          <span>
            <span className='font-medium'>Console only — no OSC output.</span> Painting reaches the
            brain, but this project has no OSC target, so nothing is sent to BEYOND. Set one in
            Output → Advanced (or <code>wavegrid projects osc</code>), then restart the show.
          </span>
        </div>
      )}

      <div className='bg-muted/30 relative flex-1 overflow-hidden rounded-lg border'>
        {running ? (
          // The native laser WebContentsView is positioned over this slot.
          <div ref={slotRef} className='h-full w-full' />
        ) : (
          <Empty className='h-full'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <MonitorPlay />
              </EmptyMedia>
              <EmptyTitle>No show running</EmptyTitle>
              <EmptyDescription>
                {activeProject
                  ? `Start the show to launch the brain for “${activeProject}” and embed the laser UI here.`
                  : 'Select a project first, then start the show.'}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={onStart} disabled={busy || !activeProject}>
                <Play />
                Start show
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    </div>
  );
}
