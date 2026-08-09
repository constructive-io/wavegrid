import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  XCircle
} from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import {
  bySeverity,
  formatUptime,
  OVERALL_LABEL,
  relativeSeen,
  serverErrorMessage,
  tally
} from '@/renderer/lib/doctor-format';
import { NetworkPanel } from '@/renderer/routes/network-panel';
import type { DoctorCheck, DoctorReport, NetworkReport } from '@/types/ipc';

interface StatusRouteProps {
  project: string | null;
  report: DoctorReport | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  /** Receiver controls — only meaningful while this project's brain is running. */
  brainLive: boolean;
  receiverRunning: boolean;
  onStartReceiver: () => void;
  onStopReceiver: () => void;
  busy: boolean;
  /** Advanced → Network: probed on demand, never on the live interval. */
  network: NetworkReport | null;
  networkLoading: boolean;
  onProbeNetwork: () => void;
}

const REFRESH_MS = 5000;

const STATUS_ICON: Record<DoctorCheck['status'], React.ReactNode> = {
  pass: <CheckCircle2 className='size-3.5 text-emerald-500' />,
  warn: <AlertTriangle className='size-3.5 text-amber-500' />,
  fail: <XCircle className='size-3.5 text-destructive' />
};

function Card({ title, children, action }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className='flex flex-col gap-2 rounded-lg border px-4 py-3'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-sm font-medium'>{title}</span>
        {action}
      </div>
      <Separator />
      {children}
    </section>
  );
}

/**
 * Status — the desktop face of `wavegrid doctor`, refreshed live. Left column is
 * the show (brain, its receivers, coverage, the device registry); right column is
 * the checklist of this laptop's own problems and their exact fixes. Each column
 * scrolls on its own inside a fixed-height page, so nothing falls below the fold
 * on a short window.
 */
export function StatusRoute({
  project,
  report,
  loading,
  error,
  onRefresh,
  brainLive,
  receiverRunning,
  onStartReceiver,
  onStopReceiver,
  busy,
  network,
  networkLoading,
  onProbeNetwork
}: StatusRouteProps) {
  const [live, setLive] = React.useState(true);
  const [advanced, setAdvanced] = React.useState(false);

  React.useEffect(() => {
    if (!live || !project) return;
    const id = window.setInterval(onRefresh, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [live, project, onRefresh]);

  if (!project) {
    return (
      <div className='p-4'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Activity />
            </EmptyMedia>
            <EmptyTitle>No active project</EmptyTitle>
            <EmptyDescription>Select a project to see its health.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const counts = report ? tally(report.checks) : null;
  const server = report?.server ?? null;

  return (
    <div className='flex h-full min-h-0 flex-col gap-3 p-4'>
      {/* Toolbar: verdict + refresh + receiver controls, always on screen. */}
      <div className='flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2'>
        <Activity className='size-4' />
        <span className='font-medium'>{project}</span>
        {report && (
          <Badge
            variant={report.overall === 'fail' ? 'destructive' : 'secondary'}
            title={
              counts ? `${counts.fail} failing · ${counts.warn} warning · ${counts.pass} passing` : undefined
            }
          >
            {OVERALL_LABEL[report.overall]}
          </Badge>
        )}
        <Badge variant={server ? 'secondary' : 'outline'}>
          {server ? `brain up · ${formatUptime(server.uptimeMs)}` : 'brain down'}
        </Badge>
        {server && (
          <Badge variant='outline'>
            {server.receivers.length} receiver{server.receivers.length === 1 ? '' : 's'} · {server.uiClients} UI
          </Badge>
        )}

        <div className='ml-auto flex items-center gap-2'>
          <Button size='sm' variant='outline' disabled={loading} onClick={onRefresh}>
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size='sm' variant={live ? 'default' : 'outline'} onClick={() => setLive((v) => !v)}>
            {live ? 'Live' : 'Paused'}
          </Button>
        </div>
      </div>

      {error && <p className='text-destructive text-sm'>{error}</p>}

      <div className='grid min-h-0 flex-1 gap-3 lg:grid-cols-2'>
        {/* ── The show ─────────────────────────────────────────────────── */}
        <div className='flex min-h-0 flex-col gap-3 overflow-y-auto pr-1'>
          <Card
            title='Brain'
            action={
              <span className='text-muted-foreground text-xs'>{report?.serverUrl}</span>
            }
          >
            {server ? (
              <dl className='grid grid-cols-2 gap-x-4 gap-y-1 text-sm'>
                <dt className='text-muted-foreground'>Version</dt>
                <dd>v{server.version}</dd>
                <dt className='text-muted-foreground'>Layout</dt>
                <dd>
                  {server.layoutName} · {server.count} cannons
                </dd>
                <dt className='text-muted-foreground'>Mode</dt>
                <dd>{server.mode}</dd>
                <dt className='text-muted-foreground'>Port</dt>
                <dd>:{server.port}</dd>
                <dt className='text-muted-foreground'>Coverage</dt>
                <dd>
                  claimed {server.coverage.claimed}
                  {!server.coverage.healthy && (
                    <span className='text-destructive'>
                      {' '}· gaps {server.coverage.gaps} · overlaps {server.coverage.overlaps}
                    </span>
                  )}
                </dd>
              </dl>
            ) : (
              <p className='text-muted-foreground text-sm'>
                {report ? serverErrorMessage(report) : 'Collecting…'}
              </p>
            )}
          </Card>

          <Card
            title='Receiver (this laptop)'
            action={
              <Badge variant={receiverRunning ? 'secondary' : 'outline'}>
                {receiverRunning ? 'running' : 'stopped'}
              </Badge>
            }
          >
            <p className='text-muted-foreground text-sm'>
              The output stage reads its OSC target, shard and light map when it starts — restart it
              after changing any of those to apply them without dropping the show.
            </p>
            <div className='flex items-center gap-2'>
              {receiverRunning ? (
                <>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={() => {
                      onStopReceiver();
                      onStartReceiver();
                    }}
                  >
                    <RotateCcw className='size-3.5' />
                    Restart
                  </Button>
                  <Button size='sm' variant='outline' disabled={busy} onClick={onStopReceiver}>
                    <Square className='size-3.5' />
                    Stop
                  </Button>
                </>
              ) : (
                <Button size='sm' disabled={busy || !brainLive} onClick={onStartReceiver}>
                  <Play className='size-3.5' />
                  Start receiver
                </Button>
              )}
              {!brainLive && (
                <span className='text-muted-foreground text-xs'>
                  Start the show first — the receiver dials into the brain.
                </span>
              )}
            </div>
          </Card>

          <Card title='Connected receivers'>
            {!server ? (
              <p className='text-muted-foreground text-sm'>Needs a running brain.</p>
            ) : server.receivers.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                None connected — nothing is driving the lasers.
              </p>
            ) : (
              <ul className='flex flex-col gap-1 text-sm'>
                {server.receivers.map((r) => (
                  <li key={`${r.remote}-${r.label}`} className='flex flex-wrap items-center gap-2'>
                    <Cpu className='size-3.5' />
                    <span className='font-medium'>{r.label}</span>
                    <span className='text-muted-foreground text-xs'>{r.remote}</span>
                    <Badge variant='outline'>{r.shard}</Badge>
                    {r.version && <span className='text-muted-foreground text-xs'>v{r.version}</span>}
                    {r.layoutMismatch && (
                      <span className='text-destructive text-xs'>⚠ {r.layoutMismatch}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {report && report.devices.length > 0 && (
            <Card title={`Registered devices (${report.devices.length})`}>
              <ul className='flex flex-col gap-1 text-sm'>
                {report.devices.map((d) => (
                  <li key={d.name} className='flex flex-wrap items-center gap-2'>
                    <span className='font-medium'>{d.name}</span>
                    {d.address && <span className='text-muted-foreground text-xs'>{d.address}</span>}
                    {d.shard && <Badge variant='outline'>{d.shard}</Badge>}
                    <span className='text-muted-foreground text-xs'>{relativeSeen(d.lastSeen)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Advanced — diagnostics an operator opens when something is wrong,
              not part of the at-a-glance show status. */}
          <div className='flex flex-col gap-2'>
            <Button
              variant='ghost'
              size='sm'
              className='self-start'
              onClick={() => {
                const next = !advanced;
                setAdvanced(next);
                if (next && !network) onProbeNetwork();
              }}
            >
              {advanced ? <ChevronDown className='size-3.5' /> : <ChevronRight className='size-3.5' />}
              Advanced
            </Button>
            {advanced && (
              <NetworkPanel report={network} loading={networkLoading} onRefresh={onProbeNetwork} />
            )}
          </div>

          {report && (!report.sync.enabled || report.sync.relevant) && (
            <Card
              title='Config sync'
              action={
                <Badge variant={report.sync.enabled ? 'secondary' : 'outline'}>
                  {report.sync.enabled ? `revision ${report.sync.revision}` : 'disabled'}
                </Badge>
              }
            >
              {!report.sync.enabled ? (
                <p className='text-muted-foreground text-sm'>
                  Edits stay local to each device — turn sync on to replicate them.
                </p>
              ) : report.sync.behind.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  Every device is at revision {report.sync.revision}.
                </p>
              ) : (
                <ul className='flex flex-col gap-1 text-sm'>
                  {report.sync.behind.map((d) => (
                    <li key={d.name}>
                      <span className='font-medium'>{d.name}</span>{' '}
                      <span className='text-muted-foreground text-xs'>
                        acked rev {d.ackedRevision}, behind by {d.behindBy} — reconnect it to resync
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        {/* ── This laptop's checks ─────────────────────────────────────── */}
        <div className='flex min-h-0 flex-col overflow-hidden rounded-lg border'>
          <div className='flex items-center justify-between gap-2 px-4 py-3'>
            <span className='text-sm font-medium'>Checks</span>
            {counts && (
              <span className='text-muted-foreground text-xs'>
                {counts.fail} failing · {counts.warn} warning · {counts.pass} passing
              </span>
            )}
          </div>
          <Separator />
          <div className='min-h-0 flex-1 overflow-y-auto px-4 py-2'>
            {!report ? (
              <p className='text-muted-foreground text-sm'>Collecting…</p>
            ) : (
              <ul className='flex flex-col gap-2'>
                {bySeverity(report.checks).map((check) => (
                  <li key={check.name} className='flex flex-col gap-0.5'>
                    <div className='flex items-center gap-2 text-sm'>
                      {STATUS_ICON[check.status]}
                      <span className='font-medium'>{check.name}</span>
                      <span className='text-muted-foreground truncate' title={check.detail}>
                        {check.detail}
                      </span>
                    </div>
                    {check.remedy && check.status !== 'pass' && (
                      <code className='text-muted-foreground ml-5 text-xs'>↳ {check.remedy}</code>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
