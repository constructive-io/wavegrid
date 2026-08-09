import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LayoutChoice, NewProjectInput } from '@/types/ipc';

type Shape = 'preset' | 'grid' | 'ring' | 'annulus' | 'rings' | 'filledRing';

/** Cannons per ring, outermost first — "12,8,4,1". */
function ringCountsValid(text: string): boolean {
  const parts = text.split(',').map((p) => p.trim());
  return parts.length > 0 && parts.every((p) => /^\d+$/.test(p) && Number(p) >= 1);
}

const NAME_RE = /^[a-zA-Z0-9._-]+$/;

/** A pill-style single-select — used for the small, fixed enumerations (preset,
 *  shape, mode) so the wizard needs no portal-based Select inside the dialog. */
function Choice<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className='flex flex-wrap gap-2'>
      {options.map((o) => (
        <Button
          key={o.value}
          type='button'
          size='sm'
          variant={value === o.value ? 'default' : 'outline'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min = 1
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode='numeric'
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className='w-32'
      />
    </div>
  );
}

/** Create-project wizard. Step 1 picks the layout (a built-in preset or a custom
 *  shape); step 2 sets run mode + network. Submit builds a NewProjectInput and
 *  the store creates the project and generates its secrets once. */
export function CreateProjectDialog({
  presets,
  existing,
  onCreate,
  busy
}: {
  presets: string[];
  existing: string[];
  onCreate: (input: NewProjectInput) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState('');
  const [shape, setShape] = React.useState<Shape>('preset');
  const [preset, setPreset] = React.useState('');
  const [cols, setCols] = React.useState('7');
  const [rows, setRows] = React.useState('7');
  const [count, setCount] = React.useState('6');
  const [innerRadius, setInnerRadius] = React.useState('0.5');
  const [ringCounts, setRingCounts] = React.useState('12,8,4,1');

  const [mode, setMode] = React.useState<NewProjectInput['mode']>('auto');
  const [serverHost, setServerHost] = React.useState('0.0.0.0');
  const [serverPort, setServerPort] = React.useState('3000');
  const [uiPort, setUiPort] = React.useState('3003');
  const [simpleModeMax, setSimpleModeMax] = React.useState('40');

  React.useEffect(() => {
    if (open && !preset && presets.length) setPreset(presets[0]);
  }, [open, preset, presets]);

  const reset = () => {
    setStep(0);
    setError(null);
    setName('');
    setShape('preset');
    setPreset(presets[0] ?? '');
    setCols('7');
    setRows('7');
    setCount('6');
    setInnerRadius('0.5');
    setRingCounts('12,8,4,1');
    setMode('auto');
    setServerHost('0.0.0.0');
    setServerPort('3000');
    setUiPort('3003');
    setSimpleModeMax('40');
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const trimmed = name.trim();
  const nameError =
    trimmed === ''
      ? 'Name is required.'
      : !NAME_RE.test(trimmed)
        ? 'Use letters, numbers, ".", "_" or "-".'
        : existing.includes(trimmed)
          ? 'A project with that name already exists.'
          : null;

  const layoutChoice = (): LayoutChoice => {
    if (shape === 'preset') return { preset };
    if (shape === 'grid') return { kind: 'grid', cols: Number(cols), rows: Number(rows) };
    if (shape === 'rings') return { kind: 'rings', ringCounts };
    if (shape === 'annulus') return { kind: 'annulus', count: Number(count), innerRadius: Number(innerRadius) };
    return { kind: shape, count: Number(count) };
  };

  const layoutValid =
    shape === 'preset'
      ? preset !== ''
      : shape === 'grid'
        ? Number(cols) >= 1 && Number(rows) >= 1
        : shape === 'rings'
          ? ringCountsValid(ringCounts)
          : shape === 'annulus'
            ? Number(count) >= 1 && Number(innerRadius) >= 0 && Number(innerRadius) < 1
            : Number(count) >= 1;

  const step1Valid = !nameError && layoutValid;
  const portsValid =
    Number.isInteger(Number(serverPort)) &&
    Number(serverPort) > 0 &&
    Number.isInteger(Number(uiPort)) &&
    Number(uiPort) > 0 &&
    Number.isInteger(Number(simpleModeMax)) &&
    Number(simpleModeMax) > 0 &&
    serverHost.trim() !== '';

  const submit = async () => {
    setError(null);
    try {
      await onCreate({
        name: trimmed,
        layout: layoutChoice(),
        mode,
        serverHost: serverHost.trim(),
        serverPort: Number(serverPort),
        uiPort: Number(uiPort),
        simpleModeMax: Number(simpleModeMax)
      });
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size='sm'>
          <Plus />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            {step === 0 ? 'Name it and choose a layout.' : 'Run mode and network.'}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4 px-6 py-2'>
          {step === 0 ? (
            <>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='wg-name'>Project name</Label>
                <Input
                  id='wg-name'
                  autoFocus
                  value={name}
                  placeholder='nova-ring'
                  onChange={(e) => setName(e.target.value)}
                />
                {name !== '' && nameError && (
                  <span className='text-destructive text-xs'>{nameError}</span>
                )}
              </div>

              <div className='flex flex-col gap-1.5'>
                <Label>Layout</Label>
                <Choice<Shape>
                  value={shape}
                  onChange={setShape}
                  options={[
                    { value: 'preset', label: 'Preset' },
                    { value: 'grid', label: 'Grid' },
                    { value: 'ring', label: 'Ring' },
                    { value: 'annulus', label: 'Ring w/ hole' },
                    { value: 'rings', label: 'Concentric rings' },
                    { value: 'filledRing', label: 'Filled ring' }
                  ]}
                />
              </div>

              {shape === 'preset' && (
                <div className='flex flex-col gap-1.5'>
                  <Label>Preset</Label>
                  <Choice<string>
                    value={preset}
                    onChange={setPreset}
                    options={presets.map((p) => ({ value: p, label: p }))}
                  />
                </div>
              )}
              {shape === 'grid' && (
                <div className='flex gap-4'>
                  <NumberField id='wg-cols' label='Columns' value={cols} onChange={setCols} />
                  <NumberField id='wg-rows' label='Rows' value={rows} onChange={setRows} />
                </div>
              )}
              {(shape === 'ring' || shape === 'filledRing') && (
                <NumberField id='wg-count' label='Cannons' value={count} onChange={setCount} />
              )}
              {shape === 'annulus' && (
                <div className='flex gap-4'>
                  <NumberField id='wg-count' label='Cannons' value={count} onChange={setCount} />
                  <div className='flex flex-col gap-1.5'>
                    <Label htmlFor='wg-inner'>Hole size (0–1)</Label>
                    <Input
                      id='wg-inner'
                      inputMode='decimal'
                      value={innerRadius}
                      onChange={(e) => setInnerRadius(e.target.value)}
                      className='w-32'
                    />
                  </div>
                </div>
              )}
              {shape === 'rings' && (
                <div className='flex flex-col gap-1.5'>
                  <Label htmlFor='wg-rings'>Cannons per ring, outermost first</Label>
                  <Input
                    id='wg-rings'
                    value={ringCounts}
                    placeholder='12,8,4,1'
                    onChange={(e) => setRingCounts(e.target.value)}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className='flex flex-col gap-1.5'>
                <Label>Run mode</Label>
                <Choice<NewProjectInput['mode']>
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'simple', label: 'Simple' },
                    { value: 'distributed', label: 'Distributed' }
                  ]}
                />
                <span className='text-muted-foreground text-xs'>
                  Auto picks simple below {simpleModeMax || 40} cannons, distributed above.
                </span>
              </div>
              <div className='flex flex-wrap gap-4'>
                <div className='flex flex-col gap-1.5'>
                  <Label htmlFor='wg-host'>Server host</Label>
                  <Input
                    id='wg-host'
                    value={serverHost}
                    onChange={(e) => setServerHost(e.target.value)}
                    className='w-40'
                  />
                </div>
                <NumberField
                  id='wg-port'
                  label='Server port'
                  value={serverPort}
                  onChange={setServerPort}
                />
                <NumberField id='wg-uiport' label='UI port' value={uiPort} onChange={setUiPort} />
                <NumberField
                  id='wg-simplemax'
                  label='Simple ≤'
                  value={simpleModeMax}
                  onChange={setSimpleModeMax}
                />
              </div>
            </>
          )}
          {error && <span className='text-destructive text-sm'>{error}</span>}
        </div>

        <DialogFooter>
          {step === 1 && (
            <Button variant='outline' onClick={() => setStep(0)} disabled={busy}>
              <ArrowLeft />
              Back
            </Button>
          )}
          {step === 0 ? (
            <Button onClick={() => setStep(1)} disabled={!step1Valid}>
              Next
              <ArrowRight />
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy || !portsValid}>
              Create project
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
