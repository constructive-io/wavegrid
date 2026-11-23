import type { Layout } from '@wavegrid/layout/client';

import { coercePluginParams, type PluginTabData } from '@/lib/plugin-data';
import type { RegisterPluginPaint } from '@/lib/plugin-view-bridge';
import type { Look, PatternState } from '@/lib/socket-state';
import { usePluginPattern } from '@/lib/use-plugin-pattern';

import { ControlGrid, ControlGroup } from './control-grid';
import { Slider } from './controls';
import { PluginView } from './plugin-view';

const BUTTON = { background: '#12121a', border: '1px solid #292938', borderRadius: 8, padding: '8px 12px', color: '#d0d0df', fontSize: 13 };

export function PluginTab({ pluginId, tab, presetsFile, send, pattern, onPatternSelect, layout, looks, registerPluginPaint }: {
  pluginId: string;
  tab: PluginTabData;
  presetsFile?: string;
  send: (message: Record<string, unknown>) => void;
  pattern: PatternState | null;
  onPatternSelect: (id: string) => void;
  layout: Layout;
  looks: Look[];
  registerPluginPaint: RegisterPluginPaint;
}) {
  const state = usePluginPattern(pluginId, tab, presetsFile, send, pattern, onPatternSelect);
  const displayed = coercePluginParams(tab.cards.flatMap(card => card.controls), state.params);
  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: state.running ? '#6bdfad' : '#888898' }}>
        {state.loading ? 'Loading pattern…' : !state.ready ? 'Pattern unavailable' : state.running ? 'Running' : 'Ready — change a control or press Start'}
      </p>
      {state.errors.map(error => <p key={error} role="alert" className="text-sm" style={{ color: '#ff8888' }}>{error}</p>)}
      {tab.view && <PluginView pluginId={pluginId} tab={tab} layout={layout} looks={looks} pattern={pattern}
        state={state} send={send} registerPluginPaint={registerPluginPaint} />}
      <ControlGrid minCellWidth={260} gap={16}>
        {tab.cards.map((card, index) => (
          <fieldset key={index} disabled={!state.ready} className="space-y-3 rounded-xl p-4" style={{ background: '#101018', border: '1px solid #1a1a25', minWidth: 0 }}>
            <ControlGroup label={card.title}>
              {card.controls.map((control, i) => {
                if (control.type === 'button') return (
                  <button key={i} type="button" style={BUTTON} className="disabled:opacity-40 active:scale-95"
                    disabled={control.action === 'stop' && !state.running}
                    onClick={control.action === 'start' ? state.start : state.stop}>{control.label}</button>
                );
                const value = displayed[control.param];
                const update = (next: unknown) => state.apply({ [control.param]: next });
                const label = control.label ?? control.param;
                if (control.type === 'slider') return <Slider key={i} label={label} value={value as number} min={control.min} max={control.max}
                  step={control.step} displayValue={String(value)} onChange={update} />;
                return (
                  <label key={i} className="flex items-center justify-between gap-3 text-sm" style={{ color: '#aaaaba' }}>
                    <span>{label}</span>
                    {control.type === 'toggle' ? <input type="checkbox" checked={value === true} onChange={e => update(e.target.checked)} style={{ accentColor: '#4a7cff', width: 18, height: 18 }} />
                      : control.type === 'color' ? <input type="color" value={value as string} onChange={e => update(e.target.value)} style={{ width: 48, height: 30 }} />
                        : <select value={String(control.options.findIndex(option => option.value === value))} onChange={e => update(control.options[Number(e.target.value)].value)} style={BUTTON}>
                          {control.options.map((option, n) => <option key={n} value={n}>{option.label}</option>)}
                        </select>}
                  </label>
                );
              })}
            </ControlGroup>
          </fieldset>
        ))}
        {presetsFile && <div className="rounded-xl p-4 space-y-3" style={{ background: '#101018', border: '1px solid #1a1a25' }}>
          <ControlGroup label="Presets">
            <div className="flex flex-wrap gap-2">
              {state.presets.map((preset, i) => <button key={i} type="button" disabled={!state.ready} style={BUTTON}
                className="disabled:opacity-40 active:scale-95" onClick={() => state.apply(preset.params)}>{preset.name}</button>)}
            </div>
          </ControlGroup>
        </div>}
      </ControlGrid>
    </div>
  );
}
