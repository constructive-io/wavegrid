/**
 * Advanced → OSC. The screen to open when the lasers do not respond.
 *
 * OSC rides UDP, so a show aimed at the wrong port looks exactly like a working
 * one: nothing errors, nothing arrives. This panel replaces that silence with
 * four answers — where we send, whether anything is bound there, what BEYOND's
 * own settings say, and what a single hand-made message does.
 *
 * Sends are deliberately minimal: one message per click, at the project's own
 * configured target, encoded by the same code the show uses. Nothing here starts
 * an animation, and nothing needs a service or a key — it is this machine's UDP
 * socket and nothing else.
 */
import { Eraser, Radio, RefreshCw, Send, Square } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { oscOutputs } from '@/renderer/lib/show-output';
import type { BrainStatus, OscDebugPreset, OscDebugState, OscProbeState } from '@/types/ipc';

interface OscRouteProps {
  activeProject: string | null;
  status: BrainStatus;
}

/** What each probe verdict actually means, in the operator's terms. UDP has no
 *  handshake, so "quiet" is the honest word for the good case. */
const PROBE_TEXT: Record<OscProbeState, { label: string; tone: string; detail: string }> = {
  refused: {
    label: 'nothing listening',
    tone: 'text-destructive',
    detail:
      'The target rejected the packet — no program is bound to that port. Enable BEYOND’s OSC server, or point Output at the port BEYOND actually listens on.'
  },
  unreachable: {
    label: 'unreachable',
    tone: 'text-destructive',
    detail:
      'The host or network could not be reached. Check the address under Output, that the machine is on, and that a firewall is not dropping UDP.'
  },
  'no-rejection': {
    label: 'no rejection',
    tone: 'text-emerald-600 dark:text-emerald-400',
    detail:
      'Nothing refused the packet, which is as much as UDP can prove — it is not a delivery receipt. Send a preset below and watch the rig.'
  }
};

const PRESETS: { id: OscDebugPreset; label: string }[] = [
  { id: 'blackout', label: 'Blackout' },
  { id: 'white', label: 'Full white' },
  { id: 'amber', label: 'Full amber' }
];

function clock(at: number): string {
  return new Date(at).toLocaleTimeString();
}

export function OscRoute({ activeProject, status: brain }: OscRouteProps) {
  const api = window.wavegrid.oscDebug;
  const [state, setState] = React.useState<OscDebugState | null>(null);
  const [zone, setZone] = React.useState('');
  const [serial, setSerial] = React.useState('');
  const [address, setAddress] = React.useState('/beyond/zone/0/livecontrol/red');
  const [args, setArgs] = React.useState('255');
  const [port, setPort] = React.useState('8000');
  const [busy, setBusy] = React.useState('');
  const [note, setNote] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!activeProject) return;
    setState(await api.state(activeProject));
  }, [api, activeProject]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // While listening, the tail is the whole point — poll it. Cheap: a bounded
  // in-memory log, and only while this screen is open.
  React.useEffect(() => {
    if (!activeProject || state?.listening == null) return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [activeProject, state?.listening, refresh]);

  if (!activeProject) {
    return (
      <div className='p-4'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Radio />
            </EmptyMedia>
            <EmptyTitle>No active project</EmptyTitle>
            <EmptyDescription>Select a project to debug its OSC output.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const target = state?.target ?? null;
  const zoneIndex = zone.trim() === '' ? null : Number(zone);

  const probe = async () => {
    setBusy('probe');
    setState(await api.probe(activeProject));
    setBusy('');
  };

  const preset = async (id: OscDebugPreset) => {
    setBusy(id);
    setNote(null);
    const result = await api.preset(
      activeProject,
      id,
      Number.isInteger(zoneIndex) ? zoneIndex : null,
      serial.trim() || undefined
    );
    setNote(result.ok ? `sent ${result.sent} message(s)` : result.error ?? 'send failed');
    await refresh();
    setBusy('');
  };

  const send = async () => {
    setBusy('send');
    setNote(null);
    const result = await api.send(activeProject, address.trim(), args.trim().split(/\s+/));
    setNote(result.ok ? 'sent' : result.error ?? 'send failed');
    await refresh();
    setBusy('');
  };

  const listen = async () => {
    setBusy('listen');
    setNote(null);
    const next = await api.listen(activeProject, Number(port));
    setState(next);
    if (next.error) setNote(next.error);
    setBusy('');
  };

  const stopListen = async () => {
    setBusy('listen');
    setState(await api.stopListen(activeProject));
    setBusy('');
  };

  return (
    <div className='flex flex-col gap-4'>
      <section className='flex flex-col gap-2 rounded-lg border px-4 py-3'>
        <div className='flex items-center justify-between gap-2'>
          <span className='flex items-center gap-2 text-sm font-medium'>
            <Radio className='size-4' />
            Where this project sends
          </span>
          <Button size='sm' variant='outline' disabled={busy !== ''} onClick={() => void probe()}>
            <RefreshCw className={`size-3.5 ${busy === 'probe' ? 'animate-spin' : ''}`} />
            Test the target
          </Button>
        </div>
        <Separator />
        {target ? (
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <Badge variant='secondary'>{target.kind === 'beyond' ? 'BEYOND' : 'FB4'}</Badge>
            <code className='bg-muted rounded px-2 py-1 text-xs'>
              {target.host}:{target.port}
            </code>
          </div>
        ) : (
          <p className='text-muted-foreground text-sm'>
            This project sends nowhere — choose BEYOND or FB4 under Set up → Output first.
          </p>
        )}
        {state?.probe && (
          <div className='flex flex-col gap-1'>
            <span className={`text-sm ${PROBE_TEXT[state.probe].tone}`}>
              {PROBE_TEXT[state.probe].label}
            </span>
            <p className='text-muted-foreground text-xs'>{PROBE_TEXT[state.probe].detail}</p>
          </div>
        )}
      </section>

      {/* The question this panel exists to answer: the buttons below send from
          here, but the show sends from the receiver — and until now nothing said
          whether the receiver had a target at all. */}
      <section className='flex flex-col gap-2 rounded-lg border px-4 py-3'>
        <span className='text-sm font-medium'>What the running show is driving</span>
        <Separator />
        {!brain.running ? (
          <p className='text-muted-foreground text-sm'>
            No show running. The buttons below still send — they do not need one.
          </p>
        ) : brain.project !== activeProject ? (
          <p className='text-sm text-amber-600 dark:text-amber-400'>
            The running show is <strong>{brain.project}</strong>, but you are editing and debugging{' '}
            <strong>{activeProject}</strong> — they can have different targets. Start the show on
            this project before trusting what you see here.
          </p>
        ) : brain.receiverError ? (
          <p className='text-destructive text-sm'>
            The receiver isn&rsquo;t running: {brain.receiverError}
          </p>
        ) : oscOutputs(brain).length === 0 ? (
          <p className='text-sm text-amber-600 dark:text-amber-400'>
            Console only — the receiver is running with no OSC output, so painting reaches the brain
            and nothing reaches BEYOND. Set a target under Set up → Output, then restart the show.
          </p>
        ) : (
          <div className='flex flex-col gap-1'>
            {oscOutputs(brain).map((label) => (
              <code key={label} className='bg-muted rounded px-2 py-1 text-xs'>
                {label}
              </code>
            ))}
          </div>
        )}
      </section>

      {state?.beyond && (
        <section className='flex flex-col gap-2 rounded-lg border px-4 py-3'>
          <span className='text-sm font-medium'>BEYOND on this machine</span>
          <Separator />
          <code className='text-muted-foreground truncate text-xs'>{state.beyond.path}</code>
          <div className='flex flex-wrap items-center gap-2 text-xs'>
            <Badge variant='outline'>
              OSC port {state.beyond.oscPort ?? 'unknown'}
            </Badge>
            <Badge variant='outline'>
              R-G-B-A panel{' '}
              {state.beyond.showRgbaPanel == null
                ? 'unknown'
                : state.beyond.showRgbaPanel
                  ? 'shown'
                  : 'hidden'}
            </Badge>
          </div>
          {state.beyond.checks.map((check) => (
            <div key={check.name} className='flex flex-col gap-0.5'>
              <span
                className={
                  check.status === 'pass'
                    ? 'text-xs text-emerald-600 dark:text-emerald-400'
                    : 'text-destructive text-xs'
                }
              >
                {check.name} — {check.detail}
              </span>
              {check.remedy && (
                <span className='text-muted-foreground text-xs'>{check.remedy}</span>
              )}
            </div>
          ))}
        </section>
      )}

      <section className='flex flex-col gap-3 rounded-lg border px-4 py-3'>
        <span className='text-sm font-medium'>Send a known signal</span>
        <Separator />
        <p className='text-muted-foreground text-xs'>
          One message per click, encoded exactly as the show encodes it. Leave the fixture blank to
          address every fixture in this project&rsquo;s layout.
        </p>
        <div className='flex flex-wrap items-end gap-2'>
          <div className='flex flex-col gap-1'>
            <Label className='text-xs' htmlFor='osc-zone'>
              Fixture / zone
            </Label>
            <Input
              id='osc-zone'
              className='w-28'
              placeholder='all'
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
          </div>
          {target?.kind === 'fb4' && (
            <div className='flex flex-col gap-1'>
              <Label className='text-xs' htmlFor='osc-serial'>
                FB4 serial
              </Label>
              <Input
                id='osc-serial'
                className='w-32'
                placeholder='12345'
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              />
            </div>
          )}
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size='sm'
              variant='outline'
              disabled={busy !== '' || !target}
              onClick={() => void preset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className='flex flex-wrap items-end gap-2'>
          <div className='flex flex-col gap-1'>
            <Label className='text-xs' htmlFor='osc-address'>
              Address
            </Label>
            <Input
              id='osc-address'
              className='w-80'
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Label className='text-xs' htmlFor='osc-args'>
              Arguments
            </Label>
            <Input
              id='osc-args'
              className='w-40'
              placeholder='255 or f:1.0 or i:3'
              value={args}
              onChange={(e) => setArgs(e.target.value)}
            />
          </div>
          <Button size='sm' disabled={busy !== '' || !target} onClick={() => void send()}>
            <Send className='size-3.5' />
            Send
          </Button>
        </div>
        {note && <p className='text-muted-foreground text-xs'>{note}</p>}
      </section>

      <section className='flex flex-col gap-3 rounded-lg border px-4 py-3'>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-sm font-medium'>Messages</span>
          <div className='flex items-center gap-2'>
            <Input
              className='w-24'
              aria-label='Listen port'
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
            {state?.listening == null ? (
              <Button
                size='sm'
                variant='outline'
                disabled={busy !== ''}
                onClick={() => void listen()}
              >
                Listen
              </Button>
            ) : (
              <Button
                size='sm'
                variant='outline'
                disabled={busy !== ''}
                onClick={() => void stopListen()}
              >
                <Square className='size-3.5' />
                Stop
              </Button>
            )}
            <Button
              size='sm'
              variant='ghost'
              disabled={busy !== ''}
              onClick={async () => setState(await api.clear(activeProject))}
            >
              <Eraser className='size-3.5' />
              Clear
            </Button>
          </div>
        </div>
        <Separator />
        <p className='text-muted-foreground text-xs'>
          Listening binds a port on this machine, so it cannot be the port BEYOND is using — point a
          spare receiver here, or run <code>wavegrid signals listen</code> on the other machine.
        </p>
        {(state?.log.length ?? 0) === 0 ? (
          <p className='text-muted-foreground text-sm'>Nothing sent or received yet.</p>
        ) : (
          <div className='max-h-72 overflow-auto font-mono text-xs'>
            {[...(state?.log ?? [])].reverse().map((entry, i) => (
              <div key={`${entry.at}-${i}`} className='flex gap-2 py-0.5'>
                <span className='text-muted-foreground'>{clock(entry.at)}</span>
                <span className={entry.dir === 'out' ? 'text-sky-600 dark:text-sky-400' : ''}>
                  {entry.dir === 'out' ? '→' : '←'}
                </span>
                <span className='truncate'>{entry.address}</span>
                <span className='text-muted-foreground'>{entry.args}</span>
                <span className='text-muted-foreground'>{entry.peer}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
