/**
 * Advanced → Traffic. Watches the conversation between Pangolin BEYOND and the
 * laser hardware (usually an FB4) so the protocol can be worked out from real
 * packets instead of guesses.
 *
 * Two things shape this screen:
 *
 *  - It is passive. Everything here lists, listens, captures or analyses; the
 *    app never sends a packet toward the hardware. The workflow is "put BEYOND
 *    in a state, capture, change exactly one thing, capture again, compare".
 *  - Wireshark is not a Wavegrid dependency. Nothing is looked for until this
 *    screen mounts, and a machine without it just sees what to install.
 */
import { FolderOpen, RefreshCw, Search, Square, Waves } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type {
  TrafficCaptureFile,
  TrafficCaptureState,
  TrafficDiscovery,
  TrafficDoctorReport,
  TrafficInterfaceInfo,
  TrafficSettings
} from '@/types/ipc';

/** The states worth capturing, in the order you'd walk BEYOND through them.
 *  One state per capture is what makes `compare` meaningful. */
const STEPS = [
  'idle',
  'output-on',
  'static-frame',
  'change-x',
  'change-y',
  'brightness',
  'output-off'
];

/** `doctor` reports the tool's whole banner line; a badge only wants the number. */
function versionOf(version?: string): string {
  return version?.match(/\d+\.\d+(\.\d+)?/)?.[0] ?? '';
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TrafficRoute() {
  const api = window.wavegrid.traffic;
  const [doctor, setDoctor] = React.useState<TrafficDoctorReport | null>(null);
  const [settings, setSettings] = React.useState<TrafficSettings | null>(null);
  const [interfaces, setInterfaces] = React.useState<TrafficInterfaceInfo[]>([]);
  const [discovery, setDiscovery] = React.useState<TrafficDiscovery | null>(null);
  const [captures, setCaptures] = React.useState<TrafficCaptureFile[]>([]);
  const [capture, setCapture] = React.useState<TrafficCaptureState | null>(null);
  const [host, setHost] = React.useState('');
  const [iface, setIface] = React.useState('');
  const [label, setLabel] = React.useState(STEPS[0]);
  const [seconds, setSeconds] = React.useState('15');
  const [selection, setSelection] = React.useState<string[]>([]);
  const [output, setOutput] = React.useState('');
  const [busy, setBusy] = React.useState('');

  const refresh = React.useCallback(async () => {
    setBusy('checking');
    const [report, config, state, files] = await Promise.all([
      api.doctor(),
      api.settings(),
      api.status(),
      api.captures()
    ]);
    setDoctor(report);
    setSettings(config);
    setCapture(state);
    setCaptures(files);
    setBusy('');
  }, [api]);

  // Lazy on purpose: this is the first and only moment Wireshark is looked for.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const missing = (doctor?.tools ?? []).filter((t) => !t.found);
  const ready = Boolean(doctor) && missing.length === 0;

  const listInterfaces = async () => {
    setBusy('interfaces');
    setInterfaces(await api.interfaces(host || undefined));
    setBusy('');
  };

  const discover = async () => {
    setBusy('discover');
    setDiscovery(await api.discover(iface || undefined, 10));
    setBusy('');
  };

  const start = async () => {
    setBusy('capture');
    const state = await api.start({
      iface: iface || undefined,
      host: host || undefined,
      label,
      seconds: Number(seconds) > 0 ? Number(seconds) : undefined
    });
    setCapture(state);
    setBusy('');
  };

  const stop = async () => {
    setBusy('capture');
    setCapture(await api.stop());
    setCaptures(await api.captures());
    setBusy('');
  };

  const run = async (kind: 'analyze' | 'compare') => {
    setBusy(kind);
    setOutput('');
    const result =
      kind === 'analyze'
        ? await api.analyze(selection[0], host || undefined)
        : await api.compare(selection[0], selection[1], host || undefined);
    setOutput(result.stdout || result.stderr || 'no output');
    setBusy('');
  };

  const toggle = (path: string) =>
    setSelection((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path].slice(-2)
    );

  return (
    <div className='flex flex-col gap-4'>
      <section className='flex flex-col gap-2 rounded-lg border px-4 py-3'>
        <div className='flex items-center justify-between gap-2'>
          <span className='flex items-center gap-2 text-sm font-medium'>
            <Waves className='size-4' />
            Wireshark tools
          </span>
          <Button size='sm' variant='outline' disabled={busy !== ''} onClick={() => void refresh()}>
            <RefreshCw className={`size-3.5 ${busy === 'checking' ? 'animate-spin' : ''}`} />
            Re-check
          </Button>
        </div>
        <Separator />
        <p className='text-muted-foreground text-xs'>
          Observation only: this panel lists, listens, captures and analyses. It never sends a packet
          to the laser hardware.
        </p>

        {!doctor ? (
          <p className='text-muted-foreground text-sm'>
            The traffic toolkit could not be run on this machine. It lives in the repo at
            tools/traffic — point the app at a checkout with WAVEGRID_TRAFFIC_TOOLKIT.
          </p>
        ) : (
          <div className='flex flex-col gap-2 text-sm'>
            <div className='flex flex-wrap items-center gap-2'>
              {doctor.tools.map((tool) => (
                <Badge key={tool.name} variant={tool.found ? 'secondary' : 'outline'}>
                  {tool.name}
                  {versionOf(tool.version) ? ` ${versionOf(tool.version)}` : ''}
                  {tool.found ? '' : ' — missing'}
                </Badge>
              ))}
            </div>
            <span className='text-muted-foreground text-xs'>
              {doctor.os} {doctor.osVersion} · {doctor.arch}
            </span>
            {missing.length > 0 && (
              <p className='text-muted-foreground text-xs'>
                Install Wireshark (macOS: the .app is enough — its command-line tools are found
                inside the bundle).
              </p>
            )}
            <p
              className={
                doctor.capturePermission.ok
                  ? 'text-xs text-emerald-600 dark:text-emerald-400'
                  : 'text-destructive text-xs'
              }
            >
              {doctor.capturePermission.detail}
            </p>
            {!doctor.capturePermission.ok && doctor.capturePermission.fix && (
              // Printed, never run: granting capture rights is the operator's call.
              <code className='bg-muted rounded px-2 py-1 text-xs'>
                {doctor.capturePermission.fix}
              </code>
            )}
          </div>
        )}

        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-xs font-medium'>Captures folder</span>
          <code className='text-muted-foreground truncate text-xs'>{settings?.captureDir}</code>
          <Button
            size='sm'
            variant='outline'
            onClick={async () => {
              const next = await api.chooseCaptureDir();
              if (next) {
                setSettings(next);
                setCaptures(await api.captures());
              }
            }}
          >
            <FolderOpen className='size-3.5' />
            Change
          </Button>
        </div>
      </section>

      <section className='flex flex-col gap-3 rounded-lg border px-4 py-3'>
        <span className='text-sm font-medium'>Find the hardware</span>
        <Separator />
        <div className='flex flex-wrap items-end gap-2'>
          <div className='flex flex-col gap-1'>
            <Label className='text-xs' htmlFor='traffic-host'>
              FB4 / hardware address
            </Label>
            <Input
              id='traffic-host'
              className='w-44'
              placeholder='10.0.0.42'
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Label className='text-xs' htmlFor='traffic-iface'>
              Interface
            </Label>
            <Input
              id='traffic-iface'
              className='w-32'
              placeholder='en7'
              value={iface}
              onChange={(e) => setIface(e.target.value)}
            />
          </div>
          <Button size='sm' variant='outline' disabled={!ready || busy !== ''} onClick={() => void listInterfaces()}>
            Interfaces
          </Button>
          <Button size='sm' variant='outline' disabled={!ready || busy !== ''} onClick={() => void discover()}>
            <Search className={`size-3.5 ${busy === 'discover' ? 'animate-pulse' : ''}`} />
            Listen 10s
          </Button>
        </div>

        {interfaces.length > 0 && (
          <ul className='flex flex-col gap-1'>
            {interfaces.map((i) => (
              <li key={i.name} className='flex flex-wrap items-center gap-2 text-xs'>
                <button className='underline' onClick={() => setIface(i.name)}>
                  <code>{i.name}</code>
                </button>
                <span className='text-muted-foreground'>{i.addresses || i.description}</span>
                {i.matchesHost && <Badge variant='secondary'>same subnet</Badge>}
              </li>
            ))}
          </ul>
        )}

        {discovery && (
          <div className='flex flex-col gap-1'>
            <span className='text-xs font-medium'>
              Peers seen in {discovery.seconds}s on {discovery.iface} — laser hardware is the
              steady, two-way, high-rate one
            </span>
            {discovery.candidates.length === 0 ? (
              <span className='text-muted-foreground text-xs'>
                Nothing exchanged packets with this machine. Start laser output in BEYOND and listen
                again.
              </span>
            ) : (
              <ul className='flex flex-col gap-1'>
                {discovery.candidates.map((p) => (
                  <li key={p.ip} className='flex flex-wrap items-center gap-2 text-xs'>
                    <button className='underline' onClick={() => setHost(p.ip)}>
                      <code>{p.ip}</code>
                    </button>
                    <span className='text-muted-foreground'>
                      {p.packets} packets · {human(p.bytes)} · {p.protocols} · ports {p.ports}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className='flex flex-col gap-3 rounded-lg border px-4 py-3'>
        <span className='text-sm font-medium'>Capture one state at a time</span>
        <Separator />
        <div className='flex flex-wrap items-end gap-2'>
          <div className='flex flex-col gap-1'>
            <Label className='text-xs' htmlFor='traffic-label'>
              What BEYOND is doing
            </Label>
            <Input
              id='traffic-label'
              className='w-40'
              list='traffic-steps'
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <datalist id='traffic-steps'>
              {STEPS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className='flex flex-col gap-1'>
            <Label className='text-xs' htmlFor='traffic-seconds'>
              Seconds
            </Label>
            <Input
              id='traffic-seconds'
              className='w-20'
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </div>
          <Button size='sm' disabled={!ready || busy !== '' || capture?.running} onClick={() => void start()}>
            Capture
          </Button>
          <Button size='sm' variant='outline' disabled={busy !== ''} onClick={() => void stop()}>
            <Square className='size-3.5' />
            Stop
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {capture?.running
            ? `Capturing to ${capture.file}`
            : host
              ? `Only traffic involving ${host} is written to disk.`
              : 'Set an address to keep the capture to the hardware’s traffic alone.'}
        </p>
      </section>

      <section className='flex flex-col gap-3 rounded-lg border px-4 py-3'>
        <div className='flex items-center justify-between gap-2'>
          <span className='text-sm font-medium'>Captures</span>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={!ready || selection.length !== 1 || busy !== ''}
              onClick={() => void run('analyze')}
            >
              Analyze
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={!ready || selection.length !== 2 || busy !== ''}
              onClick={() => void run('compare')}
            >
              Compare two
            </Button>
          </div>
        </div>
        <Separator />
        {captures.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            Nothing captured yet. Capture an idle state first — it is what every later state is
            compared against.
          </p>
        ) : (
          <ul className='flex flex-col gap-1'>
            {captures.map((file) => (
              <li key={file.path} className='flex flex-wrap items-center gap-2 text-xs'>
                <button
                  className={selection.includes(file.path) ? 'font-medium underline' : 'underline'}
                  onClick={() => toggle(file.path)}
                >
                  {file.name}
                </button>
                <span className='text-muted-foreground'>
                  {file.label || 'unlabelled'} · {human(file.bytes)}
                </span>
                {selection.indexOf(file.path) === 0 && <Badge variant='secondary'>A</Badge>}
                {selection.indexOf(file.path) === 1 && <Badge variant='secondary'>B</Badge>}
              </li>
            ))}
          </ul>
        )}
        {output && (
          <pre className='bg-muted max-h-96 overflow-auto rounded p-3 text-xs whitespace-pre'>
            {output}
          </pre>
        )}
      </section>
    </div>
  );
}
